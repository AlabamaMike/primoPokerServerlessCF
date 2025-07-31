-- Initial database schema for Primo Poker
-- Players table
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  chip_count INTEGER NOT NULL DEFAULT 1000,
  status TEXT NOT NULL DEFAULT 'active',
  is_dealer BOOLEAN NOT NULL DEFAULT FALSE,
  time_bank INTEGER NOT NULL DEFAULT 30000,
  position_seat INTEGER,
  position_is_button BOOLEAN DEFAULT FALSE,
  position_is_small_blind BOOLEAN DEFAULT FALSE,
  position_is_big_blind BOOLEAN DEFAULT FALSE,
  last_action DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Games table
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  game_type TEXT NOT NULL DEFAULT 'texas_holdem',
  betting_structure TEXT NOT NULL DEFAULT 'no_limit',
  small_blind INTEGER NOT NULL,
  big_blind INTEGER NOT NULL,
  max_players INTEGER NOT NULL DEFAULT 9,
  current_players INTEGER NOT NULL DEFAULT 0,
  pot_size INTEGER NOT NULL DEFAULT 0,
  current_bet INTEGER NOT NULL DEFAULT 0,
  game_phase TEXT NOT NULL DEFAULT 'pre_flop',
  community_cards TEXT, -- JSON array
  deck TEXT, -- JSON array
  winner_ids TEXT, -- JSON array
  hand_history TEXT, -- JSON array
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Game players junction table
CREATE TABLE IF NOT EXISTS game_players (
  game_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  seat_number INTEGER NOT NULL,
  chip_count INTEGER NOT NULL,
  hole_cards TEXT, -- JSON array
  current_bet INTEGER NOT NULL DEFAULT 0,
  has_folded BOOLEAN NOT NULL DEFAULT FALSE,
  is_all_in BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (game_id, player_id),
  FOREIGN KEY (game_id) REFERENCES games(id),
  FOREIGN KEY (player_id) REFERENCES players(id)
);

-- Sessions table for authentication
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (player_id) REFERENCES players(id)
);

-- Tournaments table
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  buy_in INTEGER NOT NULL,
  prize_pool INTEGER NOT NULL DEFAULT 0,
  max_players INTEGER NOT NULL,
  registered_players TEXT, -- JSON array
  start_time DATETIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'registering',
  structure TEXT NOT NULL, -- JSON object
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_players_username ON players(username);
CREATE INDEX IF NOT EXISTS idx_players_email ON players(email);
CREATE INDEX IF NOT EXISTS idx_games_table_id ON games(table_id);
CREATE INDEX IF NOT EXISTS idx_sessions_player_id ON sessions(player_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
