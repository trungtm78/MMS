-- Migration 021: work reports get a title, reporting period and a review workflow
-- (pending → approved | rejected with a note). The author column becomes created_by and
-- review_status replaces the old two-state status column. Idempotent.

DO $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'work_reports' AND column_name = 'user_id'
     )
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'work_reports' AND column_name = 'created_by'
     ) THEN
    ALTER TABLE work_reports RENAME COLUMN user_id TO created_by;
  END IF;
END $$;

ALTER TABLE work_reports ADD COLUMN IF NOT EXISTS title         VARCHAR(255);
ALTER TABLE work_reports ADD COLUMN IF NOT EXISTS period        VARCHAR(20);
ALTER TABLE work_reports ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE work_reports ADD COLUMN IF NOT EXISTS review_note   TEXT;

-- Carry the old pending/reviewed state over, then drop it so there is one source of truth
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'work_reports' AND column_name = 'status'
  ) THEN
    UPDATE work_reports SET review_status = 'approved'
    WHERE status = 'reviewed' AND review_status = 'pending';
    ALTER TABLE work_reports DROP COLUMN status;
  END IF;
END $$;

UPDATE work_reports SET title = LEFT(content, 255) WHERE title IS NULL;
ALTER TABLE work_reports ALTER COLUMN title SET NOT NULL;

-- Added and validated in one step: the runner applies each file in one transaction, so
-- NOT VALID + VALIDATE would hold the same ACCESS EXCLUSIVE lock until commit anyway
ALTER TABLE work_reports DROP CONSTRAINT IF EXISTS work_reports_review_status_check;
ALTER TABLE work_reports ADD CONSTRAINT work_reports_review_status_check
  CHECK (review_status IN ('pending', 'approved', 'rejected'));

-- No query filters on the three-valued review status alone; an index there only costs writes
-- (dropped where an earlier draft of this migration created it)
DROP INDEX IF EXISTS idx_work_reports_review_status;
