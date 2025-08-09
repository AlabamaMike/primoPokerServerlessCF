import { 
  FriendRelationship, 
  FriendshipStatus,
  FriendWithUserInfo,
  AlreadyFriendsError,
  FriendRequestAlreadyExistsError,
  FriendRequestNotFoundError,
  CannotBeFriendsWithSelfError,
  PlayerBlockedError
} from '@primo-poker/shared';
import { FriendRelationshipRow, FriendWithUserInfoRow, BlockCheckRow } from './types/database-rows';

export interface IFriendRepository {
  sendFriendRequest(senderId: string, receiverId: string): Promise<FriendRelationship>;
  acceptFriendRequest(requestId: number, accepterId: string): Promise<void>;
  rejectFriendRequest(requestId: number, rejecterId: string): Promise<void>;
  removeFriend(userId: string, friendId: string): Promise<void>;
  getFriends(userId: string): Promise<FriendWithUserInfo[]>;
  getPendingRequests(userId: string): Promise<FriendWithUserInfo[]>;
  isFriend(userId1: string, userId2: string): Promise<boolean>;
  isBlocked(blockerId: string, blockedId: string): Promise<boolean>;
}

export class FriendRepository implements IFriendRepository {
  constructor(private db: D1Database) {}

  async sendFriendRequest(senderId: string, receiverId: string): Promise<FriendRelationship> {
    // Validate not sending to self
    if (senderId === receiverId) {
      throw new CannotBeFriendsWithSelfError();
    }

    // Check if already friends
    const existingFriendship = await this.db.prepare(`
      SELECT * FROM friend_relationships 
      WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
        AND status = 'accepted'
    `).bind(senderId, receiverId, receiverId, senderId).first();

    if (existingFriendship) {
      throw new AlreadyFriendsError();
    }

    // Check if blocked
    const isBlocked = await this.isBlocked(receiverId, senderId);
    if (isBlocked) {
      throw new PlayerBlockedError('Cannot send friend request to this player');
    }

    // Check for existing pending request
    const existingRequest = await this.db.prepare(`
      SELECT * FROM friend_relationships 
      WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'
    `).bind(senderId, receiverId).first();

    if (existingRequest) {
      throw new FriendRequestAlreadyExistsError();
    }

    // Create new friend request
    const result = await this.db.prepare(`
      INSERT INTO friend_relationships (sender_id, receiver_id, status)
      VALUES (?, ?, 'pending')
      RETURNING *
    `).bind(senderId, receiverId).first<FriendRelationshipRow>();

    if (!result) {
      throw new Error('Failed to create friend request');
    }

    return this.mapToFriendRelationship(result);
  }

  async acceptFriendRequest(requestId: number, accepterId: string): Promise<void> {
    // Verify the request exists and is for the accepter
    const request = await this.db.prepare(`
      SELECT * FROM friend_relationships 
      WHERE id = ? AND receiver_id = ? AND status = 'pending'
    `).bind(requestId, accepterId).first();

    if (!request) {
      throw new FriendRequestNotFoundError();
    }

    // Update status to accepted
    await this.db.prepare(`
      UPDATE friend_relationships 
      SET status = 'accepted', updated_at = datetime('now')
      WHERE id = ?
    `).bind(requestId).run();

    // Create notification for sender
    await this.db.prepare(`
      INSERT INTO notifications (recipient_id, type, sender_id, message)
      VALUES (?, 'friend_accepted', ?, ?)
    `).bind(
      request.sender_id as string,
      accepterId,
      'Your friend request has been accepted'
    ).run();
  }

  async rejectFriendRequest(requestId: number, rejecterId: string): Promise<void> {
    // Verify the request exists and is for the rejecter
    const request = await this.db.prepare(`
      SELECT * FROM friend_relationships 
      WHERE id = ? AND receiver_id = ? AND status = 'pending'
    `).bind(requestId, rejecterId).first();

    if (!request) {
      throw new FriendRequestNotFoundError();
    }

    // Update status to rejected
    await this.db.prepare(`
      UPDATE friend_relationships 
      SET status = 'rejected', updated_at = datetime('now')
      WHERE id = ?
    `).bind(requestId).run();
  }

  async removeFriend(userId: string, friendId: string): Promise<void> {
    // Delete the friendship (works both ways)
    await this.db.prepare(`
      DELETE FROM friend_relationships 
      WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
        AND status = 'accepted'
    `).bind(userId, friendId, friendId, userId).run();
  }

  async getFriends(userId: string): Promise<FriendWithUserInfo[]> {
    const results = await this.db.prepare(`
      SELECT 
        fr.id as friendship_id,
        CASE 
          WHEN fr.sender_id = ? THEN fr.receiver_id 
          ELSE fr.sender_id 
        END as user_id,
        u.username,
        u.displayName as display_name,
        fr.status,
        fr.created_at,
        pos.is_online
      FROM friend_relationships fr
      JOIN users u ON u.id = CASE 
        WHEN fr.sender_id = ? THEN fr.receiver_id 
        ELSE fr.sender_id 
      END
      LEFT JOIN player_online_status pos ON pos.player_id = u.id
      WHERE (fr.sender_id = ? OR fr.receiver_id = ?) AND fr.status = 'accepted'
      ORDER BY u.username
    `).bind(userId, userId, userId, userId).all();

    return results.results.map(row => this.mapToFriendWithUserInfo(row as unknown as FriendWithUserInfoRow));
  }

  async getPendingRequests(userId: string): Promise<FriendWithUserInfo[]> {
    const results = await this.db.prepare(`
      SELECT 
        fr.id as friendship_id,
        fr.sender_id as user_id,
        u.username,
        u.displayName as display_name,
        fr.status,
        fr.created_at,
        pos.is_online
      FROM friend_relationships fr
      JOIN users u ON u.id = fr.sender_id
      LEFT JOIN player_online_status pos ON pos.player_id = u.id
      WHERE fr.receiver_id = ? AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `).bind(userId).all();

    return results.results.map(row => this.mapToFriendWithUserInfo(row as unknown as FriendWithUserInfoRow));
  }

  async isFriend(userId1: string, userId2: string): Promise<boolean> {
    const result = await this.db.prepare(`
      SELECT COUNT(*) as count FROM friend_relationships 
      WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
        AND status = 'accepted'
    `).bind(userId1, userId2, userId2, userId1).first<{ count: number }>();

    return result?.count ? result.count > 0 : false;
  }

  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const result = await this.db.prepare(`
      SELECT COUNT(*) as count FROM block_list 
      WHERE blocker_id = ? AND blocked_id = ?
    `).bind(blockerId, blockedId).first<BlockCheckRow>();

    return result?.count ? result.count > 0 : false;
  }

  private mapToFriendRelationship(row: FriendRelationshipRow): FriendRelationship {
    return {
      id: row.id,
      senderId: row.sender_id,
      receiverId: row.receiver_id,
      status: row.status as FriendshipStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapToFriendWithUserInfo(row: FriendWithUserInfoRow): FriendWithUserInfo {
    return {
      friendshipId: row.friendship_id,
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      status: row.status as FriendshipStatus,
      isOnline: Boolean(row.is_online),
      createdAt: row.created_at
    };
  }
}