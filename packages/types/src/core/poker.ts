/**
 * Core poker game mechanics types
 */

export interface PokerHand {
  cards: Array<{ suit: string; rank: string }>;
  ranking: number;
  rankingName: string;
  highCards: string[];
  kickers: string[];
}

export interface HandComparison {
  winner: 'hand1' | 'hand2' | 'tie';
  hand1: PokerHand;
  hand2: PokerHand;
  reason: string;
}

export interface PotDistribution {
  mainPot: {
    amount: number;
    eligiblePlayers: string[];
    winners: string[];
  };
  sidePots: Array<{
    amount: number;
    eligiblePlayers: string[];
    winners: string[];
  }>;
  totalRake: number;
}

export interface DealerPosition {
  currentDealer: number;
  smallBlind: number;
  bigBlind: number;
  nextDealer: number;
}

export interface BettingRound {
  phase: string;
  currentBet: number;
  minRaise: number;
  pot: number;
  activePlayers: string[];
  actionsThisRound: Array<{
    playerId: string;
    action: string;
    amount: number;
  }>;
}

export interface GameRules {
  minPlayers: number;
  maxPlayers: number;
  allowStraddle: boolean;
  allowRunItTwice: boolean;
  allowRabbitHunt: boolean;
  showFoldedHands: boolean;
  timeBankSeconds: number;
  actionTimeoutSeconds: number;
  sitOutAfterFolds: number;
}

export interface HandHistory {
  handId: string;
  tableId: string;
  handNumber: number;
  timestamp: Date;
  players: Array<{
    playerId: string;
    seatNumber: number;
    startingChips: number;
    holeCards?: string[];
  }>;
  actions: Array<{
    phase: string;
    playerId: string;
    action: string;
    amount?: number;
    timestamp: Date;
  }>;
  communityCards: string[];
  winners: Array<{
    playerId: string;
    amount: number;
    hand?: string;
  }>;
  rake: number;
}