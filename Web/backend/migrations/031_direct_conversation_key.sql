-- Migration 031: one direct conversation per pair of people
-- Idempotent.
--
-- Creating a direct conversation with someone who already has one with the creator returns
-- the existing conversation (as messaging apps do) instead of opening a second, empty one.
-- conversations.direct_key holds the pair's two user ids, sorted and joined by ':', on the
-- direct conversation of that pair; a unique index makes concurrent creations agree on one.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS direct_key TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_conversations_direct_key'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT chk_conversations_direct_key CHECK (
        direct_key IS NULL
        OR (
          type = 'direct'
          AND direct_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
      );
  END IF;
END $$;

-- Existing data: the oldest direct conversation of each pair becomes that pair's
-- conversation. Later duplicates keep their messages and stay reachable, without a key.
-- Ids compare byte-wise ("C" collation), the order the backend sorts them in.
WITH pairs AS (
  SELECT c.id,
         min(cp.user_id::text COLLATE "C") || ':' || max(cp.user_id::text COLLATE "C") AS pair_key,
         row_number() OVER (
           PARTITION BY min(cp.user_id::text COLLATE "C") || ':' || max(cp.user_id::text COLLATE "C")
           ORDER BY c.created_at, c.id
         ) AS pair_rank
  FROM conversations c
  JOIN conversation_participants cp ON cp.conversation_id = c.id
  WHERE c.type = 'direct'
  GROUP BY c.id, c.created_at
  HAVING count(DISTINCT cp.user_id) = 2
)
UPDATE conversations c
SET direct_key = p.pair_key
FROM pairs p
WHERE c.id = p.id
  AND p.pair_rank = 1
  AND c.direct_key IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM conversations keyed WHERE keyed.direct_key = p.pair_key
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_direct_key
  ON conversations(direct_key) WHERE direct_key IS NOT NULL;
