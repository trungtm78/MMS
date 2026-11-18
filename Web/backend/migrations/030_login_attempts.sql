-- Migration 030: sign-in failure counters (BR-AUTH-02)
-- Idempotent.
--
-- Replaces the cache-manager counter, which read and then wrote a value per replica, so
-- concurrent guesses and several replicas could each get past the limit. One row per
-- submitted name, updated under its row lock by LoginAttemptsService:
--   name_hash           HMAC-SHA256 (hex) of the name as typed, trimmed and lower-cased;
--                       what people typed (a password entered as the username included)
--                       is never stored
--   failed_count        failures since the counter last restarted
--   last_failure_at     the latest failure; failures older than the lock duration lapse
--   locked_until        set when failed_count reaches the limit
--   pending_count       attempts whose password is still being checked; failures plus
--                       these never exceed the limit
--   pending_updated_at  the latest slot taken; slots older than a few minutes belong to a
--                       stopped instance and are ignored
CREATE TABLE IF NOT EXISTS login_attempts (
  name_hash CHAR(64) PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  last_failure_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,
  pending_count INTEGER NOT NULL DEFAULT 0,
  pending_updated_at TIMESTAMPTZ,
  CONSTRAINT chk_login_attempts_name_hash CHECK (name_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_login_attempts_failed_count CHECK (failed_count >= 0),
  CONSTRAINT chk_login_attempts_pending_count CHECK (pending_count >= 0)
);

-- CREATE TABLE IF NOT EXISTS keeps a table of that name however it was defined: refuse
-- one that differs from the definition above instead of running against it
DO $$
DECLARE
  expected_columns CONSTANT text :=
    'failed_count integer NOT NULL DEFAULT 0, '
    'last_failure_at timestamp with time zone, '
    'locked_until timestamp with time zone, '
    'name_hash character(64) NOT NULL, '
    'pending_count integer NOT NULL DEFAULT 0, '
    'pending_updated_at timestamp with time zone';
  expected_constraints CONSTANT text :=
    'chk_login_attempts_failed_count CHECK ((failed_count >= 0)); '
    'chk_login_attempts_name_hash CHECK ((name_hash ~ ''^[0-9a-f]{64}$''::text)); '
    'chk_login_attempts_pending_count CHECK ((pending_count >= 0)); '
    'login_attempts_pkey PRIMARY KEY (name_hash)';
  found_columns text;
  found_constraints text;
BEGIN
  SELECT string_agg(
           a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
             || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
             || COALESCE(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), ''),
           ', ' ORDER BY a.attname)
    INTO found_columns
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = 'login_attempts'::regclass
     AND a.attnum > 0
     AND NOT a.attisdropped;

  SELECT string_agg(c.conname || ' ' || pg_get_constraintdef(c.oid), '; ' ORDER BY c.conname)
    INTO found_constraints
    FROM pg_constraint c
   WHERE c.conrelid = 'login_attempts'::regclass;

  IF found_columns IS DISTINCT FROM expected_columns
     OR found_constraints IS DISTINCT FROM expected_constraints THEN
    RAISE EXCEPTION
      'Migration 030: existing table login_attempts differs from this migration (columns: %; constraints: %), expected (columns: %; constraints: %); reconcile or drop it before applying',
      found_columns, found_constraints, expected_columns, expected_constraints;
  END IF;
END $$;

-- The hourly purge finds lapsed counters by their latest failure
CREATE INDEX IF NOT EXISTS idx_login_attempts_last_failure
  ON login_attempts(last_failure_at);
