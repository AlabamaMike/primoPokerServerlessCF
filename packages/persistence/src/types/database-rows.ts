/**
 * Type definitions for database row results
 */

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