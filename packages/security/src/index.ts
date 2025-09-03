// Export all cryptographic RNG modules
export * from './crypto-helpers';
export * from './secure-shuffle';
export * from './deck-commitment';

// Legacy exports
export * from './shuffle-verifier';
export * from './authentication';

// Re-export key classes and interfaces
export {
  ShuffleVerifier,
  MentalPoker,
  SecureRNG,
} from './shuffle-verifier';

export type {
  IShuffleVerifier,
  VerifiableDeck,
  ShuffledDeck,
} from './shuffle-verifier';

export {
  AuthenticationManager,
  RateLimiter,
  PasswordManager,
  MFAManager,
} from './authentication';

export type {
  JWTTokens,
  TokenPayload,
  RefreshTokenPayload,
} from './authentication';

// Security Hardening Exports

// Validation exports
export * from './validation/schemas';

// Middleware exports
export * from './middleware/rate-limiter';
export * from './middleware/csrf';
export * from './middleware/request-signing';
export * from './middleware/security-headers';
export * from './middleware/performance-wrapper';

// Audit logging exports
export * from './audit/logger';

// Monitoring exports
export * from './monitoring/dashboard';
