-- Migration 032: who cancelled a task, when and why
-- Idempotent.
--
-- DELETE /tasks/:id requires a reason, which was then discarded. A cancellation now keeps it,
-- with the manager who cancelled the task and the time.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cancelled_by UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_tasks_cancelled_by'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT fk_tasks_cancelled_by
      FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  -- CancelTaskDto allows 1 to 500 characters
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_tasks_cancel_reason_length'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT chk_tasks_cancel_reason_length
      CHECK (cancel_reason IS NULL OR char_length(cancel_reason) BETWEEN 1 AND 500);
  END IF;
END $$;

-- Every foreign key is indexed, so deleting a user never scans tasks
CREATE INDEX IF NOT EXISTS idx_tasks_cancelled_by
  ON tasks(cancelled_by) WHERE cancelled_by IS NOT NULL;
