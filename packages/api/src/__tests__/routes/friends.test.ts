import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { friendRoutes } from '../../routes/friends';
import { 
  AlreadyFriendsError,
  FriendRequestAlreadyExistsError,
  FriendRequestNotFoundError,
  CannotBeFriendsWithSelfError
} from '@primo-poker/shared';

// Mock FriendRepository
jest.mock('@primo-poker/persistence/src/friend-repository', () => ({
  FriendRepository: jest.fn().mockImplementation(() => ({
    sendFriendRequest: jest.fn(),
    acceptFriendRequest: jest.fn(),
    rejectFriendRequest: jest.fn(),
    removeFriend: jest.fn(),
    getFriends: jest.fn(),
    getPendingRequests: jest.fn()
  }))
}));

// Mock middleware
jest.mock('../../middleware/auth', () => ({
  AuthMiddleware: {
    requireAuth: (request: any) => {
      request.user = { id: 'test-user-id' };
      return request;
    }
  }
}));

jest.mock('../../middleware/validation', () => ({
  validateRequest: (schema: any) => (request: any) => {
    request.validatedData = request.body;
    return request;
  }
}));

jest.mock('../../middleware/error-handler', () => ({
  withErrorHandling: (fn: any) => fn
}));

import { FriendRepository } from '@primo-poker/persistence/src/friend-repository';

describe('Friend Routes', () => {
  let mockRepository: any;
  let mockEnv: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepository = new (FriendRepository as any)();
    mockEnv = { DB: {} };
  });

  describe('POST /api/friends/request', () => {
    it('should send a friend request', async () => {
      const mockFriendRequest = {
        id: 1,
        senderId: 'test-user-id',
        receiverId: 'friend-id',
        status: 'pending',
        createdAt: '2025-01-01T00:00:00',
        updatedAt: '2025-01-01T00:00:00'
      };

      mockRepository.sendFriendRequest.mockResolvedValue(mockFriendRequest);

      const request = {
        method: 'POST',
        url: 'http://localhost/api/friends/request',
        user: { id: 'test-user-id' },
        body: { receiverId: 'friend-id' },
        validatedData: { receiverId: 'friend-id' }
      };

      const response = await friendRoutes.handle(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toEqual(mockFriendRequest);
      expect(mockRepository.sendFriendRequest).toHaveBeenCalledWith('test-user-id', 'friend-id');
    });

    it('should handle errors when already friends', async () => {
      mockRepository.sendFriendRequest.mockRejectedValue(new AlreadyFriendsError());

      const request = {
        method: 'POST',
        url: 'http://localhost/api/friends/request',
        user: { id: 'test-user-id' },
        body: { receiverId: 'friend-id' },
        validatedData: { receiverId: 'friend-id' }
      };

      await expect(friendRoutes.handle(request, mockEnv)).rejects.toThrow(AlreadyFriendsError);
    });
  });

  describe('POST /api/friends/:requestId/accept', () => {
    it('should accept a friend request', async () => {
      mockRepository.acceptFriendRequest.mockResolvedValue(undefined);

      const request = {
        method: 'POST',
        url: 'http://localhost/api/friends/123/accept',
        user: { id: 'test-user-id' },
        params: { requestId: '123' }
      };

      const response = await friendRoutes.handle(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true });
      expect(mockRepository.acceptFriendRequest).toHaveBeenCalledWith(123, 'test-user-id');
    });

    it('should handle invalid request ID', async () => {
      const request = {
        method: 'POST',
        url: 'http://localhost/api/friends/invalid/accept',
        user: { id: 'test-user-id' },
        params: { requestId: 'invalid' }
      };

      await expect(friendRoutes.handle(request, mockEnv)).rejects.toThrow('Invalid request ID');
    });
  });

  describe('POST /api/friends/:requestId/reject', () => {
    it('should reject a friend request', async () => {
      mockRepository.rejectFriendRequest.mockResolvedValue(undefined);

      const request = {
        method: 'POST',
        url: 'http://localhost/api/friends/123/reject',
        user: { id: 'test-user-id' },
        params: { requestId: '123' }
      };

      const response = await friendRoutes.handle(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true });
      expect(mockRepository.rejectFriendRequest).toHaveBeenCalledWith(123, 'test-user-id');
    });
  });

  describe('GET /api/friends', () => {
    it('should return friends list', async () => {
      const mockFriends = [
        {
          friendshipId: 1,
          userId: 'friend1',
          username: 'friend1_username',
          displayName: 'Friend One',
          status: 'accepted',
          isOnline: true,
          createdAt: '2025-01-01T00:00:00'
        }
      ];

      mockRepository.getFriends.mockResolvedValue(mockFriends);

      const request = {
        method: 'GET',
        url: 'http://localhost/api/friends',
        user: { id: 'test-user-id' }
      };

      const response = await friendRoutes.handle(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ friends: mockFriends });
      expect(mockRepository.getFriends).toHaveBeenCalledWith('test-user-id');
    });
  });

  describe('GET /api/friends/requests', () => {
    it('should return pending requests', async () => {
      const mockRequests = [
        {
          friendshipId: 2,
          userId: 'requester1',
          username: 'requester1_username',
          displayName: 'Requester One',
          status: 'pending',
          isOnline: false,
          createdAt: '2025-01-02T00:00:00'
        }
      ];

      mockRepository.getPendingRequests.mockResolvedValue(mockRequests);

      const request = {
        method: 'GET',
        url: 'http://localhost/api/friends/requests',
        user: { id: 'test-user-id' }
      };

      const response = await friendRoutes.handle(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ requests: mockRequests });
      expect(mockRepository.getPendingRequests).toHaveBeenCalledWith('test-user-id');
    });
  });

  describe('DELETE /api/friends/:friendId', () => {
    it('should remove a friend', async () => {
      mockRepository.removeFriend.mockResolvedValue(undefined);

      const request = {
        method: 'DELETE',
        url: 'http://localhost/api/friends/friend-to-remove',
        user: { id: 'test-user-id' },
        params: { friendId: 'friend-to-remove' }
      };

      const response = await friendRoutes.handle(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true });
      expect(mockRepository.removeFriend).toHaveBeenCalledWith('test-user-id', 'friend-to-remove');
    });
  });
});