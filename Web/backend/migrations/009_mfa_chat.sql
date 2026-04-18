-- Migration 009: MFA (TOTP), Chat Tables, and Device Push Token
-- Created: 2026-03-08

-- Add push_token to devices table (if devices table exists from prior migration)
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Add MFA columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64),
  ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mfa_setup_at TIMESTAMP WITH TIME ZONE;

-- Recovery codes table (10 one-time codes per user)
CREATE TABLE IF NOT EXISTS recovery_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash VARCHAR(255) NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recovery_codes_user ON recovery_codes(user_id);
CREATE INDEX idx_recovery_codes_user_unused ON recovery_codes(user_id) WHERE used_at IS NULL;

-- Temp MFA tokens table (for two-step login flow: password OK → issue temp token → verify OTP)
CREATE TABLE IF NOT EXISTS mfa_temp_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mfa_temp_tokens_user ON mfa_temp_tokens(user_id);

-- Conversations table (for Chat feature: DQTV ↔ CA/KV)
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL DEFAULT 'direct' CHECK (type IN ('direct', 'group')),
    name VARCHAR(255),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Conversation participants
CREATE TABLE IF NOT EXISTS conversation_participants (
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_read_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_conv_participants_user ON conversation_participants(user_id);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    message_type VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file', 'location', 'system')),
    metadata JSONB,
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    edited_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, sent_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
