import { Router, IRequest } from 'itty-router';
import { z } from 'zod';
import { 
  SendFriendRequestSchema,
  FriendRequestNotFoundError
} from '@primo-poker/shared';
import { FriendRepository } from '@primo-poker/persistence/src/friend-repository';
import { AuthMiddleware } from '../middleware/auth';
import { withErrorHandling } from '../middleware/error-handler';
import { validateRequest } from '../middleware/validation';

const router = Router({ base: '/api/friends' });

// Send friend request
router.post(
  '/request',
  AuthMiddleware.requireAuth,
  validateRequest(SendFriendRequestSchema),
  withErrorHandling(async (request: IRequest, env: Env) => {
    const userId = request.user!.id;
    const { receiverId } = request.validatedData!;

    const repository = new FriendRepository(env.DB);
    const friendRequest = await repository.sendFriendRequest(userId, receiverId);

    return new Response(JSON.stringify(friendRequest), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  })
);

// Accept friend request
router.post(
  '/:requestId/accept',
  AuthMiddleware.requireAuth,
  withErrorHandling(async (request: IRequest, env: Env) => {
    const userId = request.user!.id;
    const requestId = parseInt(request.params.requestId);

    if (isNaN(requestId)) {
      throw new Error('Invalid request ID');
    }

    const repository = new FriendRepository(env.DB);
    await repository.acceptFriendRequest(requestId, userId);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  })
);

// Reject friend request
router.post(
  '/:requestId/reject',
  AuthMiddleware.requireAuth,
  withErrorHandling(async (request: IRequest, env: Env) => {
    const userId = request.user!.id;
    const requestId = parseInt(request.params.requestId);

    if (isNaN(requestId)) {
      throw new Error('Invalid request ID');
    }

    const repository = new FriendRepository(env.DB);
    await repository.rejectFriendRequest(requestId, userId);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  })
);

// Get friends list
router.get(
  '/',
  AuthMiddleware.requireAuth,
  withErrorHandling(async (request: IRequest, env: Env) => {
    const userId = request.user!.id;

    const repository = new FriendRepository(env.DB);
    const friends = await repository.getFriends(userId);

    return new Response(JSON.stringify({ friends }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  })
);

// Get pending friend requests
router.get(
  '/requests',
  AuthMiddleware.requireAuth,
  withErrorHandling(async (request: IRequest, env: Env) => {
    const userId = request.user!.id;

    const repository = new FriendRepository(env.DB);
    const requests = await repository.getPendingRequests(userId);

    return new Response(JSON.stringify({ requests }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  })
);

// Remove friend
router.delete(
  '/:friendId',
  AuthMiddleware.requireAuth,
  withErrorHandling(async (request: IRequest, env: Env) => {
    const userId = request.user!.id;
    const friendId = request.params.friendId;

    const repository = new FriendRepository(env.DB);
    await repository.removeFriend(userId, friendId);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  })
);

export { router as friendRoutes };