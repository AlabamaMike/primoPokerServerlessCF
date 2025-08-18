import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import {
  PlayerStatisticsSchema,
  PlayerStatsViewSchema,
  StatsQuerySchema,
  StatsPeriod,
  StatsGameType
} from '@primo-poker/shared';

describe('Statistics Response Validation', () => {
  describe('PlayerStatisticsSchema', () => {
    it('should validate a complete player statistics object', () => {
      const validStats = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        playerId: '550e8400-e29b-41d4-a716-446655440001',
        period: StatsPeriod.ALL_TIME,
        gameType: StatsGameType.CASH,
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-12-31'),
        handsPlayed: 1000,
        handsWon: 150,
        showdownsWon: 75,
        showdownsSeen: 120,
        totalBetAmount: 50000,
        totalWinnings: 55000,
        totalRakeContributed: 2500,
        biggestPotWon: 5000,
        vpip: 25.5,
        pfr: 18.2,
        threeBet: 8.5,
        foldToThreeBet: 65.0,
        aggressionFactor: 2.1,
        aggressionFrequency: 45.5,
        cBet: 55.0,
        foldToCBet: 40.0,
        wtsd: 28.5,
        wsd: 52.0,
        sessionsPlayed: 50,
        totalSessionDuration: 180000,
        profitableSessions: 35,
        tournamentsPlayed: 10,
        tournamentsWon: 2,
        tournamentsCashed: 5,
        averageFinishPosition: 15.5,
        totalBuyIns: 1000,
        totalCashes: 2500,
        roi: 150.0,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastCalculatedAt: new Date()
      };

      const result = PlayerStatisticsSchema.safeParse(validStats);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID formats', () => {
      const invalidStats = {
        id: 'not-a-uuid',
        playerId: 'also-not-a-uuid',
        period: StatsPeriod.ALL_TIME,
        gameType: StatsGameType.CASH,
        periodStart: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        lastCalculatedAt: new Date()
      };

      const result = PlayerStatisticsSchema.safeParse(invalidStats);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('id');
    });

    it('should reject negative values for count fields', () => {
      const invalidStats = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        playerId: '550e8400-e29b-41d4-a716-446655440001',
        period: StatsPeriod.ALL_TIME,
        gameType: StatsGameType.CASH,
        periodStart: new Date(),
        handsPlayed: -10, // Invalid negative value
        handsWon: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastCalculatedAt: new Date()
      };

      const result = PlayerStatisticsSchema.safeParse(invalidStats);
      expect(result.success).toBe(false);
    });

    it('should reject percentages outside 0-100 range', () => {
      const invalidStats = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        playerId: '550e8400-e29b-41d4-a716-446655440001',
        period: StatsPeriod.ALL_TIME,
        gameType: StatsGameType.CASH,
        periodStart: new Date(),
        vpip: 150.0, // Invalid percentage > 100
        pfr: -10.0,  // Invalid percentage < 0
        createdAt: new Date(),
        updatedAt: new Date(),
        lastCalculatedAt: new Date()
      };

      const result = PlayerStatisticsSchema.safeParse(invalidStats);
      expect(result.success).toBe(false);
    });

    it('should allow optional tournament fields to be undefined', () => {
      const cashGameStats = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        playerId: '550e8400-e29b-41d4-a716-446655440001',
        period: StatsPeriod.ALL_TIME,
        gameType: StatsGameType.CASH,
        periodStart: new Date(),
        handsPlayed: 100,
        // Tournament fields omitted
        createdAt: new Date(),
        updatedAt: new Date(),
        lastCalculatedAt: new Date()
      };

      const result = PlayerStatisticsSchema.safeParse(cashGameStats);
      expect(result.success).toBe(true);
    });
  });

  describe('PlayerStatsViewSchema', () => {
    it('should validate a complete leaderboard entry', () => {
      const validEntry = {
        playerId: '550e8400-e29b-41d4-a716-446655440000',
        username: 'TopPlayer123',
        lifetimeHandsPlayed: 10000,
        lifetimeWinnings: 50000,
        lifetimeWinRate: 8.5,
        recentHandsPlayed: 1000,
        recentWinnings: 5000,
        recentWinRate: 10.2,
        overallRank: 1,
        profitRank: 1,
        volumeRank: 3,
        achievementsCount: 15,
        lastActiveAt: new Date()
      };

      const result = PlayerStatsViewSchema.safeParse(validEntry);
      expect(result.success).toBe(true);
    });

    it('should allow null/undefined for optional rank fields', () => {
      const unrankedEntry = {
        playerId: '550e8400-e29b-41d4-a716-446655440000',
        username: 'NewPlayer',
        lifetimeHandsPlayed: 50,
        lifetimeWinnings: -100,
        lifetimeWinRate: -5.0,
        recentHandsPlayed: 50,
        recentWinnings: -100,
        recentWinRate: -5.0,
        overallRank: null,
        profitRank: null,
        volumeRank: undefined,
        achievementsCount: 0,
        lastActiveAt: new Date()
      };

      const result = PlayerStatsViewSchema.safeParse(unrankedEntry);
      expect(result.success).toBe(true);
    });

    it('should reject ranks less than 1', () => {
      const invalidEntry = {
        playerId: '550e8400-e29b-41d4-a716-446655440000',
        username: 'Player',
        lifetimeHandsPlayed: 100,
        lifetimeWinnings: 1000,
        lifetimeWinRate: 5.0,
        recentHandsPlayed: 10,
        recentWinnings: 100,
        recentWinRate: 5.0,
        overallRank: 0, // Invalid rank
        achievementsCount: 0,
        lastActiveAt: new Date()
      };

      const result = PlayerStatsViewSchema.safeParse(invalidEntry);
      expect(result.success).toBe(false);
    });

    it('should reject negative achievements count', () => {
      const invalidEntry = {
        playerId: '550e8400-e29b-41d4-a716-446655440000',
        username: 'Player',
        lifetimeHandsPlayed: 100,
        lifetimeWinnings: 1000,
        lifetimeWinRate: 5.0,
        recentHandsPlayed: 10,
        recentWinnings: 100,
        recentWinRate: 5.0,
        achievementsCount: -1, // Invalid
        lastActiveAt: new Date()
      };

      const result = PlayerStatsViewSchema.safeParse(invalidEntry);
      expect(result.success).toBe(false);
    });
  });

  describe('StatsQuerySchema', () => {
    it('should validate a complete query object', () => {
      const validQuery = {
        playerId: '550e8400-e29b-41d4-a716-446655440000',
        playerIds: [
          '550e8400-e29b-41d4-a716-446655440001',
          '550e8400-e29b-41d4-a716-446655440002'
        ],
        period: StatsPeriod.MONTHLY,
        gameType: StatsGameType.TOURNAMENT,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        limit: 50,
        offset: 100,
        sortBy: 'roi' as const,
        sortOrder: 'desc' as const
      };

      const result = StatsQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it('should apply default values', () => {
      const minimalQuery = {};

      const result = StatsQuerySchema.safeParse(minimalQuery);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        limit: 20,
        offset: 0,
        sortBy: 'winnings',
        sortOrder: 'desc'
      });
    });

    it('should reject limit greater than 100', () => {
      const invalidQuery = {
        limit: 150 // Too high
      };

      const result = StatsQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should reject negative offset', () => {
      const invalidQuery = {
        offset: -10
      };

      const result = StatsQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should reject invalid sort fields', () => {
      const invalidQuery = {
        sortBy: 'invalidField'
      };

      const result = StatsQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should validate player ID arrays', () => {
      const queryWithInvalidIds = {
        playerIds: ['valid-uuid', 'not-a-uuid']
      };

      const result = StatsQuerySchema.safeParse(queryWithInvalidIds);
      expect(result.success).toBe(false);
    });
  });

  describe('Enum Validation', () => {
    it('should validate StatsPeriod enum values', () => {
      const validPeriods = Object.values(StatsPeriod);
      validPeriods.forEach(period => {
        const result = z.nativeEnum(StatsPeriod).safeParse(period);
        expect(result.success).toBe(true);
      });

      const invalidPeriod = 'invalid_period';
      const result = z.nativeEnum(StatsPeriod).safeParse(invalidPeriod);
      expect(result.success).toBe(false);
    });

    it('should validate StatsGameType enum values', () => {
      const validTypes = Object.values(StatsGameType);
      validTypes.forEach(type => {
        const result = z.nativeEnum(StatsGameType).safeParse(type);
        expect(result.success).toBe(true);
      });

      const invalidType = 'invalid_type';
      const result = z.nativeEnum(StatsGameType).safeParse(invalidType);
      expect(result.success).toBe(false);
    });
  });

  describe('API Response Structure', () => {
    it('should validate successful statistics response', () => {
      const ResponseSchema = z.object({
        success: z.literal(true),
        data: z.object({
          playerId: z.string().uuid(),
          statistics: z.array(PlayerStatisticsSchema),
          period: z.string(),
          gameType: z.string()
        })
      });

      const validResponse = {
        success: true,
        data: {
          playerId: '550e8400-e29b-41d4-a716-446655440000',
          statistics: [{
            id: '550e8400-e29b-41d4-a716-446655440001',
            playerId: '550e8400-e29b-41d4-a716-446655440000',
            period: StatsPeriod.ALL_TIME,
            gameType: StatsGameType.ALL,
            periodStart: new Date(),
            handsPlayed: 100,
            handsWon: 20,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastCalculatedAt: new Date()
          }],
          period: 'all_time',
          gameType: 'all'
        }
      };

      const result = ResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('should validate successful leaderboard response', () => {
      const LeaderboardResponseSchema = z.object({
        success: z.literal(true),
        data: z.object({
          leaderboard: z.array(PlayerStatsViewSchema),
          query: z.object({
            period: z.nativeEnum(StatsPeriod),
            gameType: z.nativeEnum(StatsGameType),
            sortBy: z.string(),
            sortOrder: z.string(),
            limit: z.number(),
            offset: z.number()
          }),
          pagination: z.object({
            limit: z.number(),
            offset: z.number(),
            hasMore: z.boolean(),
            nextOffset: z.number().nullable()
          })
        })
      });

      const validResponse = {
        success: true,
        data: {
          leaderboard: [{
            playerId: '550e8400-e29b-41d4-a716-446655440000',
            username: 'Player1',
            lifetimeHandsPlayed: 1000,
            lifetimeWinnings: 5000,
            lifetimeWinRate: 8.5,
            recentHandsPlayed: 100,
            recentWinnings: 500,
            recentWinRate: 10.0,
            achievementsCount: 5,
            lastActiveAt: new Date()
          }],
          query: {
            period: StatsPeriod.ALL_TIME,
            gameType: StatsGameType.ALL,
            sortBy: 'winnings',
            sortOrder: 'desc',
            limit: 20,
            offset: 0
          },
          pagination: {
            limit: 20,
            offset: 0,
            hasMore: false,
            nextOffset: null
          }
        }
      };

      const result = LeaderboardResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('should validate error response structure', () => {
      const ErrorResponseSchema = z.object({
        success: z.literal(false),
        error: z.object({
          code: z.string(),
          message: z.string(),
          retryAfter: z.number().optional()
        })
      });

      const validError = {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
          retryAfter: 30
        }
      };

      const result = ErrorResponseSchema.safeParse(validError);
      expect(result.success).toBe(true);
    });
  });
});