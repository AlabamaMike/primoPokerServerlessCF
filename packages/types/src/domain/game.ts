import { z } from 'zod';
import { Card, Player } from './player';

/**
 * Game types and enums
 */

export enum GameType {
  TEXAS_HOLDEM = 'texas_holdem',
  OMAHA = 'omaha',
  OMAHA_HI_LO = 'omaha_hi_lo',
  SEVEN_CARD_STUD = '7_card_stud',
  SEVEN_CARD_STUD_HI_LO = '7_card_stud_hi_lo',
}

export enum BettingStructure {
  LIMIT = 'limit',
  NO_LIMIT = 'no_limit',
  POT_LIMIT = 'pot_limit',
}

export enum GameFormat {
  CASH = 'cash',
  TOURNAMENT = 'tournament',
  SIT_N_GO = 'sit_n_go',
  HEADS_UP = 'heads_up',
}

export enum GamePhase {
  WAITING = 'waiting',
  PRE_FLOP = 'pre_flop',
  FLOP = 'flop',
  TURN = 'turn',
  RIVER = 'river',
  SHOWDOWN = 'showdown',
  FINISHED = 'finished',
}

export enum PlayerAction {
  FOLD = 'fold',
  CHECK = 'check',
  CALL = 'call',
  BET = 'bet',
  RAISE = 'raise',
  ALL_IN = 'all_in',
}

export enum HandRanking {
  HIGH_CARD = 0,
  PAIR = 1,
  TWO_PAIR = 2,
  THREE_OF_A_KIND = 3,
  STRAIGHT = 4,
  FLUSH = 5,
  FULL_HOUSE = 6,
  FOUR_OF_A_KIND = 7,
  STRAIGHT_FLUSH = 8,
  ROYAL_FLUSH = 9,
}

/**
 * Zod schemas
 */

export const CardSchema = z.object({
  suit: z.enum(['hearts', 'diamonds', 'clubs', 'spades']),
  rank: z.enum(['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']),
});

export const BetSchema = z.object({
  playerId: z.string().uuid(),
  action: z.nativeEnum(PlayerAction),
  amount: z.number().nonnegative(),
  timestamp: z.date(),
});

export const GameStateSchema = z.object({
  tableId: z.string().uuid(),
  gameId: z.string().uuid(),
  phase: z.nativeEnum(GamePhase),
  pot: z.number().nonnegative(),
  sidePots: z.array(z.number().nonnegative()).default([]),
  communityCards: z.array(CardSchema).max(5),
  currentBet: z.number().nonnegative(),
  minRaise: z.number().positive(),
  activePlayerId: z.string().uuid().optional(),
  dealerId: z.string().uuid(),
  smallBlindId: z.string().uuid(),
  bigBlindId: z.string().uuid(),
  handNumber: z.number().int().positive(),
  timestamp: z.date(),
});

/**
 * Type exports
 */

export type Bet = z.infer<typeof BetSchema>;
export type GameState = z.infer<typeof GameStateSchema>;

/**
 * Extended interfaces
 */

export interface GamePlayer extends Player {
  chips: number;
  currentBet: number;
  hasActed: boolean;
  isFolded: boolean;
  isAllIn: boolean;
  cards?: Card[];
}

export interface BetResult {
  success: boolean;
  error?: string;
  newGameState?: GameState;
  playerChips?: number;
}

export interface ShowdownResult {
  winners: Array<{
    playerId: string;
    hand: Card[];
    handRanking: HandRanking;
    winAmount: number;
  }>;
  sidePotWinners?: Array<{
    playerId: string;
    potIndex: number;
    winAmount: number;
  }>;
}