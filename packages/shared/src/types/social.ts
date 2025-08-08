import { z } from 'zod';
import { BaseError } from '../error-handling';

// Constants
export const SOCIAL_CONSTANTS = {
  MAX_NOTE_LENGTH: 1000,
  MIN_SEARCH_QUERY_LENGTH: 2,
  DEFAULT_PAGINATION_LIMIT: 20,
  MAX_PAGINATION_LIMIT: 100,
  DEFAULT_NOTE_PAGINATION_LIMIT: 50
} as const;

// Friend relationship status
export const FriendshipStatus = z.enum(['pending', 'accepted', 'rejected']);
export type FriendshipStatus = z.infer<typeof FriendshipStatus>;

// Friend relationship schema
export const FriendRelationshipSchema = z.object({
  id: z.number(),
  senderId: z.string(),
  receiverId: z.string(),
  status: FriendshipStatus,
  createdAt: z.string(),
  updatedAt: z.string()
});
export type FriendRelationship = z.infer<typeof FriendRelationshipSchema>;

// Friend request input
export const SendFriendRequestSchema = z.object({
  receiverId: z.string()
});
export type SendFriendRequest = z.infer<typeof SendFriendRequestSchema>;

// Player note schema
export const PlayerNoteSchema = z.object({
  id: z.number(),
  authorId: z.string(),
  subjectId: z.string(),
  note: z.string().min(1).max(SOCIAL_CONSTANTS.MAX_NOTE_LENGTH),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type PlayerNote = z.infer<typeof PlayerNoteSchema>;

// Player note input
export const CreatePlayerNoteSchema = z.object({
  subjectId: z.string(),
  note: z.string().min(1).max(SOCIAL_CONSTANTS.MAX_NOTE_LENGTH)
});
export type CreatePlayerNote = z.infer<typeof CreatePlayerNoteSchema>;

// Block list schema
export const BlockEntrySchema = z.object({
  id: z.number(),
  blockerId: z.string(),
  blockedId: z.string(),
  reason: z.string().optional().nullable(),
  createdAt: z.string()
});
export type BlockEntry = z.infer<typeof BlockEntrySchema>;

// Block input
export const BlockPlayerSchema = z.object({
  blockedId: z.string(),
  reason: z.string().optional()
});
export type BlockPlayer = z.infer<typeof BlockPlayerSchema>;

// Online status schema
export const OnlineStatusSchema = z.object({
  playerId: z.string(),
  isOnline: z.boolean(),
  lastSeen: z.string(),
  currentTableId: z.string().optional().nullable()
});
export type OnlineStatus = z.infer<typeof OnlineStatusSchema>;

// Notification types
export const NotificationType = z.enum(['friend_request', 'friend_accepted', 'friend_rejected']);
export type NotificationType = z.infer<typeof NotificationType>;

// Notification schema
export const NotificationSchema = z.object({
  id: z.number(),
  recipientId: z.string(),
  type: NotificationType,
  senderId: z.string(),
  message: z.string().optional().nullable(),
  isRead: z.boolean(),
  createdAt: z.string()
});
export type Notification = z.infer<typeof NotificationSchema>;

// Player search result
export const PlayerSearchResultSchema = z.object({
  playerId: z.string(),
  username: z.string(),
  displayName: z.string(),
  isOnline: z.boolean().optional(),
  isFriend: z.boolean().optional(),
  isBlocked: z.boolean().optional()
});
export type PlayerSearchResult = z.infer<typeof PlayerSearchResultSchema>;

// Search filters
export const PlayerSearchFiltersSchema = z.object({
  query: z.string().min(2),
  onlineOnly: z.boolean().optional(),
  friendsOnly: z.boolean().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0)
});
export type PlayerSearchFilters = z.infer<typeof PlayerSearchFiltersSchema>;

// Friend with user info
export const FriendWithUserInfoSchema = z.object({
  friendshipId: z.number(),
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
  status: FriendshipStatus,
  isOnline: z.boolean().optional(),
  createdAt: z.string()
});
export type FriendWithUserInfo = z.infer<typeof FriendWithUserInfoSchema>;

// WebSocket message types for social features
export const SocialWebSocketMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('friendRequestReceived'),
    payload: z.object({
      requestId: z.number(),
      senderId: z.string(),
      senderUsername: z.string(),
      senderDisplayName: z.string()
    })
  }),
  z.object({
    type: z.literal('friendRequestAccepted'),
    payload: z.object({
      friendId: z.string(),
      friendUsername: z.string(),
      friendDisplayName: z.string()
    })
  }),
  z.object({
    type: z.literal('friendRequestRejected'),
    payload: z.object({
      rejectedById: z.string(),
      rejectedByUsername: z.string()
    })
  }),
  z.object({
    type: z.literal('friendOnlineStatusChanged'),
    payload: z.object({
      friendId: z.string(),
      isOnline: z.boolean(),
      currentTableId: z.string().optional().nullable()
    })
  })
]);
export type SocialWebSocketMessage = z.infer<typeof SocialWebSocketMessageSchema>;

// Custom errors for social features
export class FriendshipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FriendshipError';
  }
}

export class AlreadyFriendsError extends FriendshipError {
  constructor() {
    super('Players are already friends');
  }
}

export class FriendRequestAlreadyExistsError extends FriendshipError {
  constructor() {
    super('Friend request already exists');
  }
}

export class FriendRequestNotFoundError extends FriendshipError {
  constructor() {
    super('Friend request not found');
  }
}

export class CannotBeFriendsWithSelfError extends FriendshipError {
  constructor() {
    super('Cannot send friend request to yourself');
  }
}

export class PlayerBlockedError extends Error {
  constructor(message = 'This action is blocked') {
    super(message);
    this.name = 'PlayerBlockedError';
  }
}

export class PlayerNoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlayerNoteError';
  }
}

export class CannotNoteYourselfError extends PlayerNoteError {
  constructor() {
    super('Cannot create notes about yourself');
  }
}