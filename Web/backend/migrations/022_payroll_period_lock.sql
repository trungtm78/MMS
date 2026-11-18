-- Migration 022: payroll period locking
-- 013 moved payroll_periods.status to draft | review | locked, but the lock workflow
-- (PayrollService.lockPeriod / listPeriods) also records who locked a period and when,
-- and those columns were never created. Idempotent.
ALTER TABLE payroll_periods
  ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE payroll_periods
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

-- Periods locked before the column existed take their last change as the lock time,
-- so the invariant below holds for every row and can be validated
UPDATE payroll_periods
SET locked_at = COALESCE(updated_at, created_at)
WHERE status = 'locked' AND locked_at IS NULL;

-- A locked period must say when it was locked
ALTER TABLE payroll_periods DROP CONSTRAINT IF EXISTS chk_payroll_periods_locked_at;
ALTER TABLE payroll_periods ADD CONSTRAINT chk_payroll_periods_locked_at
  CHECK (status <> 'locked' OR locked_at IS NOT NULL);
