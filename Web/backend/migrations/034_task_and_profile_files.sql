-- Migration 034: files attached to tasks and to militia profiles
-- Idempotent.
--
-- 028 let an upload attach to a task report, a work report or an official document. Two
-- more records carry files:
--   task             instructions a manager attaches when creating a task (POST /tasks
--                    attachmentIds); the task's creator, assignees and managers read them
--   militia_profile  documents of a member's record (certificates, decisions), attached by
--                    staff (POST /militia/:id/documents); whoever reads the profile reads them
-- The upload purpose (category) and the record kind (related_type) accept both. The checks
-- stay NOT VALID like 028's: rows written before keep whatever they hold.
DO $$
BEGIN
  ALTER TABLE files DROP CONSTRAINT IF EXISTS chk_files_category;
  ALTER TABLE files ADD CONSTRAINT chk_files_category
    CHECK (category IN ('general', 'task_report', 'work_report', 'official_document',
                        'task', 'militia_profile')) NOT VALID;

  ALTER TABLE files DROP CONSTRAINT IF EXISTS chk_files_related;
  ALTER TABLE files ADD CONSTRAINT chk_files_related
    CHECK ((related_type IS NULL AND related_id IS NULL)
           OR (related_type IN ('task_report', 'work_report', 'official_document',
                                'task', 'militia_profile')
               AND related_id IS NOT NULL)) NOT VALID;
END $$;

COMMENT ON COLUMN files.category IS
  'Purpose declared on upload: general, task_report, work_report, official_document, task, militia_profile';
