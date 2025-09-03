import { z } from 'zod';

/**
 * Security Hardening Validation Schemas
 * Comprehensive input validation for all Phase 2 endpoints
 */

// Password validation with security requirements
export const PasswordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character')
  .refine(
    (password) => {
      // Check for common weak passwords
      const weakPasswords = ['password', '12345678', 'qwerty', 'admin'];
      return !weakPasswords.some(weak => password.toLowerCase().includes(weak));
    },
    { message: 'Password is too common. Please choose a stronger password.' }
  );

// Username validation
export const UsernameSchema = z.string()
  .min(3, 'Username must be at least 3 characters')
  .max(20, 'Username must not exceed 20 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens')
  .refine(
    (username) => {
      const reserved = ['admin', 'root', 'system', 'moderator', 'support'];
      return !reserved.includes(username.toLowerCase());
    },
    { message: 'This username is reserved' }
  );

// Email validation
export const EmailSchema = z.string()
  .email('Invalid email address')
  .toLowerCase()
  .refine(
    (email) => {
      // Block disposable email domains
      const disposableDomains = ['tempmail.com', 'throwaway.email', '10minutemail.com'];
      const domain = email.split('@')[1];
      return !disposableDomains.includes(domain);
    },
    { message: 'Disposable email addresses are not allowed' }
  );

// Input sanitization helper
export const sanitizeInput = (input: string): string => {
  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim();
};

// Chat message validation
export const ChatMessageSchema = z.object({
  content: z.string()
    .min(1, 'Message cannot be empty')
    .max(500, 'Message must not exceed 500 characters')
    .transform(sanitizeInput),
  tableId: z.string().uuid('Invalid table ID')
});

// Transaction amount validation
export const AmountSchema = z.number()
  .positive('Amount must be positive')
  .multipleOf(0.01, 'Amount must have at most 2 decimal places')
  .max(10000, 'Amount exceeds maximum limit');

// Authentication schemas
export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Password is required'),
  timestamp: z.number().optional() // For request freshness validation
});

export const RegisterRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  username: UsernameSchema,
  timestamp: z.number().optional()
});

// Wallet operation schemas
export const DepositRequestSchema = z.object({
  amount: AmountSchema,
  method: z.enum(['credit_card', 'bank']),
  timestamp: z.number().optional()
});

export const WithdrawRequestSchema = z.object({
  amount: AmountSchema,
  method: z.enum(['bank', 'check']),
  timestamp: z.number().optional()
});

export const TransferRequestSchema = z.object({
  to_table_id: z.string().uuid('Invalid table ID'),
  amount: AmountSchema,
  timestamp: z.number().optional()
});

// Table operation schemas
export const CreateTableRequestSchema = z.object({
  name: z.string()
    .min(3, 'Table name must be at least 3 characters')
    .max(50, 'Table name must not exceed 50 characters')
    .transform(sanitizeInput),
  maxPlayers: z.number().int().min(2).max(10),
  minBuyIn: AmountSchema,
  maxBuyIn: AmountSchema,
  smallBlind: AmountSchema,
  bigBlind: AmountSchema
}).refine(
  (data) => data.maxBuyIn >= data.minBuyIn,
  { message: 'Max buy-in must be greater than or equal to min buy-in' }
);

// Player action schemas
export const BetActionSchema = z.object({
  action: z.enum(['fold', 'check', 'call', 'raise', 'all_in']),
  amount: z.number().positive().optional(),
  tableId: z.string().uuid('Invalid table ID'),
  timestamp: z.number().optional()
});

// Admin operation schemas
export const BanUserRequestSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  reason: z.string()
    .min(10, 'Ban reason must be at least 10 characters')
    .max(500, 'Ban reason must not exceed 500 characters')
    .transform(sanitizeInput),
  duration: z.number().positive().optional(), // Duration in seconds
  timestamp: z.number().optional()
});

// Statistics query schemas
export const StatsQuerySchema = z.object({
  userId: z.string().uuid('Invalid user ID').optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0)
});

// Tournament schemas
export const CreateTournamentSchema = z.object({
  name: z.string()
    .min(3, 'Tournament name must be at least 3 characters')
    .max(100, 'Tournament name must not exceed 100 characters')
    .transform(sanitizeInput),
  buyIn: AmountSchema,
  startTime: z.string().datetime(),
  maxPlayers: z.number().int().min(2).max(1000),
  structure: z.enum(['freezeout', 'rebuy', 'addon'])
});

// Friend operation schemas
export const FriendRequestSchema = z.object({
  targetUserId: z.string().uuid('Invalid user ID'),
  message: z.string()
    .max(200, 'Message must not exceed 200 characters')
    .optional()
    .transform((msg) => msg ? sanitizeInput(msg) : undefined)
});

// Request timestamp validation (5 minute window)
export const validateTimestamp = (timestamp?: number): boolean => {
  if (!timestamp) return true; // Optional by default
  const now = Date.now();
  const diff = Math.abs(now - timestamp);
  return diff <= 5 * 60 * 1000; // 5 minutes
};

// Generic request wrapper with timestamp
export const TimestampedRequestSchema = <T extends z.ZodTypeAny>(schema: T) =>
  schema.and(
    z.object({
      timestamp: z.number()
        .optional()
        .refine(validateTimestamp, { message: 'Request timestamp is too old' })
    })
  );

// Export helper function for validation with detailed errors
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      return { success: false, errors };
    }
    return { success: false, errors: ['Invalid request data'] };
  }
}

// Type exports
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type DepositRequest = z.infer<typeof DepositRequestSchema>;
export type WithdrawRequest = z.infer<typeof WithdrawRequestSchema>;
export type TransferRequest = z.infer<typeof TransferRequestSchema>;
export type CreateTableRequest = z.infer<typeof CreateTableRequestSchema>;
export type BetAction = z.infer<typeof BetActionSchema>;
export type BanUserRequest = z.infer<typeof BanUserRequestSchema>;
export type StatsQuery = z.infer<typeof StatsQuerySchema>;
export type CreateTournament = z.infer<typeof CreateTournamentSchema>;
export type FriendRequest = z.infer<typeof FriendRequestSchema>;