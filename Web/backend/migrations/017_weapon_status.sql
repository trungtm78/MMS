-- Migration 017: Add status column to weapons for soft-delete (retire)
-- No-op while weapons does not exist; 019 creates the table with this column and indexes.
DO $$
BEGIN
  IF to_regclass('public.weapons') IS NOT NULL THEN
    ALTER TABLE weapons
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'retired', 'maintenance'));

    CREATE INDEX IF NOT EXISTS idx_weapons_status ON weapons(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_weapons_serial ON weapons(serial_number)
      WHERE serial_number IS NOT NULL AND serial_number != '';
  END IF;
END $$;
