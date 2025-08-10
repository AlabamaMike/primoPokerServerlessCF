-- Player Statistics Table
CREATE TABLE IF NOT EXISTS player_statistics (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('all_time', 'daily', 'weekly', 'monthly', 'yearly')),
  game_type TEXT NOT NULL CHECK (game_type IN ('all', 'cash', 'tournament', 'sit_n_go')),
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP,
  
  -- Core gameplay statistics
  hands_played INTEGER NOT NULL DEFAULT 0,
  hands_won INTEGER NOT NULL DEFAULT 0,
  showdowns_won INTEGER NOT NULL DEFAULT 0,
  showdowns_seen INTEGER NOT NULL DEFAULT 0,
  
  -- Betting statistics
  total_bet_amount REAL NOT NULL DEFAULT 0,
  total_winnings REAL NOT NULL DEFAULT 0,
  total_rake_contributed REAL NOT NULL DEFAULT 0,
  biggest_pot_won REAL NOT NULL DEFAULT 0,
  
  -- Pre-flop statistics (stored as percentages 0-100)
  vpip REAL NOT NULL DEFAULT 0 CHECK (vpip >= 0 AND vpip <= 100),
  pfr REAL NOT NULL DEFAULT 0 CHECK (pfr >= 0 AND pfr <= 100),
  three_bet REAL NOT NULL DEFAULT 0 CHECK (three_bet >= 0 AND three_bet <= 100),
  fold_to_three_bet REAL NOT NULL DEFAULT 0 CHECK (fold_to_three_bet >= 0 AND fold_to_three_bet <= 100),
  
  -- Aggression statistics
  aggression_factor REAL NOT NULL DEFAULT 0 CHECK (aggression_factor >= 0),
  aggression_frequency REAL NOT NULL DEFAULT 0 CHECK (aggression_frequency >= 0 AND aggression_frequency <= 100),
  
  -- Post-flop statistics (stored as percentages 0-100)
  c_bet REAL NOT NULL DEFAULT 0 CHECK (c_bet >= 0 AND c_bet <= 100),
  fold_to_c_bet REAL NOT NULL DEFAULT 0 CHECK (fold_to_c_bet >= 0 AND fold_to_c_bet <= 100),
  wtsd REAL NOT NULL DEFAULT 0 CHECK (wtsd >= 0 AND wtsd <= 100),
  wsd REAL NOT NULL DEFAULT 0 CHECK (wsd >= 0 AND wsd <= 100),
  
  -- Session statistics
  sessions_played INTEGER NOT NULL DEFAULT 0,
  total_session_duration INTEGER NOT NULL DEFAULT 0, -- in seconds
  profitable_sessions INTEGER NOT NULL DEFAULT 0,
  
  -- Tournament specific (NULL for cash games)
  tournaments_played INTEGER,
  tournaments_won INTEGER,
  tournaments_cashed INTEGER,
  average_finish_position REAL,
  total_buy_ins REAL,
  total_cashes REAL,
  roi REAL, -- Return on Investment percentage
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_calculated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Ensure unique statistics per player/period/game_type combination
  UNIQUE(player_id, period, game_type, period_start)
);

-- Session Statistics Table
CREATE TABLE IF NOT EXISTS session_statistics (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  table_id TEXT NOT NULL,
  game_type TEXT NOT NULL CHECK (game_type IN ('all', 'cash', 'tournament', 'sit_n_go')),
  
  -- Session info
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  duration INTEGER NOT NULL DEFAULT 0, -- in seconds
  
  -- Session results
  buy_in_amount REAL NOT NULL,
  cash_out_amount REAL NOT NULL DEFAULT 0,
  net_result REAL NOT NULL DEFAULT 0, -- can be negative
  
  -- Session activity
  hands_played INTEGER NOT NULL DEFAULT 0,
  hands_won INTEGER NOT NULL DEFAULT 0,
  biggest_pot_won REAL NOT NULL DEFAULT 0,
  
  -- Peak statistics during session
  peak_chip_count REAL NOT NULL,
  lowest_chip_count REAL NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes will be created below
  CHECK (end_time IS NULL OR end_time >= start_time),
  CHECK (duration >= 0),
  CHECK (buy_in_amount >= 0),
  CHECK (cash_out_amount >= 0),
  CHECK (peak_chip_count >= lowest_chip_count)
);

-- Hand Statistics Table (for detailed analysis)
CREATE TABLE IF NOT EXISTS hand_statistics (
  id TEXT PRIMARY KEY,
  hand_id TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  table_id TEXT NOT NULL,
  
  -- Hand info
  hand_number INTEGER NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  
  -- Player position
  position TEXT NOT NULL, -- e.g., 'BTN', 'SB', 'BB', 'UTG', etc.
  
  -- Actions summary
  pre_flop_action TEXT,
  flop_action TEXT,
  turn_action TEXT,
  river_action TEXT,
  
  -- Money flow
  invested REAL NOT NULL DEFAULT 0,
  won REAL NOT NULL DEFAULT 0,
  net_result REAL NOT NULL DEFAULT 0,
  
  -- Hand outcome
  went_to_showdown BOOLEAN NOT NULL DEFAULT FALSE,
  won_at_showdown BOOLEAN,
  
  -- Cards (encrypted/hashed for security)
  hole_cards_hash TEXT,
  
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Ensure unique hand per player
  UNIQUE(hand_id, player_id),
  CHECK (invested >= 0),
  CHECK (won >= 0)
);

-- Create indexes for efficient querying

