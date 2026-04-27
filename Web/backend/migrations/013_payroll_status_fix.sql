-- Migration 013: Fix payroll_periods.status CHECK constraint
-- Previous CHECK only had: 'draft', 'processing', 'approved', 'paid'
-- Frontend types and lockPeriod plan use: 'draft', 'review', 'locked'
ALTER TABLE payroll_periods
  DROP CONSTRAINT IF EXISTS payroll_periods_status_check,
  ADD CONSTRAINT payroll_periods_status_check
    CHECK (status IN ('draft', 'review', 'locked'));
