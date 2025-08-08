import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { FriendRepository } from '../friend-repository';
import { 
  AlreadyFriendsError,
  FriendRequestAlreadyExistsError,
  FriendRequestNotFoundError,
  CannotBeFriendsWithSelfError,
  PlayerBlockedError 
} from '@primo-poker/shared';

// Mock D1Database
const mockDb = {
  prepare: jest.fn().mockReturnThis(),
  bind: jest.fn().mockReturnThis(),
  first: jest.fn(),
  run: jest.fn(),
  all: jest.fn()
};

describe('FriendRepository', () => {
  let repository: FriendRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new FriendRepository(mockDb as any);
  });

  describe('sendFriendRequest', () => {
    it('should create a new friend request', async () => {
      const senderId = 'user1';
      const receiverId = 'user2';
      const mockResult = {
        id: 1,
        sender_id: senderId,
        receiver_id: receiverId,
        status: 'pending',
        created_at: '2025-01-01T00:00:00',
        updated_at: '2025-01-01T00:00:00'
      };

      mockDb.first
        .mockResolvedValueOnce(null) // No existing friendship
        .mockResolvedValueOnce(null) // Not blocked
        .mockResolvedValueOnce(null) // No existing request
        .mockResolvedValueOnce(mockResult); // Create request

      const result = await repository.sendFriendRequest(senderId, receiverId);

      expect(result).toEqual({
        id: 1,
        senderId,
        receiverId,
        status: 'pending',
        createdAt: '2025-01-01T00:00:00',
        updatedAt: '2025-01-01T00:00:00'
      });
      expect(mockDb.prepare).toHaveBeenCalledTimes(4);
    });

    it('should throw error when sending request to self', async () => {
      const userId = 'user1';

      await expect(repository.sendFriendRequest(userId, userId))
        .rejects.toThrow(CannotBeFriendsWithSelfError);
      
      expect(mockDb.prepare).not.toHaveBeenCalled();
    });

    it('should throw error when already friends', async () => {
      const senderId = 'user1';
      const receiverId = 'user2';

      mockDb.first.mockResolvedValueOnce({ status: 'accepted' });

      await expect(repository.sendFriendRequest(senderId, receiverId))
        .rejects.toThrow(AlreadyFriendsError);
    });

    it('should throw error when player is blocked', async () => {
      const senderId = 'user1';
      const receiverId = 'user2';

      mockDb.first
        .mockResolvedValueOnce(null) // No existing friendship
        .mockResolvedValueOnce({ count: 1 }); // Is blocked

      await expect(repository.sendFriendRequest(senderId, receiverId))
        .rejects.toThrow(PlayerBlockedError);
    });

    it('should throw error when request already exists', async () => {
      const senderId = 'user1';
      const receiverId = 'user2';

      mockDb.first
        .mockResolvedValueOnce(null) // No existing friendship
        .mockResolvedValueOnce(null) // Not blocked
        .mockResolvedValueOnce({ status: 'pending' }); // Existing request

      await expect(repository.sendFriendRequest(senderId, receiverId))
        .rejects.toThrow(FriendRequestAlreadyExistsError);
    });
  });

  describe('acceptFriendRequest', () => {
    it('should accept a friend request', async () => {
      const requestId = 1;
      const accepterId = 'user2';
      const mockRequest = {
        id: requestId,
        sender_id: 'user1',
        receiver_id: accepterId,
        status: 'pending'
      };

      mockDb.first.mockResolvedValueOnce(mockRequest);
      mockDb.run.mockResolvedValueOnce({});

      await repository.acceptFriendRequest(requestId, accepterId);

      expect(mockDb.prepare).toHaveBeenCalledTimes(3); // SELECT, UPDATE, INSERT notification
      expect(mockDb.run).toHaveBeenCalledTimes(2);
    });

    it('should throw error when request not found', async () => {
      const requestId = 999;
      const accepterId = 'user2';

      mockDb.first.mockResolvedValueOnce(null);

      await expect(repository.acceptFriendRequest(requestId, accepterId))
        .rejects.toThrow(FriendRequestNotFoundError);
    });
  });

  describe('rejectFriendRequest', () => {
    it('should reject a friend request', async () => {
      const requestId = 1;
      const rejecterId = 'user2';
      const mockRequest = {
        id: requestId,
        sender_id: 'user1',
        receiver_id: rejecterId,
        status: 'pending'
      };

      mockDb.first.mockResolvedValueOnce(mockRequest);
      mockDb.run.mockResolvedValueOnce({});

      await repository.rejectFriendRequest(requestId, rejecterId);

      expect(mockDb.prepare).toHaveBeenCalledTimes(2); // SELECT, UPDATE
      expect(mockDb.run).toHaveBeenCalledTimes(1);
    });

    it('should throw error when request not found', async () => {
      const requestId = 999;
      const rejecterId = 'user2';

      mockDb.first.mockResolvedValueOnce(null);

      await expect(repository.rejectFriendRequest(requestId, rejecterId))
        .rejects.toThrow(FriendRequestNotFoundError);
    });
  });

  describe('removeFriend', () => {
    it('should remove a friendship', async () => {
      const userId = 'user1';
      const friendId = 'user2';

      mockDb.run.mockResolvedValueOnce({});

      await repository.removeFriend(userId, friendId);

      expect(mockDb.prepare).toHaveBeenCalledTimes(1);
      expect(mockDb.run).toHaveBeenCalledTimes(1);
    });
  });

  describe('getFriends', () => {
    it('should return list of friends', async () => {
      const userId = 'user1';
      const mockResults = {
        results: [
          {
            friendship_id: 1,
            user_id: 'user2',
            username: 'player2',
            display_name: 'Player Two',
            status: 'accepted',
            created_at: '2025-01-01T00:00:00',
            is_online: 1
          },
          {
            friendship_id: 2,
            user_id: 'user3',
            username: 'player3',
            display_name: 'Player Three',
            status: 'accepted',
            created_at: '2025-01-02T00:00:00',
            is_online: 0
          }
        ]
      };

      mockDb.all.mockResolvedValueOnce(mockResults);

      const friends = await repository.getFriends(userId);

      expect(friends).toHaveLength(2);
      expect(friends[0]).toEqual({
        friendshipId: 1,
        userId: 'user2',
        username: 'player2',
        displayName: 'Player Two',
        status: 'accepted',
        isOnline: true,
        createdAt: '2025-01-01T00:00:00'
      });
      expect(friends[1].isOnline).toBe(false);
    });
  });

  describe('getPendingRequests', () => {
    it('should return pending friend requests', async () => {
      const userId = 'user1';
      const mockResults = {
        results: [
          {
            friendship_id: 3,
            user_id: 'user4',
            username: 'player4',
            display_name: 'Player Four',
            status: 'pending',
            created_at: '2025-01-03T00:00:00',
            is_online: 1
          }
        ]
      };

      mockDb.all.mockResolvedValueOnce(mockResults);

      const requests = await repository.getPendingRequests(userId);

      expect(requests).toHaveLength(1);
      expect(requests[0]).toEqual({
        friendshipId: 3,
        userId: 'user4',
        username: 'player4',
        displayName: 'Player Four',
        status: 'pending',
        isOnline: true,
        createdAt: '2025-01-03T00:00:00'
      });
    });
  });

  describe('isFriend', () => {
    it('should return true when users are friends', async () => {
      mockDb.first.mockResolvedValueOnce({ count: 1 });

      const result = await repository.isFriend('user1', 'user2');

      expect(result).toBe(true);
    });

    it('should return false when users are not friends', async () => {
      mockDb.first.mockResolvedValueOnce({ count: 0 });

      const result = await repository.isFriend('user1', 'user2');

      expect(result).toBe(false);
    });
  });

  describe('isBlocked', () => {
    it('should return true when user is blocked', async () => {
      mockDb.first.mockResolvedValueOnce({ count: 1 });

      const result = await repository.isBlocked('user1', 'user2');

      expect(result).toBe(true);
    });

    it('should return false when user is not blocked', async () => {
      mockDb.first.mockResolvedValueOnce({ count: 0 });

      const result = await repository.isBlocked('user1', 'user2');

      expect(result).toBe(false);
    });
  });
});