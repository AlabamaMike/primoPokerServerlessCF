-- Migration: Social Features
-- Description: Add tables for friends list, player notes, blocking, and player search functionality

-- Friend relationships table (bidirectional)
CREATE TABLE IF NOT EXISTS friend_relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'rejected')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(sender_id, receiver_id),
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for faster friend queries
CREATE INDEX idx_friend_relationships_sender ON friend_relationships(sender_id, status);
CREATE INDEX idx_friend_relationships_receiver ON friend_relationships(receiver_id, status);

-- Player notes table (private notes about other players)
CREATE TABLE IF NOT EXISTS player_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(author_id, subject_id),
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for faster note queries
CREATE INDEX idx_player_notes_author ON player_notes(author_id);
CREATE INDEX idx_player_notes_subject ON player_notes(subject_id);

-- Block list table
CREATE TABLE IF NOT EXISTS block_list (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blocker_id TEXT NOT NULL,
    blocked_id TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(blocker_id, blocked_id),
    FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for faster block queries
CREATE INDEX idx_block_list_blocker ON block_list(blocker_id);
CREATE INDEX idx_block_list_blocked ON block_list(blocked_id);

-- Player online status tracking
CREATE TABLE IF NOT EXISTS player_online_status (
    player_id TEXT PRIMARY KEY,
    is_online BOOLEAN NOT NULL DEFAULT FALSE,
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    current_table_id TEXT,
    FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for online status queries
CREATE INDEX idx_player_online_status ON player_online_status(is_online, last_seen);

-- Friend request notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('friend_request', 'friend_accepted', 'friend_rejected')),
    sender_id TEXT NOT NULL,
    message TEXT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for notification queries
CREATE INDEX idx_notifications_recipient ON notifications(recipient_id, is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at);

-- Full-text search index for player search
CREATE VIRTUAL TABLE IF NOT EXISTS player_search_fts USING fts5(
    player_id UNINDEXED,
    username,
    display_name
);

-- Trigger to keep search index updated
CREATE TRIGGER IF NOT EXISTS update_player_search_insert
AFTER INSERT ON users
BEGIN
    INSERT INTO player_search_fts (player_id, username, display_name)
    VALUES (NEW.id, NEW.username, NEW.displayName);
END;

CREATE TRIGGER IF NOT EXISTS update_player_search_update
AFTER UPDATE OF username, displayName ON users
BEGIN
    UPDATE player_search_fts 
    SET username = NEW.username, display_name = NEW.displayName
    WHERE player_id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_player_search_delete
AFTER DELETE ON users
BEGIN
    DELETE FROM player_search_fts WHERE player_id = OLD.id;
END;