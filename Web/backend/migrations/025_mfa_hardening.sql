-- Migration 025: MFA hardening
-- Idempotent.

-- 1. auth_challenges — one row per login (verify) or enrolment (setup) challenge. The
--    client holds "<id>.<secret>"; only an HMAC of the secret is stored. A setup
--    challenge carries the encrypted TOTP secret until the first code confirms it, so
--    an unconfirmed enrolment never overwrites the account's secret.
CREATE TABLE IF NOT EXISTS auth_challenges (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose             VARCHAR(16) NOT NULL,
    secret_hash         CHAR(64)    NOT NULL,
    pending_totp_secret TEXT,
    attempts            SMALLINT    NOT NULL DEFAULT 0,
    expires_at          TIMESTAMPTZ NOT NULL,
    consumed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_auth_challenges_purpose'
  ) THEN
    ALTER TABLE auth_challenges
      ADD CONSTRAINT chk_auth_challenges_purpose CHECK (purpose IN ('verify', 'setup'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_auth_challenges_attempts'
  ) THEN
    ALTER TABLE auth_challenges
      ADD CONSTRAINT chk_auth_challenges_attempts CHECK (attempts >= 0);
  END IF;
END $$;

-- Open challenges per user (administrative reset revokes them); expiry for cleanup
CREATE INDEX IF NOT EXISTS idx_auth_challenges_user_open
  ON auth_challenges(user_id) WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires
  ON auth_challenges(expires_at);

-- 2. users — an AES-256-GCM envelope ("v1:iv:tag:ciphertext") no longer fits
--    VARCHAR(64); plaintext secrets are re-encrypted by the backend on next use.
--    totp_last_used_step blocks replay of a code inside its validity window.
ALTER TABLE users
  ALTER COLUMN totp_secret TYPE TEXT;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_last_used_step BIGINT;

-- 3. roles.mfa_required — roles whose holders must enrol before receiving tokens.
--    Off everywhere until an administrator turns it on, so existing accounts are not
--    locked out by the deployment itself.
ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS mfa_required BOOLEAN NOT NULL DEFAULT false;

-- mfa_temp_tokens (009) is no longer read or written; it is kept only so this migration
-- stays additive and is dropped by a later migration.
--
-- Deployment: this release is NOT compatible with instances of the previous build running
-- at the same time (their MFA temp tokens are not accepted here, and secrets this build
-- re-encrypts cannot be read by them). Drain every old instance before starting this one;
-- see docs/migrations.md.
COMMENT ON TABLE mfa_temp_tokens IS 'Unused since auth_challenges (025); drop in a later migration.';
