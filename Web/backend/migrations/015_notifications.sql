CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  is_read BOOLEAN DEFAULT false,
  entity_type VARCHAR(100),
  entity_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- When 007 already created notifications (broadcast rows + notification_receipts),
-- the CREATE above is skipped and there is no user_id column. Only index 015's own
-- shape; 020 reconciles both shapes onto the receipts model.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'user_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
  END IF;
END $$;
