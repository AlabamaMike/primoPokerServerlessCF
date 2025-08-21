import { z } from 'zod';

/**
 * Player-related types and enums
 */

export enum Suit {
  HEARTS = 'hearts',
  DIAMONDS = 'diamonds',
  CLUBS = 'clubs',
  SPADES = 'spades',
}

export enum Rank {
  TWO = '2',
  THREE = '3',
  FOUR = '4',
  FIVE = '5',
  SIX = '6',
  SEVEN = '7',
  EIGHT = '8',
  NINE = '9',
  TEN = '10',
  JACK = 'J',
  QUEEN = 'Q',
  KING = 'K',
  ACE = 'A',
}

export enum PlayerStatus {
  ACTIVE = 'active',
  SITTING_OUT = 'sitting_out',
  AWAY = 'away',
  DISCONNECTED = 'disconnected',
  ELIMINATED = 'eliminated',
  FOLDED = 'folded',
  ALL_IN = 'all_in',
  WAITING = 'waiting',
  PLAYING = 'playing',
}

/**
 * Zod schemas
 */

export const CardSchema = z.object({
  suit: z.nativeEnum(Suit),
  rank: z.nativeEnum(Rank),
});

export const ChipSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().default('USD'),
});

export const PositionSchema = z.object({
  seat: z.number().int().min(0).max(9),
  isButton: z.boolean().default(false),
  isSmallBlind: z.boolean().default(false),
  isBigBlind: z.boolean().default(false),
});

export const PlayerSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(3).max(20),
  email: z.string().email(),
  chipCount: z.number().nonnegative(),
  position: PositionSchema.optional(),
  status: z.nativeEnum(PlayerStatus),
  isDealer: z.boolean().default(false),
  timeBank: z.number().int().nonnegative().default(30),
  lastAction: z.date().optional(),
});

/**
 * Type exports
 */

export type Card = z.infer<typeof CardSchema>;
export type Chip = z.infer<typeof ChipSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type Player = z.infer<typeof PlayerSchema>;

/**
 * Extended interfaces
 */

export interface PublicPlayerInfo {
  playerId: string;
  username: string;
  chipCount: number;
  isActive: boolean;
  avatarUrl?: string;
  countryCode?: string;
}

export interface PlayerProfile extends Player {
  displayName?: string;
  bio?: string;
  location?: string;
  joinedAt: Date;
  stats?: {
    handsPlayed: number;
    handsWon: number;
    totalWinnings: number;
    biggestPot: number;
  };
}