/**
 * Wallet and financial transaction types
 */

export interface PlayerWallet {
  playerId: string;
  balance: number;
  currency: string;
  frozen: number; // Amount locked in active games
  lastUpdated: Date;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  status: TransactionStatus;
  referenceId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  completedAt?: Date;
}

export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  TRANSFER_IN = 'transfer_in',
  TRANSFER_OUT = 'transfer_out',
  GAME_BUY_IN = 'game_buy_in',
  GAME_CASH_OUT = 'game_cash_out',
  GAME_WIN = 'game_win',
  GAME_LOSS = 'game_loss',
  TOURNAMENT_BUY_IN = 'tournament_buy_in',
  TOURNAMENT_PAYOUT = 'tournament_payout',
  RAKE = 'rake',
  BONUS = 'bonus',
  ADJUSTMENT = 'adjustment',
}

export enum TransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REVERSED = 'reversed',
}

export interface WalletLimits {
  minDeposit: number;
  maxDeposit: number;
  minWithdrawal: number;
  maxWithdrawal: number;
  dailyDepositLimit: number;
  dailyWithdrawalLimit: number;
  monthlyDepositLimit: number;
  monthlyWithdrawalLimit: number;
}

export interface WalletSummary {
  totalDeposits: number;
  totalWithdrawals: number;
  totalGameWinnings: number;
  totalGameLosses: number;
  totalRakePaid: number;
  netProfit: number;
  lastDepositDate?: Date;
  lastWithdrawalDate?: Date;
}

export interface PaymentMethod {
  id: string;
  type: 'credit_card' | 'bank_transfer' | 'crypto' | 'e_wallet';
  name: string;
  lastFourDigits?: string;
  expiryDate?: string;
  isDefault: boolean;
  isVerified: boolean;
  addedAt: Date;
}

export interface WithdrawalRequest {
  id: string;
  playerId: string;
  amount: number;
  currency: string;
  paymentMethodId: string;
  status: TransactionStatus;
  requestedAt: Date;
  processedAt?: Date;
  processedBy?: string;
  notes?: string;
}