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
