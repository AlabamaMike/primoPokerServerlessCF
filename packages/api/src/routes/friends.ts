import { Router, IRequest } from 'itty-router';
import { z } from 'zod';
import {
  SendFriendRequestSchema
} from '@primo-poker/shared';
import { FriendRepository } from '@primo-poker/persistence';
import { authenticateUser } from '../middleware/auth';
import { withErrorHandling } from '../middleware/error-handler';
import { validateRequest } from '../middleware/validation';
import { socialRateLimiter } from '../middleware/rate-limiter';
import { createSuccessResponse } from '../utils/response-helpers';

const router = Router({ base: '/api/friends' });

// Send friend request
router.post(
  '/request',
  authenticateUser,
  socialRateLimiter.middleware(),
  validateRequest(SendFriendRequestSchema),
  withErrorHandling(async (request: IRequest, env: Env) => {
    const userId = request.user!.id;
    const { receiverId } = request.validatedData!;

    const repository = new FriendRepository(env.DB);
    const friendRequest = await repository.sendFriendRequest(userId, receiverId);

    return createSuccessResponse(friendRequest, 201);
  })
);

// Accept friend request
router.post(
  '/:requestId/accept',
  authenticateUser,
  withErrorHandling(async (request: IRequest, env: Env) => {
    const userId = request.user!.id;
    const requestId = parseInt(request.params.requestId);

    if (isNaN(requestId)) {
      throw new Error('Invalid request ID');
    }

    const repository = new FriendRepository(env.DB);
    await repository.acceptFriendRequest(requestId, userId);

    return createSuccessResponse({ message: 'Friend request accepted' });
  })
);

// Reject friend request
router.post(
  '/:requestId/reject',
  authenticateUser,
  withErrorHandling(async (request: IRequest, env: Env) => {
    const userId = request.user!.id;
    const requestId = parseInt(request.params.requestId);

    if (isNaN(requestId)) {
      throw new Error('Invalid request ID');
    }

    const repository = new FriendRepository(env.DB);
    await repository.rejectFriendRequest(requestId, userId);

    return createSuccessResponse({ message: 'Friend request rejected' });
  })
);

// Get friends list
router.get(
  '/',
  authenticateUser,
  withErrorHandling(async (request: IRequest, env: Env) => {
    const userId = request.user!.id;

    const repository = new FriendRepository(env.DB);
    const friends = await repository.getFriends(userId);

    return createSuccessResponse({ friends });
  })
);

// Get pending friend requests
router.get(
  '/requests',
  authenticateUser,
  withErrorHandling(async (request: IRequest, env: Env) => {
    const userId = request.user!.id;

    const repository = new FriendRepository(env.DB);
    const requests = await repository.getPendingRequests(userId);

    return createSuccessResponse({ requests });
  })
);

// Remove friend
router.delete(
  '/:friendId',
  authenticateUser,
  withErrorHandling(async (request: IRequest, env: Env) => {
    const userId = request.user!.id;
    const friendId = request.params.friendId;

    const repository = new FriendRepository(env.DB);
    await repository.removeFriend(userId, friendId);

    return createSuccessResponse({ message: 'Friend removed' });
  })
);

export { router as friendRoutes };