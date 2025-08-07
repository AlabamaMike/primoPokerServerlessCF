-- Migration 0004: Chat Performance Indexes and Schema Updates

-- Add missing columns from repository implementation
ALTER TABLE chat_messages 
ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'chat' 
CHECK (message_type IN ('chat', 'system', 'command'));

ALTER TABLE chat_messages 
ADD COLUMN IF NOT EXISTS username TEXT;

ALTER TABLE chat_messages 
ADD COLUMN IF NOT EXISTS updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add composite index for chat message history queries
-- This optimizes queries filtering by table_id and ordering by created_at
CREATE INDEX IF NOT EXISTS idx_chat_messages_table_created 
ON chat_messages (table_id, created_at DESC);

-- Add index for tournament chat queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_tournament_created 
ON chat_messages (tournament_id, created_at DESC);

-- Add index for player message queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_player_created 
ON chat_messages (player_id, created_at DESC);

-- Add index for moderation queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_moderated 
ON chat_messages (is_moderated, created_at DESC) 
WHERE is_moderated = TRUE;

-- Add partial index for active (non-deleted) messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_active 
ON chat_messages (table_id, created_at DESC) 
WHERE is_deleted = FALSE;

-- Add index for message type if column exists (for future use)
-- Note: message_type column is defined in the repository but not in the current schema
-- This can be added when the column is migrated