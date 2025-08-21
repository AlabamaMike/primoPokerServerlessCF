import { z } from 'zod';

/**
 * Common request validation schemas
 */

export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const DateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/**
 * Authentication requests
 */

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  rememberMe: z.boolean().optional(),
});

export const RegisterRequestSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  confirmPassword: z.string(),
  termsAccepted: z.boolean(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string(),
});

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8).max(100),
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

/**
 * Table requests
 */

export const CreateTableRequestSchema = z.object({
  name: z.string().min(1).max(50),
  gameType: z.enum(['texas_holdem', 'omaha', 'omaha_hi_lo']),
  bettingStructure: z.enum(['limit', 'no_limit', 'pot_limit']),
  maxPlayers: z.number().int().min(2).max(10),
  smallBlind: z.number().positive(),
  bigBlind: z.number().positive(),
  minBuyIn: z.number().positive(),
  maxBuyIn: z.number().positive(),
  isPrivate: z.boolean().optional(),
  password: z.string().optional(),
});

export const JoinTableRequestSchema = z.object({
  tableId: z.string().uuid(),
  buyInAmount: z.number().positive(),
  seatPreference: z.number().int().min(0).max(9).optional(),
  password: z.string().optional(),
});

/**
 * Game action requests
 */

export const PlayerActionRequestSchema = z.object({
  action: z.enum(['fold', 'check', 'call', 'bet', 'raise', 'all_in']),
  amount: z.number().nonnegative().optional(),
});

/**
 * Wallet requests
 */

export const DepositRequestSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().default('USD'),
  paymentMethod: z.enum(['credit_card', 'bank_transfer', 'crypto']),
  paymentDetails: z.record(z.unknown()).optional(),
});

export const WithdrawRequestSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().default('USD'),
  withdrawalMethod: z.enum(['bank_transfer', 'crypto']),
  withdrawalDetails: z.record(z.unknown()),
});

export const TransferRequestSchema = z.object({
  toPlayerId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().default('USD'),
  note: z.string().max(200).optional(),
});

/**
 * Type exports
 */

export type PaginationRequest = z.infer<typeof PaginationSchema>;
export type DateRangeRequest = z.infer<typeof DateRangeSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
export type CreateTableRequest = z.infer<typeof CreateTableRequestSchema>;
export type JoinTableRequest = z.infer<typeof JoinTableRequestSchema>;
export type PlayerActionRequest = z.infer<typeof PlayerActionRequestSchema>;
export type DepositRequest = z.infer<typeof DepositRequestSchema>;
export type WithdrawRequest = z.infer<typeof WithdrawRequestSchema>;
export type TransferRequest = z.infer<typeof TransferRequestSchema>;