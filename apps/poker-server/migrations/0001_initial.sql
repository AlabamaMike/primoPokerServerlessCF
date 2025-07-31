-- Migration 0001: Initial database schema for Primo Poker

-- Players table
CREATE TABLE players (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    chip_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sitting_out', 'away', 'disconnected', 'eliminated')),
    time_bank INTEGER NOT NULL DEFAULT 30,
    is_dealer BOOLEAN NOT NULL DEFAULT FALSE,
    position TEXT, -- JSON string for position data
    last_action DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tables configuration
CREATE TABLE table_configs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    game_type TEXT NOT NULL CHECK (game_type IN ('texas_holdem', 'omaha', 'omaha_hi_lo', '7_card_stud', '7_card_stud_hi_lo')),
    betting_structure TEXT NOT NULL CHECK (betting_structure IN ('limit', 'no_limit', 'pot_limit')),
    game_format TEXT NOT NULL CHECK (game_format IN ('cash', 'tournament', 'sit_n_go', 'heads_up')),
    max_players INTEGER NOT NULL CHECK (max_players BETWEEN 2 AND 10),
    min_buy_in INTEGER NOT NULL,
    max_buy_in INTEGER NOT NULL,
    small_blind INTEGER NOT NULL,
    big_blind INTEGER NOT NULL,
    ante INTEGER NOT NULL DEFAULT 0,
    time_bank INTEGER NOT NULL DEFAULT 30,
    is_private BOOLEAN NOT NULL DEFAULT FALSE,
    password_hash TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Game states
CREATE TABLE games (
    table_id TEXT NOT NULL,
    game_id TEXT PRIMARY KEY,
    phase TEXT NOT NULL CHECK (phase IN ('waiting', 'pre_flop', 'flop', 'turn', 'river', 'showdown', 'finished')),
    pot INTEGER NOT NULL DEFAULT 0,
    side_pots TEXT, -- JSON array of side pots
    community_cards TEXT, -- JSON array of cards
    current_bet INTEGER NOT NULL DEFAULT 0,
    min_raise INTEGER NOT NULL,
    active_player_id TEXT,
    dealer_id TEXT NOT NULL,
    small_blind_id TEXT NOT NULL,
    big_blind_id TEXT NOT NULL,
    hand_number INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dealer_id) REFERENCES players(id),
    FOREIGN KEY (small_blind_id) REFERENCES players(id),
    FOREIGN KEY (big_blind_id) REFERENCES players(id),
    FOREIGN KEY (active_player_id) REFERENCES players(id)
);

-- Player hands (hole cards)
CREATE TABLE player_hands (
    game_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    cards TEXT NOT NULL, -- JSON array of cards
    position INTEGER,
    is_folded BOOLEAN NOT NULL DEFAULT FALSE,
    total_bet INTEGER NOT NULL DEFAULT 0,
    last_action TEXT,
    last_action_amount INTEGER DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (game_id, player_id),
    FOREIGN KEY (game_id) REFERENCES games(game_id),
    FOREIGN KEY (player_id) REFERENCES players(id)
);

-- Hand history for audit and replay
CREATE TABLE hand_actions (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    hand_number INTEGER NOT NULL,
    player_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('fold', 'check', 'call', 'bet', 'raise', 'all_in')),
    amount INTEGER NOT NULL DEFAULT 0,
    pot_after_action INTEGER NOT NULL,
    phase TEXT NOT NULL,
    position INTEGER,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(game_id),
    FOREIGN KEY (player_id) REFERENCES players(id)
);

-- Tournaments
CREATE TABLE tournaments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    buy_in INTEGER NOT NULL,
    prize_pool INTEGER NOT NULL DEFAULT 0,
    max_players INTEGER NOT NULL,
    registered_players TEXT, -- JSON array of player IDs
    start_time DATETIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'registering' CHECK (status IN ('registering', 'starting', 'in_progress', 'final_table', 'finished', 'cancelled')),
    structure TEXT NOT NULL, -- JSON structure with blind levels
    current_level INTEGER NOT NULL DEFAULT 1,
    level_start_time DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tournament tables
CREATE TABLE tournament_tables (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL,
    table_number INTEGER NOT NULL,
    player_ids TEXT, -- JSON array of player IDs
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);

-- Sessions for authentication
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    session_data TEXT NOT NULL, -- JSON session data
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players(id)
);

-- Game statistics
CREATE TABLE game_statistics (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    games_played INTEGER NOT NULL DEFAULT 0,
    games_won INTEGER NOT NULL DEFAULT 0,
    total_winnings INTEGER NOT NULL DEFAULT 0,
    total_losses INTEGER NOT NULL DEFAULT 0,
    hands_played INTEGER NOT NULL DEFAULT 0,
    hands_won INTEGER NOT NULL DEFAULT 0,
    biggest_pot INTEGER NOT NULL DEFAULT 0,
    tournament_wins INTEGER NOT NULL DEFAULT 0,
    tournament_cashes INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players(id)
);

-- Chat messages
CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    table_id TEXT NOT NULL,
    player_id TEXT,
    username TEXT NOT NULL,
    message TEXT NOT NULL,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_players_username ON players(username);
CREATE INDEX idx_players_email ON players(email);
CREATE INDEX idx_games_table_id ON games(table_id);
CREATE INDEX idx_games_created_at ON games(created_at);
CREATE INDEX idx_player_hands_game_id ON player_hands(game_id);
CREATE INDEX idx_hand_actions_game_id_hand_number ON hand_actions(game_id, hand_number);
CREATE INDEX idx_hand_actions_player_id ON hand_actions(player_id);
CREATE INDEX idx_tournaments_status ON tournaments(status);
CREATE INDEX idx_tournaments_start_time ON tournaments(start_time);
CREATE INDEX idx_sessions_player_id ON sessions(player_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_game_statistics_player_id ON game_statistics(player_id);
CREATE INDEX idx_chat_messages_table_id ON chat_messages(table_id);
CREATE INDEX idx_chat_messages_timestamp ON chat_messages(timestamp);

-- Triggers for updated_at timestamps
CREATE TRIGGER update_players_updated_at 
    AFTER UPDATE ON players
    FOR EACH ROW
BEGIN
    UPDATE players SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER update_table_configs_updated_at 
    AFTER UPDATE ON table_configs
    FOR EACH ROW
BEGIN
    UPDATE table_configs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER update_games_updated_at 
    AFTER UPDATE ON games
    FOR EACH ROW
BEGIN
    UPDATE games SET updated_at = CURRENT_TIMESTAMP WHERE game_id = NEW.game_id;
END;

CREATE TRIGGER update_tournaments_updated_at 
    AFTER UPDATE ON tournaments
    FOR EACH ROW
BEGIN
    UPDATE tournaments SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER update_game_statistics_updated_at 
    AFTER UPDATE ON game_statistics
    FOR EACH ROW
BEGIN
    UPDATE game_statistics SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
