/**
 * Custom error types for wallet operations
 */

export class WalletError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message)
    this.name = 'WalletError'
  }
}

export class InsufficientFundsError extends WalletError {
  constructor(available: number, required: number) {
    super(`Insufficient funds. Available: $${available}, Required: $${required}`, 'INSUFFICIENT_FUNDS')
    this.name = 'InsufficientFundsError'
  }
}

export class WalletNotFoundError extends WalletError {
  constructor(playerId: string) {
    super(`Wallet not found for player: ${playerId}`, 'WALLET_NOT_FOUND')
    this.name = 'WalletNotFoundError'
  }
}

export class DailyLimitExceededError extends WalletError {
  constructor(limitType: 'deposits' | 'withdrawals' | 'buyIns') {
    super(`Daily ${limitType} limit exceeded`, 'DAILY_LIMIT_EXCEEDED')
    this.name = 'DailyLimitExceededError'
  }
}

export class SecurityError extends WalletError {
  constructor(message: string, code: string = 'SECURITY_ERROR') {
    super(message, code)
    this.name = 'SecurityError'
  }
}

export class RateLimitError extends SecurityError {
  constructor(public readonly retryAfter: number) {
    super('Rate limit exceeded. Please try again later.', 'RATE_LIMIT_EXCEEDED')
    this.name = 'RateLimitError'
  }
}

export class FraudDetectionError extends SecurityError {
  constructor(public readonly reasons: string[]) {
    super('Transaction flagged as suspicious', 'FRAUD_DETECTED')
    this.name = 'FraudDetectionError'
  }
}

export class InvalidSignatureError extends SecurityError {
  constructor(reason: string) {
    super(reason, 'INVALID_SIGNATURE')
    this.name = 'InvalidSignatureError'
  }
}

export class TransactionApprovalError extends WalletError {
  constructor(message: string) {
    super(message, 'APPROVAL_ERROR')
    this.name = 'TransactionApprovalError'
  }
}