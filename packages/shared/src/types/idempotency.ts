/**
 * Idempotency key types for preventing duplicate financial transactions
 */

export interface IdempotencyRecord {
  key: string;
  userId: string;
  action: string;
  requestHash: string;
  response: any;
  status: 'pending' | 'completed' | 'failed';
  createdAt: Date;
  expiresAt: Date;
}

export interface IdempotencyOptions {
  ttlSeconds?: number; // Default 24 hours (86400 seconds)
  enableHashValidation?: boolean; // Validate request body hasn't changed
}

export interface IdempotentRequest {
  idempotencyKey?: string;
}

// Extend existing request types with idempotency support
export interface DepositRequestWithIdempotency {
  amount: number;
  method: 'credit_card' | 'bank';
  idempotencyKey?: string;
}

export interface WithdrawRequestWithIdempotency {
  amount: number;
  method: 'bank' | 'check';
  idempotencyKey?: string;
}

export interface TransferRequestWithIdempotency {
  to_table_id: string;
  amount: number;
  idempotencyKey?: string;
}

export interface BuyInRequestWithIdempotency {
  tableId: string;
  playerId: string;
  amount: number;
  seatNumber?: number;
  idempotencyKey?: string;
}

export interface CashOutRequestWithIdempotency {
  tableId: string;
  chipAmount: number;
  idempotencyKey?: string;
}