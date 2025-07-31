-- Migration 0002: Simplified schema without triggers for D1 compatibility

-- Drop existing triggers that may cause issues
DROP TRIGGER IF EXISTS update_players_updated_at;
DROP TRIGGER IF EXISTS update_table_configs_updated_at;
DROP TRIGGER IF EXISTS update_games_updated_at;
DROP TRIGGER IF EXISTS update_tournaments_updated_at;
DROP TRIGGER IF EXISTS update_game_statistics_updated_at;

-- Ensure all tables exist with correct schema
-- Players table
CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    chip_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sitting_out', 'away', 'disconnected', 'eliminated')),
    time_bank INTEGER NOT NULL DEFAULT 30,
    is_dealer BOOLEAN NOT NULL DEFAULT FALSE,
    position TEXT,
    last_action DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tables configuration
CREATE TABLE IF NOT EXISTS table_configs (
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
CREATE TABLE IF NOT EXISTS games (
    table_id TEXT NOT NULL,
    game_id TEXT PRIMARY KEY,
    phase TEXT NOT NULL CHECK (phase IN ('waiting', 'pre_flop', 'flop', 'turn', 'river', 'showdown', 'finished')),
    pot INTEGER NOT NULL DEFAULT 0,
    side_pots TEXT,
    community_cards TEXT,
    current_bet INTEGER NOT NULL DEFAULT 0,
    min_raise INTEGER NOT NULL,
    active_player_id TEXT,
    dealer_position INTEGER NOT NULL DEFAULT 0,
    small_blind_position INTEGER NOT NULL DEFAULT 1,
    big_blind_position INTEGER NOT NULL DEFAULT 2,
    deck_commitment TEXT,
    deck_revealed TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (table_id) REFERENCES table_configs (id)
);

-- Player hands (private to each player)
CREATE TABLE IF NOT EXISTS player_hands (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    hole_cards TEXT NOT NULL,
    hand_strength INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games (game_id),
    FOREIGN KEY (player_id) REFERENCES players (id)
);

-- Hand history for completed games
CREATE TABLE IF NOT EXISTS hand_history (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    table_id TEXT NOT NULL,
    winner_ids TEXT NOT NULL,
    final_pot INTEGER NOT NULL,
    community_cards TEXT,
    player_cards TEXT,
    actions_log TEXT NOT NULL,
    game_duration INTEGER,
    completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games (game_id),
    FOREIGN KEY (table_id) REFERENCES table_configs (id)
);

-- Tournament structure
CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tournament_type TEXT NOT NULL CHECK (tournament_type IN ('mtt', 'sit_n_go', 'heads_up')),
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'registering', 'running', 'finished', 'cancelled')),
    max_players INTEGER NOT NULL,
    buy_in INTEGER NOT NULL,
    starting_chips INTEGER NOT NULL,
    blind_structure TEXT NOT NULL,
    current_level INTEGER NOT NULL DEFAULT 1,
    registered_players INTEGER NOT NULL DEFAULT 0,
    eliminated_players INTEGER NOT NULL DEFAULT 0,
    prize_pool INTEGER NOT NULL DEFAULT 0,
    payout_structure TEXT,
    scheduled_start DATETIME,
    actual_start DATETIME,
    finished_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Game statistics and analytics
CREATE TABLE IF NOT EXISTS game_statistics (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    table_id TEXT,
    tournament_id TEXT,
    hands_played INTEGER NOT NULL DEFAULT 0,
    hands_won INTEGER NOT NULL DEFAULT 0,
    total_winnings INTEGER NOT NULL DEFAULT 0,
    total_losses INTEGER NOT NULL DEFAULT 0,
    vpip_percentage REAL NOT NULL DEFAULT 0.0,
    pfr_percentage REAL NOT NULL DEFAULT 0.0,
    aggression_factor REAL NOT NULL DEFAULT 0.0,
    session_duration INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players (id),
    FOREIGN KEY (table_id) REFERENCES table_configs (id),
    FOREIGN KEY (tournament_id) REFERENCES tournaments (id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_players_username ON players (username);
CREATE INDEX IF NOT EXISTS idx_players_email ON players (email);
CREATE INDEX IF NOT EXISTS idx_games_table_id ON games (table_id);
CREATE INDEX IF NOT EXISTS idx_games_phase ON games (phase);
CREATE INDEX IF NOT EXISTS idx_player_hands_game_id ON player_hands (game_id);
CREATE INDEX IF NOT EXISTS idx_player_hands_player_id ON player_hands (player_id);
CREATE INDEX IF NOT EXISTS idx_hand_history_game_id ON hand_history (game_id);
CREATE INDEX IF NOT EXISTS idx_hand_history_table_id ON hand_history (table_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments (status);
CREATE INDEX IF NOT EXISTS idx_game_statistics_player_id ON game_statistics (player_id);
