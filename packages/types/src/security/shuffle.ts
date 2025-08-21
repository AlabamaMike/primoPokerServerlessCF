/**
 * Card shuffling and deck security types
 */

export interface ShuffleProof {
  commitment: string;
  permutation: number[];
  randomness: string;
  timestamp: number;
  signature: string;
}

export interface DeckCommitment {
  deckId: string;
  commitment: string;
  merkleRoot: string;
  cardCommitments: string[];
  createdAt: Date;
  verifiedBy: string[];
}

export interface ShuffleVerification {
  deckId: string;
  verifierId: string;
  isValid: boolean;
  proof: ShuffleProof;
  verifiedAt: Date;
  errorReason?: string;
}

export interface SecureCard {
  encryptedValue: string;
  commitment: string;
  proof?: string;
}

export interface MentalPokerProtocol {
  protocolVersion: string;
  participants: string[];
  deckSize: number;
  encryptionScheme: 'RSA' | 'ElGamal' | 'SRA';
  commitmentScheme: 'SHA256' | 'SHA3' | 'Blake2b';
}

export interface CardReveal {
  playerId: string;
  cardIndex: number;
  decryptionKey: string;
  proof: string;
  timestamp: Date;
}

export interface DeckState {
  deckId: string;
  state: 'initialized' | 'shuffled' | 'committed' | 'dealing' | 'complete';
  currentDealerIndex: number;
  cardsDealt: number;
  cardsRemaining: number;
  lastAction: Date;
}