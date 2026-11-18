-- Migration 035: announce ended sessions and changed accounts (AuthRevocationFeed)
-- Idempotent.
--
-- The realtime gateway keeps sockets in rooms that receive server pushes (live GPS
-- positions, unit notifications) without the client emitting anything, so it must learn
-- when a session ends. Triggers send a notification on channel mms_auth_revocation for
-- every way a session can end or an account change, whatever code (or operator) made the
-- change, and Postgres delivers it only once the change commits.
--
-- Payloads (JSON):
--   {"kind":"session","userId":<uuid>,"sessionId":<uuid>}
--       a session was revoked or deleted. A rotation (refresh: revoked_at and replaced_by
--       set together) continues the session under a new id and is not announced.
--   {"kind":"account","userId":<uuid>,"version":<auth_version>,"active":<boolean>}
--       an account's auth_version or status changed: tokens of another version, and every
--       token of an account that is not active, stop working (AuthStateService).

CREATE OR REPLACE FUNCTION notify_session_ended() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.revoked_at IS NULL THEN
      PERFORM pg_notify('mms_auth_revocation', json_build_object(
        'kind', 'session', 'userId', OLD.user_id, 'sessionId', OLD.id)::text);
    END IF;
  ELSIF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
        AND NEW.replaced_by IS NULL THEN
    PERFORM pg_notify('mms_auth_revocation', json_build_object(
      'kind', 'session', 'userId', NEW.user_id, 'sessionId', NEW.id)::text);
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION notify_account_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.auth_version IS DISTINCT FROM OLD.auth_version
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM pg_notify('mms_auth_revocation', json_build_object(
      'kind', 'account', 'userId', NEW.id,
      'version', NEW.auth_version, 'active', NEW.status = 'active')::text);
  END IF;
  RETURN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.sessions'::regclass
      AND tgname = 'trg_sessions_notify_ended'
  ) THEN
    CREATE TRIGGER trg_sessions_notify_ended
      AFTER UPDATE OF revoked_at OR DELETE ON sessions
      FOR EACH ROW EXECUTE FUNCTION notify_session_ended();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.users'::regclass
      AND tgname = 'trg_users_notify_account_changed'
  ) THEN
    CREATE TRIGGER trg_users_notify_account_changed
      AFTER UPDATE OF auth_version, status ON users
      FOR EACH ROW EXECUTE FUNCTION notify_account_changed();
  END IF;
END $$;
