/**
 * Hand evaluation types
 */

export interface EvaluatedHand {
  cards: Array<{ suit: string; rank: string }>;
  ranking: HandRankingType;
  strength: number; // Numeric value for comparison
  description: string; // e.g., "Pair of Kings"
  bestFive: Array<{ suit: string; rank: string }>;
  kickers: Array<{ suit: string; rank: string }>;
}

export enum HandRankingType {
  HIGH_CARD = 'high_card',
  PAIR = 'pair',
  TWO_PAIR = 'two_pair',
  THREE_OF_A_KIND = 'three_of_a_kind',
  STRAIGHT = 'straight',
  FLUSH = 'flush',
  FULL_HOUSE = 'full_house',
  FOUR_OF_A_KIND = 'four_of_a_kind',
  STRAIGHT_FLUSH = 'straight_flush',
  ROYAL_FLUSH = 'royal_flush',
}

export interface HandStrength {
  ranking: HandRankingType;
  primaryRank?: string; // e.g., "K" for pair of kings
  secondaryRank?: string; // e.g., "7" for two pair K-7
  kickers: string[]; // Remaining cards for tiebreaking
}

export interface WinningHand {
  playerId: string;
  hand: EvaluatedHand;
  winPercentage: number; // For split pots
  description: string;
}

export interface BoardTexture {
  isMonotone: boolean; // All same suit
  isRainbow: boolean; // All different suits
  isTwoTone: boolean; // Two suits
  hasPair: boolean;
  hasTrips: boolean;
  straightPossible: boolean;
  flushPossible: boolean;
  connectedCards: number;
}

export interface OutsCalculation {
  currentHand: EvaluatedHand;
  possibleImprovedHands: Array<{
    ranking: HandRankingType;
    outs: number;
    probability: number;
  }>;
  totalOuts: number;
}