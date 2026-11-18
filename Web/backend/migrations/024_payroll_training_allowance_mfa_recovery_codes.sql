-- Migration 024: a column and a table the backend writes that no migration created
-- Idempotent.

-- 1. payroll_items.training_allowance — PayrollService.calculateAllowances stores the
--    training allowance (NĐ 72/2020) and both payroll exports read it.
ALTER TABLE payroll_items
  ADD COLUMN IF NOT EXISTS training_allowance DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- 2. mfa_recovery_codes — AuthService.setupMfa stores hashed one-time recovery codes.
--    Only the development seeder created this table before, so production had none.
CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash  TEXT        NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Databases where the seeder created the table without these
ALTER TABLE mfa_recovery_codes
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_unused
  ON mfa_recovery_codes(user_id) WHERE used_at IS NULL;
