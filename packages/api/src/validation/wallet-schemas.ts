import { z } from 'zod';

/**
 * Wallet API Request Validation Schemas
 */

// Deposit request schema
export const DepositRequestSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  method: z.enum(['credit_card', 'bank'], {
    errorMap: () => ({ message: 'Invalid payment method. Must be credit_card or bank' })
  }),
  idempotencyKey: z.string().min(1).max(128).optional()
});

// Withdraw request schema
export const WithdrawRequestSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  method: z.enum(['bank', 'check'], {
    errorMap: () => ({ message: 'Invalid withdrawal method. Must be bank or check' })
  }),
  idempotencyKey: z.string().min(1).max(128).optional()
});

// Transfer request schema
export const TransferRequestSchema = z.object({
  to_table_id: z.string().min(1, 'Table ID is required'),
  amount: z.number().positive('Amount must be positive'),
  idempotencyKey: z.string().min(1).max(128).optional()
});

// Buy-in request schema
export const BuyInRequestSchema = z.object({
  tableId: z.string().min(1, 'Table ID is required'),
  amount: z.number().positive('Amount must be positive'),
  idempotencyKey: z.string().min(1).max(128).optional()
});

// Cash-out request schema
export const CashOutRequestSchema = z.object({
  tableId: z.string().min(1, 'Table ID is required'),
  chipAmount: z.number().positive('Chip amount must be positive'),
  idempotencyKey: z.string().min(1).max(128).optional()
});

// Transaction query params schema
export const TransactionQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20).optional(),
  cursor: z.string().optional()
});

// Type exports
export type DepositRequest = z.infer<typeof DepositRequestSchema>;
export type WithdrawRequest = z.infer<typeof WithdrawRequestSchema>;
export type TransferRequest = z.infer<typeof TransferRequestSchema>;
export type TransactionQuery = z.infer<typeof TransactionQuerySchema>;

/**
 * Helper to validate request body with Zod schema
 */
export function validateRequestBody<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => e.message).join(', ');
      return { success: false, error: messages };
    }
    return { success: false, error: 'Invalid request data' };
  }
}

/**
 * Helper to validate query parameters
 */
export function validateQueryParams<T>(
  schema: z.ZodSchema<T>,
  params: URLSearchParams
): { success: true; data: T } | { success: false; error: string } {
  const data = Object.fromEntries(params.entries());
  return validateRequestBody(schema, data);
}