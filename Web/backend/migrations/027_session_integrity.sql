-- Migration 027: session integrity (Codex review round 3)
-- Idempotent.
--
-- 1. users.auth_version — bumped whenever an account's status, roles, password or MFA
--    changes. Access tokens carry the version they were issued under (ver) and the
--    session they belong to (sid); either mismatch refuses the token immediately.
--    Tokens issued before this migration carry neither claim and stop working: clients
--    sign in again once.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_version BIGINT NOT NULL DEFAULT 0;

-- 2. Per-account MFA failure count, updated under the user row lock so concurrent
--    attempts on several challenges cannot exceed the limit.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_failed_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_locked_until TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_mfa_failed_count'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT chk_users_mfa_failed_count CHECK (mfa_failed_count >= 0);
  END IF;
END $$;

-- 3. sessions — the account version and authentication methods a session was created
--    with (refresh keeps both, and refuses sessions weaker than the account now
--    requires), and the session that replaced it on rotation, so presenting a rotated
--    refresh token is recognised as reuse.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS auth_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS amr TEXT[] NOT NULL DEFAULT ARRAY['pwd']::text[];
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS replaced_by UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_sessions_replaced_by'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT fk_sessions_replaced_by
      FOREIGN KEY (replaced_by) REFERENCES sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Every request checks its session by id (primary key); revocation scans a user's open ones
CREATE INDEX IF NOT EXISTS idx_sessions_user_open
  ON sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_replaced_by
  ON sessions(replaced_by) WHERE replaced_by IS NOT NULL;
