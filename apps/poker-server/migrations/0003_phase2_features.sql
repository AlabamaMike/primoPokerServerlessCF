-- Migration 0003: Phase 2 Features - Wallet, Chat, Preferences, and Statistics

-- Wallet transactions table for tracking all financial movements
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'bet', 'win', 'refund', 'rebuy', 'transfer', 'bonus')),
    balance_before INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    table_id TEXT,
    game_id TEXT,
    transaction_ref TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players (id),
    FOREIGN KEY (table_id) REFERENCES table_configs (id),
    FOREIGN KEY (game_id) REFERENCES games (game_id)
);

-- Chat messages table with moderation support
CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    table_id TEXT,
    tournament_id TEXT,
    message TEXT NOT NULL,
    is_moderated BOOLEAN NOT NULL DEFAULT FALSE,
    moderation_reason TEXT,
    moderated_by TEXT,
    moderated_at DATETIME,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players (id),
    FOREIGN KEY (table_id) REFERENCES table_configs (id),
    FOREIGN KEY (tournament_id) REFERENCES tournaments (id)
);

-- User preferences for personalized settings
CREATE TABLE IF NOT EXISTS user_preferences (
    player_id TEXT PRIMARY KEY,
    theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('light', 'dark', 'auto')),
    sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    auto_rebuy BOOLEAN NOT NULL DEFAULT FALSE,
    auto_rebuy_threshold INTEGER NOT NULL DEFAULT 50,
    show_statistics BOOLEAN NOT NULL DEFAULT TRUE,
    four_color_deck BOOLEAN NOT NULL DEFAULT FALSE,
    show_fold_button BOOLEAN NOT NULL DEFAULT TRUE,
    auto_muck_losing BOOLEAN NOT NULL DEFAULT FALSE,
    sit_out_next_bb BOOLEAN NOT NULL DEFAULT FALSE,
    time_zone TEXT NOT NULL DEFAULT 'UTC',
    language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'es', 'fr', 'de', 'pt', 'ja', 'zh')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players (id)
);

-- Player statistics for tracking performance
CREATE TABLE IF NOT EXISTS player_statistics (
    player_id TEXT PRIMARY KEY,
    hands_played INTEGER NOT NULL DEFAULT 0,
    hands_won INTEGER NOT NULL DEFAULT 0,
    total_winnings INTEGER NOT NULL DEFAULT 0,
    total_losses INTEGER NOT NULL DEFAULT 0,
    biggest_pot_won INTEGER NOT NULL DEFAULT 0,
    biggest_loss INTEGER NOT NULL DEFAULT 0,
    favorite_hand TEXT,
    total_rake_paid INTEGER NOT NULL DEFAULT 0,
    tournaments_played INTEGER NOT NULL DEFAULT 0,
    tournaments_won INTEGER NOT NULL DEFAULT 0,
    best_tournament_finish INTEGER,
    total_tournament_winnings INTEGER NOT NULL DEFAULT 0,
    vpip_count INTEGER NOT NULL DEFAULT 0,
    pfr_count INTEGER NOT NULL DEFAULT 0,
    three_bet_count INTEGER NOT NULL DEFAULT 0,
    fold_to_three_bet_count INTEGER NOT NULL DEFAULT 0,
    showdown_count INTEGER NOT NULL DEFAULT 0,
    showdown_won_count INTEGER NOT NULL DEFAULT 0,
    all_in_count INTEGER NOT NULL DEFAULT 0,
    all_in_won_count INTEGER NOT NULL DEFAULT 0,
    bluff_count INTEGER NOT NULL DEFAULT 0,
    successful_bluff_count INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players (id)
);

-- Create indexes for wallet_transactions
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_player_id ON wallet_transactions (player_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_table_id ON wallet_transactions (table_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_game_id ON wallet_transactions (game_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_status ON wallet_transactions (status);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type ON wallet_transactions (type);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions (created_at);

-- Create indexes for chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_player_id ON chat_messages (player_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_table_id ON chat_messages (table_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_tournament_id ON chat_messages (tournament_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_is_moderated ON chat_messages (is_moderated);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages (created_at);

-- Create indexes for user_preferences
CREATE INDEX IF NOT EXISTS idx_user_preferences_updated_at ON user_preferences (updated_at);

-- Create indexes for player_statistics
CREATE INDEX IF NOT EXISTS idx_player_statistics_hands_played ON player_statistics (hands_played);
CREATE INDEX IF NOT EXISTS idx_player_statistics_total_winnings ON player_statistics (total_winnings);
CREATE INDEX IF NOT EXISTS idx_player_statistics_tournaments_won ON player_statistics (tournaments_won);
CREATE INDEX IF NOT EXISTS idx_player_statistics_updated_at ON player_statistics (updated_at);