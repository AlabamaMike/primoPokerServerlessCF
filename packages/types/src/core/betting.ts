/**
 * Betting-specific types
 */

export interface BettingLimits {
  minBet: number;
  maxBet: number;
  minRaise: number;
  maxRaise: number;
  potSize?: number; // For pot-limit games
  currentBet: number;
}

export interface BettingAction {
  playerId: string;
  action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in';
  amount: number;
  isValid: boolean;
  timestamp: Date;
}

export interface BettingValidation {
  isValid: boolean;
  reason?: string;
  suggestedAmount?: number;
  allowedActions: string[];
}

export interface AllInScenario {
  playerId: string;
  amount: number;
  potEligibility: number;
  sidePotIndex?: number;
}

export interface RakeCalculation {
  potAmount: number;
  rakePercentage: number;
  rakeCap: number;
  calculatedRake: number;
  netPot: number;
}

export interface BettingHistory {
  round: string;
  actions: BettingAction[];
  potAtStart: number;
  potAtEnd: number;
  totalBets: number;
}

export interface ChipTransaction {
  playerId: string;
  type: 'bet' | 'win' | 'rake' | 'ante' | 'blind';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  timestamp: Date;
}