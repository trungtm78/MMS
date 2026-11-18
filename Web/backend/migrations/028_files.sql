-- Migration 028: uploads as records, what they attach to, task reports, retired leave types
-- (T20: gaps reported by the mobile clients)
-- Idempotent.
--
-- 1. files (003, 014) records every upload. POST /files/upload answers the row's id, which
--    task reports, work reports and official documents then reference:
--      uploaded_by    the owner, the only user who may attach the file to a record
--      storage_key    server-generated UUID naming the stored content, never a client name
--      original_name  the client's file name, offered again on download
--      mime_type      the type the content was verified to be
--      size           bytes
--      checksum       SHA-256 of the content, lowercase hex
--      category       the purpose declared on upload: general, or the kind of record
--      related_type,  the one record the file is attached to, NULL while unattached. Set once,
--      related_id     in the transaction that links the file, so a file never serves two
--                     records and who may read it follows from that record.
--    The checks are NOT VALID: they hold for every row written from now on without failing
--    on rows from before (no API wrote any; a hand-made row is left as it is).
COMMENT ON COLUMN files.uploaded_by IS 'Owner: the user who uploaded the file';
COMMENT ON COLUMN files.storage_key IS 'Server-generated UUID naming the stored content';
COMMENT ON COLUMN files.checksum IS 'SHA-256 of the content, lowercase hex';
COMMENT ON COLUMN files.category IS 'Purpose declared on upload: general, task_report, work_report, official_document';
COMMENT ON COLUMN files.related_type IS 'Kind of record the file is attached to; NULL while unattached';
COMMENT ON COLUMN files.related_id IS 'Record the file is attached to; NULL while unattached';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_files_size') THEN
    ALTER TABLE files ADD CONSTRAINT chk_files_size CHECK (size >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_files_checksum_sha256') THEN
    ALTER TABLE files ADD CONSTRAINT chk_files_checksum_sha256
      CHECK (checksum IS NULL OR checksum ~ '^[0-9a-f]{64}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_files_category') THEN
    ALTER TABLE files ADD CONSTRAINT chk_files_category
      CHECK (category IN ('general', 'task_report', 'work_report', 'official_document')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_files_related') THEN
    ALTER TABLE files ADD CONSTRAINT chk_files_related
      CHECK ((related_type IS NULL AND related_id IS NULL)
             OR (related_type IN ('task_report', 'work_report', 'official_document')
                 AND related_id IS NOT NULL)) NOT VALID;
  END IF;
END $$;

-- One row per stored object
CREATE UNIQUE INDEX IF NOT EXISTS uq_files_storage_key ON files(storage_key);
-- Uploads never attached to a record, oldest first, for a job removing abandoned uploads
CREATE INDEX IF NOT EXISTS idx_files_unattached ON files(created_at) WHERE related_id IS NULL;

-- 2. task_reports: POST /tasks/:id/report wrote to a table no migration created. A report is
--    the assignee's account of completing a task; its photos are uploaded files, in order.
CREATE TABLE IF NOT EXISTS task_reports (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id        UUID         NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    submitted_by   UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    description    TEXT         NOT NULL,
    completed_at   TIMESTAMPTZ,
    location       VARCHAR(200),
    audio_note_url TEXT,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_reports_task ON task_reports(task_id, created_at DESC);

-- 3. Attachments as link tables rather than id arrays on the record: foreign keys keep every
--    id pointing at a stored file, file_id is unique so a file serves one record, position
--    keeps the order the author chose (at most 10: 0-9), and a file's record is found by index.
CREATE TABLE IF NOT EXISTS task_report_photos (
    task_report_id UUID         NOT NULL REFERENCES task_reports(id) ON DELETE CASCADE,
    file_id        UUID         NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
    position       SMALLINT     NOT NULL CHECK (position BETWEEN 0 AND 9),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (task_report_id, file_id),
    CONSTRAINT uq_task_report_photos_position UNIQUE (task_report_id, position),
    CONSTRAINT uq_task_report_photos_file UNIQUE (file_id)
);

CREATE TABLE IF NOT EXISTS work_report_attachments (
    work_report_id UUID         NOT NULL REFERENCES work_reports(id) ON DELETE CASCADE,
    file_id        UUID         NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
    position       SMALLINT     NOT NULL CHECK (position BETWEEN 0 AND 9),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (work_report_id, file_id),
    CONSTRAINT uq_work_report_attachments_position UNIQUE (work_report_id, position),
    CONSTRAINT uq_work_report_attachments_file UNIQUE (file_id)
);

-- 4. leave_types.is_active: GET /leave/types offers active types only, and a new request may
--    not use a retired one. Requests already filed keep their type.
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- CREATE INDEX IF NOT EXISTS keeps any existing relation of that name, whatever it indexes
-- (see 019): compare each index above with the definition pg_get_indexdef() prints for it.
DO $$
DECLARE
  expected CONSTANT jsonb := '{
    "uq_files_storage_key":
      "CREATE UNIQUE INDEX uq_files_storage_key ON public.files USING btree (storage_key)",
    "idx_files_unattached":
      "CREATE INDEX idx_files_unattached ON public.files USING btree (created_at) WHERE (related_id IS NULL)",
    "idx_task_reports_task":
      "CREATE INDEX idx_task_reports_task ON public.task_reports USING btree (task_id, created_at DESC)"
  }';
  problems text[] := '{}';
  index_name text;
  declared text;
  actual text;
  valid boolean;
BEGIN
  FOR index_name, declared IN SELECT key, value FROM jsonb_each_text(expected) ORDER BY key LOOP
    actual := NULL;
    SELECT pg_get_indexdef(i.indexrelid), i.indisvalid
      INTO actual, valid
    FROM pg_index i
    WHERE i.indexrelid = to_regclass(format('public.%I', index_name));
    IF actual IS NULL THEN
      problems := problems || format('%s exists but is not an index', index_name);
    ELSIF actual <> declared THEN
      problems := problems || format('%s is %s, expected %s', index_name, actual, declared);
    ELSIF NOT valid THEN
      problems := problems || format(
        '%s is invalid, as an interrupted CREATE INDEX CONCURRENTLY leaves it', index_name);
    END IF;
  END LOOP;

  IF cardinality(problems) > 0 THEN
    RAISE EXCEPTION 'Migration 028: existing indexes differ from this migration: %; drop or rename them before applying it',
      array_to_string(problems, '; ');
  END IF;
END $$;
