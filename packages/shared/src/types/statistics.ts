import { z } from 'zod';

// Enums for statistics types
export enum StatsPeriod {
  ALL_TIME = 'all_time',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export enum StatsGameType {
  ALL = 'all',
  CASH = 'cash',
  TOURNAMENT = 'tournament',
  SIT_N_GO = 'sit_n_go',
}

// Player Statistics Schema
export const PlayerStatisticsSchema = z.object({
  id: z.string().uuid(),
  playerId: z.string().uuid(),
  period: z.nativeEnum(StatsPeriod),
  gameType: z.nativeEnum(StatsGameType),
  periodStart: z.date(),
  periodEnd: z.date().optional(),
  
  // Core gameplay statistics
  handsPlayed: z.number().int().nonnegative().default(0),
  handsWon: z.number().int().nonnegative().default(0),
  showdownsWon: z.number().int().nonnegative().default(0),
  showdownsSeen: z.number().int().nonnegative().default(0),
  
  // Betting statistics
  totalBetAmount: z.number().nonnegative().default(0),
  totalWinnings: z.number().nonnegative().default(0),
  totalRakeContributed: z.number().nonnegative().default(0),
  biggestPotWon: z.number().nonnegative().default(0),
  
  // Pre-flop statistics
  vpip: z.number().min(0).max(100).default(0), // Voluntarily Put money In Pot %
  pfr: z.number().min(0).max(100).default(0), // Pre-Flop Raise %
  threeBet: z.number().min(0).max(100).default(0), // 3-bet percentage
  foldToThreeBet: z.number().min(0).max(100).default(0),
  
  // Aggression statistics
  aggressionFactor: z.number().nonnegative().default(0), // (Bet + Raise) / Call
  aggressionFrequency: z.number().min(0).max(100).default(0), // % of non-check actions that are aggressive
  
  // Post-flop statistics
  cBet: z.number().min(0).max(100).default(0), // Continuation bet %
  foldToCBet: z.number().min(0).max(100).default(0),
  wtsd: z.number().min(0).max(100).default(0), // Went To ShowDown %
  wsd: z.number().min(0).max(100).default(0), // Won at ShowDown %
  
  // Session statistics
  sessionsPlayed: z.number().int().nonnegative().default(0),
  totalSessionDuration: z.number().int().nonnegative().default(0), // in seconds
  profitableSessions: z.number().int().nonnegative().default(0),
  
  // Tournament specific (null for cash games)
  tournamentsPlayed: z.number().int().nonnegative().optional(),
  tournamentsWon: z.number().int().nonnegative().optional(),
  tournamentsCashed: z.number().int().nonnegative().optional(),
  averageFinishPosition: z.number().nonnegative().optional(),
  totalBuyIns: z.number().nonnegative().optional(),
  totalCashes: z.number().nonnegative().optional(),
  roi: z.number().optional(), // Return on Investment %
  
  // Timestamps
  createdAt: z.date(),
  updatedAt: z.date(),
  lastCalculatedAt: z.date(),
});

// Session Statistics Schema
export const SessionStatisticsSchema = z.object({
  id: z.string().uuid(),
  playerId: z.string().uuid(),
  tableId: z.string().uuid(),
  gameType: z.nativeEnum(StatsGameType),
  
  // Session info
  startTime: z.date(),
  endTime: z.date().optional(),
  duration: z.number().int().nonnegative().default(0), // in seconds
  
  // Session results
  buyInAmount: z.number().nonnegative(),
  cashOutAmount: z.number().nonnegative().default(0),
  netResult: z.number(), // can be negative
  
  // Session activity
  handsPlayed: z.number().int().nonnegative().default(0),
  handsWon: z.number().int().nonnegative().default(0),
  biggestPotWon: z.number().nonnegative().default(0),
  
  // Peak statistics during session
  peakChipCount: z.number().nonnegative(),
  lowestChipCount: z.number().nonnegative(),
  
  // Timestamps
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Hand History Statistics Schema (for detailed analysis)
export const HandStatisticsSchema = z.object({
  id: z.string().uuid(),
  handId: z.string().uuid(),
  playerId: z.string().uuid(),
  tableId: z.string().uuid(),
  
  // Hand info
  handNumber: z.number().int().positive(),
  timestamp: z.date(),
  
  // Player position
  position: z.string(), // e.g., 'BTN', 'SB', 'BB', 'UTG', etc.
  
  // Actions summary
  preFlopAction: z.string().optional(), // e.g., 'RAISE', 'CALL', 'FOLD'
  flopAction: z.string().optional(),
  turnAction: z.string().optional(),
  riverAction: z.string().optional(),
  
  // Money flow
  invested: z.number().nonnegative(),
  won: z.number().nonnegative(),
  netResult: z.number(),
  
  // Hand outcome
  wentToShowdown: z.boolean(),
  wonAtShowdown: z.boolean().optional(),
  
  // Cards (encrypted/hashed for security)
  holeCardsHash: z.string().optional(),
  
  createdAt: z.date(),
});

// Aggregated Statistics View Schema
export const PlayerStatsViewSchema = z.object({
  playerId: z.string().uuid(),
  username: z.string(),
  
  // Lifetime stats
  lifetimeHandsPlayed: z.number().int().nonnegative(),
  lifetimeWinnings: z.number(),
  lifetimeWinRate: z.number(), // BB/100 or similar
  
  // Recent performance (last 30 days)
  recentHandsPlayed: z.number().int().nonnegative(),
  recentWinnings: z.number(),
  recentWinRate: z.number(),
  
  // Rankings
  overallRank: z.number().int().positive().optional(),
  profitRank: z.number().int().positive().optional(),
  volumeRank: z.number().int().positive().optional(),
  
  // Badges/achievements count
  achievementsCount: z.number().int().nonnegative().default(0),
  
  lastActiveAt: z.date(),
});

// Statistics Update Request Schema
export const StatsUpdateRequestSchema = z.object({
  playerId: z.string().uuid(),
  period: z.nativeEnum(StatsPeriod).optional(),
  gameType: z.nativeEnum(StatsGameType).optional(),
  forceRecalculation: z.boolean().default(false),
});

// Statistics Query Schema
export const StatsQuerySchema = z.object({
  playerId: z.string().uuid().optional(),
  playerIds: z.array(z.string().uuid()).optional(),
  period: z.nativeEnum(StatsPeriod).optional(),
  gameType: z.nativeEnum(StatsGameType).optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
  sortBy: z.enum(['winnings', 'handsPlayed', 'winRate', 'roi']).default('winnings'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Type exports
export type PlayerStatistics = z.infer<typeof PlayerStatisticsSchema>;
export type SessionStatistics = z.infer<typeof SessionStatisticsSchema>;
export type HandStatistics = z.infer<typeof HandStatisticsSchema>;
export type PlayerStatsView = z.infer<typeof PlayerStatsViewSchema>;
export type StatsUpdateRequest = z.infer<typeof StatsUpdateRequestSchema>;
export type StatsQuery = z.infer<typeof StatsQuerySchema>;

// Statistics calculation helpers
export interface StatsCalculationResult {
  vpip: number;
  pfr: number;
  aggressionFactor: number;
  wtsd: number;
  wsd: number;
  winRate: number; // BB/100 hands
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  value: number;
  change: number; // Position change from previous period
}

export interface StatsSnapshot {
  timestamp: Date;
  stats: PlayerStatistics;
  sessionStats?: SessionStatistics;
}