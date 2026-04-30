-- Migration 017: Add status column to weapons for soft-delete (retire)
ALTER TABLE weapons
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'retired', 'maintenance'));

CREATE INDEX IF NOT EXISTS idx_weapons_status ON weapons(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_weapons_serial ON weapons(serial_number)
  WHERE serial_number IS NOT NULL AND serial_number != '';
