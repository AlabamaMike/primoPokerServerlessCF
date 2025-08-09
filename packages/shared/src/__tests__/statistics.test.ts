import { describe, it, expect } from '@jest/globals';
import {
  PlayerStatisticsSchema,
  SessionStatisticsSchema,
  HandStatisticsSchema,
  PlayerStatsViewSchema,
  StatsUpdateRequestSchema,
  StatsQuerySchema,
  StatsPeriod,
  StatsGameType,
} from '../types/statistics';

describe('Statistics Schemas', () => {
  describe('PlayerStatisticsSchema', () => {
    it('should validate a complete player statistics object', () => {
      const validStats = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        playerId: '456e7890-e89b-12d3-a456-426614174111',
        period: StatsPeriod.ALL_TIME,
        gameType: StatsGameType.CASH,
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-12-31'),
        handsPlayed: 1000,
        handsWon: 250,
        showdownsWon: 100,
        showdownsSeen: 150,
        totalBetAmount: 50000,
        totalWinnings: 55000,
        totalRakeContributed: 500,
        biggestPotWon: 2500,
        vpip: 25.5,
        pfr: 18.2,
        threeBet: 5.5,
        foldToThreeBet: 65.0,
        aggressionFactor: 2.5,
        aggressionFrequency: 55.0,
        cBet: 65.5,
        foldToCBet: 35.0,
        wtsd: 25.0,
        wsd: 55.0,
        sessionsPlayed: 50,
        totalSessionDuration: 180000,
        profitableSessions: 30,
        tournamentsPlayed: 10,
        tournamentsWon: 2,
        tournamentsCashed: 5,
        averageFinishPosition: 15.5,
        totalBuyIns: 1000,
        totalCashes: 3500,
        roi: 250.0,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastCalculatedAt: new Date(),
      };

      const result = PlayerStatisticsSchema.parse(validStats);
      expect(result).toEqual(validStats);
    });

    it('should validate with minimal required fields and defaults', () => {
      const minimalStats = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        playerId: '456e7890-e89b-12d3-a456-426614174111',
        period: StatsPeriod.DAILY,
        gameType: StatsGameType.ALL,
        periodStart: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        lastCalculatedAt: new Date(),
      };

      const result = PlayerStatisticsSchema.parse(minimalStats);
      expect(result.handsPlayed).toBe(0);
      expect(result.vpip).toBe(0);
      expect(result.totalWinnings).toBe(0);
    });

    it('should reject invalid percentage values', () => {
      const invalidStats = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        playerId: '456e7890-e89b-12d3-a456-426614174111',
        period: StatsPeriod.WEEKLY,
        gameType: StatsGameType.TOURNAMENT,
        periodStart: new Date(),
        vpip: 150, // Invalid: > 100
        createdAt: new Date(),
        updatedAt: new Date(),
        lastCalculatedAt: new Date(),
      };

      expect(() => PlayerStatisticsSchema.parse(invalidStats)).toThrow();
    });

    it('should reject negative values for non-negative fields', () => {
      const invalidStats = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        playerId: '456e7890-e89b-12d3-a456-426614174111',
        period: StatsPeriod.MONTHLY,
        gameType: StatsGameType.SIT_N_GO,
        periodStart: new Date(),
        handsPlayed: -10, // Invalid: negative
        createdAt: new Date(),
        updatedAt: new Date(),
        lastCalculatedAt: new Date(),
      };

      expect(() => PlayerStatisticsSchema.parse(invalidStats)).toThrow();
    });
  });

  describe('SessionStatisticsSchema', () => {
    it('should validate a complete session statistics object', () => {
      const validSession = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        playerId: '456e7890-e89b-12d3-a456-426614174111',
        tableId: '789e0123-e89b-12d3-a456-426614174222',
        gameType: StatsGameType.CASH,
        startTime: new Date('2024-01-01T10:00:00Z'),
        endTime: new Date('2024-01-01T14:00:00Z'),
        duration: 14400,
        buyInAmount: 1000,
        cashOutAmount: 1500,
        netResult: 500,
        handsPlayed: 200,
        handsWon: 50,
        biggestPotWon: 250,
        peakChipCount: 2000,
        lowestChipCount: 500,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = SessionStatisticsSchema.parse(validSession);
      expect(result).toEqual(validSession);
    });

    it('should validate with minimal required fields', () => {
      const minimalSession = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        playerId: '456e7890-e89b-12d3-a456-426614174111',
        tableId: '789e0123-e89b-12d3-a456-426614174222',
        gameType: StatsGameType.TOURNAMENT,
        startTime: new Date(),
        buyInAmount: 100,
        netResult: 0,
        peakChipCount: 100,
        lowestChipCount: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = SessionStatisticsSchema.parse(minimalSession);
      expect(result.duration).toBe(0);
      expect(result.cashOutAmount).toBe(0);
      expect(result.handsPlayed).toBe(0);
    });

    it('should allow negative net result', () => {
      const losingSession = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        playerId: '456e7890-e89b-12d3-a456-426614174111',
        tableId: '789e0123-e89b-12d3-a456-426614174222',
        gameType: StatsGameType.CASH,
        startTime: new Date(),
        buyInAmount: 1000,
        cashOutAmount: 500,
        netResult: -500, // Valid: can be negative
        peakChipCount: 1000,
        lowestChipCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = SessionStatisticsSchema.parse(losingSession);
      expect(result.netResult).toBe(-500);
    });
  });

  describe('HandStatisticsSchema', () => {
    it('should validate a complete hand statistics object', () => {
      const validHand = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        handId: '456e7890-e89b-12d3-a456-426614174111',
        playerId: '789e0123-e89b-12d3-a456-426614174222',
        tableId: 'abc12340-e89b-12d3-a456-426614174333',
        handNumber: 42,
        timestamp: new Date(),
        position: 'BTN',
        preFlopAction: 'RAISE',
        flopAction: 'BET',
        turnAction: 'CHECK',
        riverAction: 'FOLD',
        invested: 100,
        won: 0,
        netResult: -100,
        wentToShowdown: false,
        wonAtShowdown: false,
        holeCardsHash: 'abc123hash',
        createdAt: new Date(),
      };

      const result = HandStatisticsSchema.parse(validHand);
      expect(result).toEqual(validHand);
    });

    it('should validate with minimal required fields', () => {
      const minimalHand = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        handId: '456e7890-e89b-12d3-a456-426614174111',
        playerId: '789e0123-e89b-12d3-a456-426614174222',
        tableId: 'abc12340-e89b-12d3-a456-426614174333',
        handNumber: 1,
        timestamp: new Date(),
        position: 'SB',
        invested: 10,
        won: 0,
        netResult: -10,
        wentToShowdown: false,
        createdAt: new Date(),
      };

      const result = HandStatisticsSchema.parse(minimalHand);
      expect(result.preFlopAction).toBeUndefined();
      expect(result.wonAtShowdown).toBeUndefined();
    });
  });

  describe('StatsQuerySchema', () => {
    it('should validate a complete query', () => {
      const validQuery = {
        playerId: '123e4567-e89b-12d3-a456-426614174000',
        period: StatsPeriod.MONTHLY,
        gameType: StatsGameType.CASH,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        limit: 50,
        offset: 0,
        sortBy: 'winnings' as const,
        sortOrder: 'desc' as const,
      };

      const result = StatsQuerySchema.parse(validQuery);
      expect(result).toEqual(validQuery);
    });

    it('should apply defaults', () => {
      const minimalQuery = {};

      const result = StatsQuerySchema.parse(minimalQuery);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
      expect(result.sortBy).toBe('winnings');
      expect(result.sortOrder).toBe('desc');
    });

    it('should validate multiple player IDs', () => {
      const multiPlayerQuery = {
        playerIds: [
          '123e4567-e89b-12d3-a456-426614174000',
          '456e7890-e89b-12d3-a456-426614174111',
        ],
        sortBy: 'roi' as const,
      };

      const result = StatsQuerySchema.parse(multiPlayerQuery);
      expect(result.playerIds).toHaveLength(2);
    });

    it('should reject invalid limit', () => {
      const invalidQuery = {
        limit: 200, // Max is 100
      };

      expect(() => StatsQuerySchema.parse(invalidQuery)).toThrow();
    });
  });

  describe('StatsUpdateRequestSchema', () => {
    it('should validate update request', () => {
      const validRequest = {
        playerId: '123e4567-e89b-12d3-a456-426614174000',
        period: StatsPeriod.DAILY,
        gameType: StatsGameType.TOURNAMENT,
        forceRecalculation: true,
      };

      const result = StatsUpdateRequestSchema.parse(validRequest);
      expect(result).toEqual(validRequest);
    });

    it('should apply default for forceRecalculation', () => {
      const minimalRequest = {
        playerId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = StatsUpdateRequestSchema.parse(minimalRequest);
      expect(result.forceRecalculation).toBe(false);
    });
  });
});