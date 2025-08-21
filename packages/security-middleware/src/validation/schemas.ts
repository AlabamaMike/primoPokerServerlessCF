import { z } from 'zod';

// Password validation with strong requirements
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character');

// Input sanitization to prevent XSS
const sanitizeString = (input: string): string => {
  return input
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim();
};

// Reserved usernames to prevent abuse
const RESERVED_USERNAMES = [
  'admin', 'administrator', 'root', 'system', 'moderator', 'support',
  'primo', 'primopoker', 'poker', 'api', 'www', 'mail', 'ftp'
];

// Common validation schemas
export const commonSchemas = {
  email: z.string().email().toLowerCase(),
  username: z.string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .refine(val => !RESERVED_USERNAMES.includes(val.toLowerCase()), {
      message: 'This username is reserved'
    }),
  password: passwordSchema,
  playerId: z.string().uuid(),
  tableId: z.string().uuid(),
  amount: z.number().positive().finite(),
  message: z.string().max(500).transform(sanitizeString),
  timestamp: z.number().int().positive()
    .refine(val => {
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;
      return Math.abs(now - val) < fiveMinutes;
    }, 'Timestamp is too old or invalid'),
};

// Authentication schemas
export const authSchemas = {
  register: z.object({
    email: commonSchemas.email,
    username: commonSchemas.username,
    password: commonSchemas.password,
    referralCode: z.string().optional(),
  }),

  login: z.object({
    email: commonSchemas.email,
    password: z.string().min(1),
  }),

  changePassword: z.object({
    currentPassword: z.string().min(1),
    newPassword: commonSchemas.password,
  }),

  resetPassword: z.object({
    email: commonSchemas.email,
    token: z.string().min(32),
    newPassword: commonSchemas.password,
  }),
};

// Wallet schemas
export const walletSchemas = {
  deposit: z.object({
    amount: commonSchemas.amount,
    paymentMethod: z.enum(['card', 'bank', 'crypto']),
    timestamp: commonSchemas.timestamp,
  }),

  withdraw: z.object({
    amount: commonSchemas.amount,
    destination: z.string().min(1),
    timestamp: commonSchemas.timestamp,
  }),

  transfer: z.object({
    recipientId: commonSchemas.playerId,
    amount: commonSchemas.amount,
    note: z.string().max(100).optional().transform(val => val ? sanitizeString(val) : val),
    timestamp: commonSchemas.timestamp,
  }),
};

// Game action schemas
export const gameSchemas = {
  joinTable: z.object({
    tableId: commonSchemas.tableId,
    seatNumber: z.number().int().min(0).max(9),
    buyIn: commonSchemas.amount,
  }),

  gameAction: z.object({
    tableId: commonSchemas.tableId,
    action: z.enum(['fold', 'check', 'call', 'raise', 'all-in']),
    amount: z.number().nonnegative().optional(),
  }),

  chat: z.object({
    tableId: commonSchemas.tableId,
    message: commonSchemas.message,
  }),
};

// Profile schemas
export const profileSchemas = {
  update: z.object({
    displayName: z.string().min(1).max(30).optional().transform(val => val ? sanitizeString(val) : val),
    avatarUrl: z.string().url().optional(),
    bio: z.string().max(500).optional().transform(val => val ? sanitizeString(val) : val),
    country: z.string().length(2).optional(), // ISO country code
  }),

  stats: z.object({
    playerId: commonSchemas.playerId,
    timeframe: z.enum(['day', 'week', 'month', 'all']).optional(),
  }),
};

// Admin schemas
export const adminSchemas = {
  banPlayer: z.object({
    playerId: commonSchemas.playerId,
    reason: z.string().min(10).max(500),
    duration: z.number().int().positive().optional(), // in minutes
  }),

  moderateChat: z.object({
    messageId: z.string().uuid(),
    action: z.enum(['delete', 'warn', 'mute']),
    reason: z.string().min(5).max(200),
  }),

  adjustBalance: z.object({
    playerId: commonSchemas.playerId,
    amount: z.number().finite(), // Can be negative for deductions
    reason: z.string().min(10).max(500),
    signature: z.string().min(64), // Request signature for verification
  }),
};

// Friend system schemas
export const friendSchemas = {
  sendRequest: z.object({
    recipientId: commonSchemas.playerId,
    message: z.string().max(100).optional().transform(val => val ? sanitizeString(val) : val),
  }),

  respondToRequest: z.object({
    requestId: z.string().uuid(),
    action: z.enum(['accept', 'reject']),
  }),
};

// Tournament schemas
export const tournamentSchemas = {
  register: z.object({
    tournamentId: z.string().uuid(),
    rebuyAuthorization: z.boolean().optional(),
  }),

  create: z.object({
    name: z.string().min(3).max(50).transform(sanitizeString),
    buyIn: commonSchemas.amount,
    startTime: z.number().int().positive().refine(val => val > Date.now(), 'Start time must be in the future'),
    maxPlayers: z.number().int().min(2).max(1000),
    structure: z.enum(['freezeout', 'rebuy', 'addon']),
  }),
};

// API key schemas for external integrations
export const apiKeySchemas = {
  create: z.object({
    name: z.string().min(3).max(50).transform(sanitizeString),
    permissions: z.array(z.string()).min(1),
    expiresAt: z.number().int().positive().optional(),
  }),

  revoke: z.object({
    keyId: z.string().uuid(),
    reason: z.string().min(5).max(200),
  }),
};

// Combined validation function
export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`Validation failed: ${message}`);
    }
    throw error;
  }
}