-- Player Statistics indexes
CREATE INDEX idx_player_statistics_player_id ON player_statistics(player_id);
CREATE INDEX idx_player_statistics_period ON player_statistics(period);
CREATE INDEX idx_player_statistics_game_type ON player_statistics(game_type);
CREATE INDEX idx_player_statistics_period_start ON player_statistics(period_start);
CREATE INDEX idx_player_statistics_last_calculated ON player_statistics(last_calculated_at);
CREATE INDEX idx_player_statistics_composite ON player_statistics(player_id, period, game_type);

-- Session Statistics indexes
CREATE INDEX idx_session_statistics_player_id ON session_statistics(player_id);
CREATE INDEX idx_session_statistics_table_id ON session_statistics(table_id);
CREATE INDEX idx_session_statistics_start_time ON session_statistics(start_time);
CREATE INDEX idx_session_statistics_end_time ON session_statistics(end_time);
CREATE INDEX idx_session_statistics_game_type ON session_statistics(game_type);
CREATE INDEX idx_session_statistics_net_result ON session_statistics(net_result);

-- Hand Statistics indexes
CREATE INDEX idx_hand_statistics_hand_id ON hand_statistics(hand_id);
CREATE INDEX idx_hand_statistics_player_id ON hand_statistics(player_id);
CREATE INDEX idx_hand_statistics_table_id ON hand_statistics(table_id);
CREATE INDEX idx_hand_statistics_timestamp ON hand_statistics(timestamp);
CREATE INDEX idx_hand_statistics_position ON hand_statistics(position);
CREATE INDEX idx_hand_statistics_net_result ON hand_statistics(net_result);

-- Aggregated views for quick access

-- Player Statistics Summary View
CREATE VIEW IF NOT EXISTS player_stats_summary AS
SELECT 
  p.id AS player_id,
  p.username,
  -- All-time stats
  COALESCE(ps_all.hands_played, 0) AS lifetime_hands_played,
  COALESCE(ps_all.total_winnings - ps_all.total_bet_amount, 0) AS lifetime_net_winnings,
  CASE 
    WHEN COALESCE(ps_all.hands_played, 0) > 0 
    THEN (ps_all.total_winnings - ps_all.total_bet_amount) / ps_all.hands_played * 100
    ELSE 0 
  END AS lifetime_bb_per_100,
  
  -- Last 30 days stats
  COALESCE(ps_recent.hands_played, 0) AS recent_hands_played,
  COALESCE(ps_recent.total_winnings - ps_recent.total_bet_amount, 0) AS recent_net_winnings,
  CASE 
    WHEN COALESCE(ps_recent.hands_played, 0) > 0 
    THEN (ps_recent.total_winnings - ps_recent.total_bet_amount) / ps_recent.hands_played * 100
    ELSE 0 
  END AS recent_bb_per_100,
  
  -- Key percentages
  COALESCE(ps_all.vpip, 0) AS vpip,
  COALESCE(ps_all.pfr, 0) AS pfr,
  COALESCE(ps_all.aggression_factor, 0) AS aggression_factor,
  
  -- Last active
  COALESCE(MAX(ss.end_time), MAX(ss.start_time)) AS last_active_at
FROM players p
LEFT JOIN player_statistics ps_all ON p.id = ps_all.player_id 
  AND ps_all.period = 'all_time' 
  AND ps_all.game_type = 'all'
LEFT JOIN player_statistics ps_recent ON p.id = ps_recent.player_id 
  AND ps_recent.period = 'monthly' 
  AND ps_recent.game_type = 'all'
  AND ps_recent.period_start >= datetime('now', '-30 days')
LEFT JOIN session_statistics ss ON p.id = ss.player_id
GROUP BY p.id, p.username, ps_all.hands_played, ps_all.total_winnings, ps_all.total_bet_amount,
         ps_recent.hands_played, ps_recent.total_winnings, ps_recent.total_bet_amount,
         ps_all.vpip, ps_all.pfr, ps_all.aggression_factor;

-- Leaderboard View (by profit)
CREATE VIEW IF NOT EXISTS profit_leaderboard AS
SELECT 
  ROW_NUMBER() OVER (ORDER BY net_profit DESC) AS rank,
  player_id,
  username,
  net_profit AS value,
  hands_played,
  bb_per_100
FROM (
  SELECT 
    p.id AS player_id,
    p.username,
    COALESCE(SUM(ps.total_winnings - ps.total_bet_amount), 0) AS net_profit,
    COALESCE(SUM(ps.hands_played), 0) AS hands_played,
    CASE 
      WHEN COALESCE(SUM(ps.hands_played), 0) > 0 
      THEN SUM(ps.total_winnings - ps.total_bet_amount) / SUM(ps.hands_played) * 100
      ELSE 0 
    END AS bb_per_100
  FROM players p
  LEFT JOIN player_statistics ps ON p.id = ps.player_id
  WHERE ps.period = 'all_time' AND ps.game_type = 'all'
  GROUP BY p.id, p.username
) AS profit_stats
WHERE hands_played >= 100 -- Minimum hands requirement
ORDER BY net_profit DESC;

-- Session Performance View
CREATE VIEW IF NOT EXISTS session_performance AS
SELECT 
  ss.id AS session_id,
  ss.player_id,
  p.username,
  ss.table_id,
  ss.game_type,
  ss.start_time,
  ss.end_time,
  ss.duration,
  ss.buy_in_amount,
  ss.cash_out_amount,
  ss.net_result,
  ss.hands_played,
  CASE 
    WHEN ss.net_result > 0 THEN 'WIN'
    WHEN ss.net_result < 0 THEN 'LOSS'
    ELSE 'BREAK_EVEN'
  END AS session_result,
  CASE 
    WHEN ss.hands_played > 0 
    THEN ss.net_result / ss.hands_played * 100
    ELSE 0 
  END AS bb_per_100_hands
FROM session_statistics ss
JOIN players p ON ss.player_id = p.id
ORDER BY ss.start_time DESC;