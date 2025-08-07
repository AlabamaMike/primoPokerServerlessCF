-- Moderation Actions Table
CREATE TABLE IF NOT EXISTS moderation_actions (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('WARNING', 'MUTE', 'SHADOW_BAN', 'BAN')),
  reason TEXT NOT NULL,
  applied_by TEXT NOT NULL,
  applied_at INTEGER NOT NULL,
  expires_at INTEGER,
  metadata TEXT, -- JSON stored as text
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'REVOKED'))
);

-- Create indexes for moderation actions
CREATE INDEX idx_moderation_actions_player_id ON moderation_actions(player_id);
CREATE INDEX idx_moderation_actions_status ON moderation_actions(status);
CREATE INDEX idx_moderation_actions_expires_at ON moderation_actions(expires_at);
CREATE INDEX idx_moderation_actions_type ON moderation_actions(type);

-- Message Reports Table
CREATE TABLE IF NOT EXISTS message_reports (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  player_id TEXT NOT NULL, -- The player who sent the reported message
  reported_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  reported_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'AUTO_ACTIONED')),
  reviewed_by TEXT,
  reviewed_at INTEGER,
  action_taken TEXT CHECK (action_taken IN ('WARNING', 'MUTE', 'SHADOW_BAN', 'BAN')),
  notes TEXT,
  metadata TEXT, -- JSON stored as text
  
  -- Prevent duplicate reports from same user
  UNIQUE(message_id, reported_by)
);

-- Create indexes for message reports
CREATE INDEX idx_message_reports_message_id ON message_reports(message_id);
CREATE INDEX idx_message_reports_player_id ON message_reports(player_id);
CREATE INDEX idx_message_reports_reported_by ON message_reports(reported_by);
CREATE INDEX idx_message_reports_status ON message_reports(status);
CREATE INDEX idx_message_reports_reported_at ON message_reports(reported_at);

-- Moderation Settings Table
CREATE TABLE IF NOT EXISTS moderation_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  auto_action_threshold INTEGER NOT NULL DEFAULT 3,
  review_required_threshold INTEGER NOT NULL DEFAULT 2,
  false_report_penalty_threshold INTEGER NOT NULL DEFAULT 5,
  report_cooldown_ms INTEGER NOT NULL DEFAULT 60000,
  warning_escalation_threshold INTEGER NOT NULL DEFAULT 3,
  default_mute_duration_ms INTEGER NOT NULL DEFAULT 300000, -- 5 minutes
  repeat_mute_duration_ms INTEGER NOT NULL DEFAULT 1800000, -- 30 minutes
  caps_threshold REAL NOT NULL DEFAULT 0.7,
  spam_threshold INTEGER NOT NULL DEFAULT 5,
  max_message_length INTEGER NOT NULL DEFAULT 500,
  min_message_length INTEGER NOT NULL DEFAULT 1,
  allowed_emojis INTEGER NOT NULL DEFAULT 1, -- boolean as integer
  allowed_links INTEGER NOT NULL DEFAULT 0, -- boolean as integer
  profanity_filter_enabled INTEGER NOT NULL DEFAULT 1, -- boolean as integer
  ai_toxicity_enabled INTEGER NOT NULL DEFAULT 0, -- boolean as integer
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Insert default moderation settings
INSERT INTO moderation_settings (id) VALUES ('default') ON CONFLICT DO NOTHING;

-- Banned Words Table
CREATE TABLE IF NOT EXISTS banned_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL UNIQUE,
  severity TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH')),
  added_by TEXT NOT NULL,
  added_at INTEGER NOT NULL DEFAULT (unixepoch()),
  active INTEGER NOT NULL DEFAULT 1 -- boolean as integer
);

-- Create index for banned words
CREATE INDEX idx_banned_words_active ON banned_words(active);

-- Player Moderation Stats View
CREATE VIEW IF NOT EXISTS player_moderation_stats AS
SELECT 
  p.id AS player_id,
  p.username,
  COUNT(DISTINCT ma.id) FILTER (WHERE ma.type = 'WARNING') AS warnings_count,
  COUNT(DISTINCT ma.id) FILTER (WHERE ma.type = 'MUTE') AS mutes_count,
  COUNT(DISTINCT ma.id) FILTER (WHERE ma.type = 'SHADOW_BAN') AS shadow_bans_count,
  COUNT(DISTINCT ma.id) FILTER (WHERE ma.type = 'BAN') AS bans_count,
  COUNT(DISTINCT mr.id) FILTER (WHERE mr.status = 'APPROVED') AS approved_reports_received,
  COUNT(DISTINCT mr.id) FILTER (WHERE mr.status = 'REJECTED') AS rejected_reports_received,
  COUNT(DISTINCT mr2.id) FILTER (WHERE mr2.status = 'APPROVED') AS approved_reports_made,
  COUNT(DISTINCT mr2.id) FILTER (WHERE mr2.status = 'REJECTED') AS rejected_reports_made,
  MAX(ma.applied_at) AS last_action_at,
  EXISTS(
    SELECT 1 FROM moderation_actions ma2 
    WHERE ma2.player_id = p.id 
    AND ma2.type IN ('BAN', 'SHADOW_BAN') 
    AND ma2.status = 'ACTIVE'
  ) AS is_restricted
FROM players p
LEFT JOIN moderation_actions ma ON p.id = ma.player_id
LEFT JOIN message_reports mr ON p.id = mr.player_id
LEFT JOIN message_reports mr2 ON p.id = mr2.reported_by
GROUP BY p.id, p.username;

-- Active Restrictions View
CREATE VIEW IF NOT EXISTS active_player_restrictions AS
SELECT 
  ma.player_id,
  ma.type,
  ma.reason,
  ma.applied_at,
  ma.expires_at,
  CASE 
    WHEN ma.type = 'BAN' THEN 0
    ELSE 1
  END AS can_join_tables,
  CASE 
    WHEN ma.type IN ('MUTE', 'BAN') THEN 0
    ELSE 1
  END AS can_send_messages,
  CASE 
    WHEN ma.type IN ('SHADOW_BAN', 'BAN') THEN 0
    ELSE 1
  END AS messages_visible_to_others
FROM moderation_actions ma
WHERE ma.status = 'ACTIVE'
  AND (ma.expires_at IS NULL OR ma.expires_at > unixepoch());