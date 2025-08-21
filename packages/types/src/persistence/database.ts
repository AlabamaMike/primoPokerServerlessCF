/**
 * Database row types for D1 persistence
 */

export interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  display_name: string;
  created_at: string;
  updated_at: string;
  last_login_at?: string;
  is_active: number; // boolean as 0/1
  is_verified: number; // boolean as 0/1
}

export interface PlayerStatsRow {
  player_id: string;
  hands_played: number;
  hands_won: number;
  total_winnings: number;
  biggest_pot: number;
  total_rake_paid: number;
  tournaments_played: number;
  tournaments_won: number;
  created_at: string;
  updated_at: string;
}

export interface GameHistoryRow {
  id: string;
  table_id: string;
  game_id: string;
  hand_number: number;
  pot_size: number;
  rake: number;
  community_cards: string; // JSON string
  winners: string; // JSON string
  started_at: string;
  completed_at: string;
}

export interface TransactionRow {
  id: string;
  player_id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  reference_id?: string;
  metadata?: string; // JSON string
  created_at: string;
  updated_at: string;
}

export interface FriendRelationshipRow {
  id: number;
  sender_id: string;
  receiver_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface FriendWithUserInfoRow {
  friendship_id: number;
  user_id: string;
  username: string;
  display_name: string;
  status: string;
  created_at: string;
  is_online: number;
}

export interface PlayerNoteRow {
  id: number;
  author_id: string;
  subject_id: string;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface PlayerNoteWithUserInfoRow extends PlayerNoteRow {
  username: string;
  display_name: string;
}

export interface BlockCheckRow {
  count: number;
}

export interface ChatMessageRow {
  id: string;
  table_id: string;
  player_id: string;
  message: string;
  is_system: number;
  created_at: string;
}

export interface ModerationActionRow {
  id: string;
  moderator_id: string;
  target_player_id: string;
  action_type: string;
  reason: string;
  duration_minutes?: number;
  created_at: string;
  expires_at?: string;
}

/**
 * Database query helpers
 */

export interface QueryResult<T> {
  results: T[];
  success: boolean;
  meta?: {
    duration: number;
    changes?: number;
    last_row_id?: number;
    rows_read?: number;
    rows_written?: number;
  };
}

export interface PaginatedQueryResult<T> extends QueryResult<T> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}