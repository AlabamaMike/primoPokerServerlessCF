import { z } from 'zod';
import { Player } from './player';

/**
 * Tournament-related types and enums
 */

export enum TournamentState {
  REGISTERING = 'registering',
  STARTING = 'starting',
  IN_PROGRESS = 'in_progress',
  FINAL_TABLE = 'final_table',
  FINISHED = 'finished',
  CANCELLED = 'cancelled',
}

export enum TournamentType {
  FREEZEOUT = 'freezeout',
  REBUY = 'rebuy',
  TURBO = 'turbo',
  HYPER_TURBO = 'hyper_turbo',
  SATELLITE = 'satellite',
  BOUNTY = 'bounty',
}

/**
 * Zod schemas
 */

export const TournamentConfigSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  type: z.nativeEnum(TournamentType),
  buyIn: z.number().positive(),
  rake: z.number().nonnegative(),
  startingChips: z.number().positive(),
  blindLevelDuration: z.number().int().positive(), // minutes
  maxPlayers: z.number().int().positive(),
  minPlayers: z.number().int().positive(),
  rebuyPeriod: z.number().int().nonnegative().optional(), // levels
  rebuyAmount: z.number().positive().optional(),
  addOnAmount: z.number().positive().optional(),
  scheduledStart: z.date(),
  lateRegistrationLevels: z.number().int().nonnegative().default(0),
});

export const TournamentSchema = z.object({
  id: z.string().uuid(),
  config: TournamentConfigSchema,
  state: z.nativeEnum(TournamentState),
  currentLevel: z.number().int().nonnegative(),
  registeredPlayers: z.number().int().nonnegative(),
  remainingPlayers: z.number().int().nonnegative(),
  prizePool: z.number().nonnegative(),
  startedAt: z.date().optional(),
  finishedAt: z.date().optional(),
});

/**
 * Type exports
 */

export type TournamentConfig = z.infer<typeof TournamentConfigSchema>;
export type Tournament = z.infer<typeof TournamentSchema>;

/**
 * Extended interfaces
 */

export interface TournamentPlayer extends Player {
  tournamentChips: number;
  tableId?: string;
  tableSeat?: number;
  bustOutPosition?: number;
  rebuysUsed: number;
  addOnsUsed: number;
  bountyValue?: number;
}

export interface TournamentPayout {
  position: number;
  amount: number;
  percentage: number;
}

export interface TournamentStructure {
  blindLevels: Array<{
    level: number;
    smallBlind: number;
    bigBlind: number;
    ante: number;
    duration: number;
  }>;
  payoutStructure: TournamentPayout[];
}

export interface TournamentResult {
  tournamentId: string;
  winner: Player;
  finalTable: Player[];
  prizePool: number;
  payouts: Array<{
    playerId: string;
    position: number;
    amount: number;
  }>;
}