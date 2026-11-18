-- Migration 020: notifications use 007's model — one notification row, one receipt per
-- recipient (notification_receipts carries read state) — plus a link to the related entity.

-- Databases where 015 created a per-user notifications table instead of 007's:
-- move each row's recipient and read flag into receipts, then drop the per-user columns.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS payload_json JSONB;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES users(id) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS notification_receipts (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        delivered_at    TIMESTAMP WITH TIME ZONE,
        read_at         TIMESTAMP WITH TIME ZONE,
        UNIQUE (notification_id, user_id)
    );

    -- 015's created_at is nullable; a row without one was delivered no later than now
    INSERT INTO notification_receipts (notification_id, user_id, delivered_at, read_at)
    SELECT id, user_id, COALESCE(created_at, now()),
           CASE WHEN is_read THEN COALESCE(created_at, now()) END
    FROM notifications
    ON CONFLICT (notification_id, user_id) DO NOTHING;

    DROP INDEX IF EXISTS idx_notifications_user_read;
    ALTER TABLE notifications DROP COLUMN user_id;
    ALTER TABLE notifications DROP COLUMN IF EXISTS is_read;
  END IF;
END $$;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_type VARCHAR(100);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_id UUID;

-- The inbox is ordered by delivery time, so every receipt has one: a receipt is delivered
-- when it is created, and older receipts without one were delivered with their notification
ALTER TABLE notification_receipts ALTER COLUMN delivered_at SET DEFAULT now();
UPDATE notification_receipts r
SET delivered_at = COALESCE(n.created_at, now())
FROM notifications n
WHERE n.id = r.notification_id AND r.delivered_at IS NULL;
ALTER TABLE notification_receipts ALTER COLUMN delivered_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_receipts_user_read
  ON notification_receipts(user_id, read_at);
-- A user's inbox, newest first, with a stable order across pages
CREATE INDEX IF NOT EXISTS idx_notification_receipts_user_delivered
  ON notification_receipts(user_id, delivered_at DESC, id DESC);
-- 007's user_id index is a prefix of both indexes above
DROP INDEX IF EXISTS idx_notification_receipts_user;
CREATE INDEX IF NOT EXISTS idx_notifications_entity
  ON notifications(entity_type, entity_id);
