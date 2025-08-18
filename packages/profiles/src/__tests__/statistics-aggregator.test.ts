import { StatisticsAggregator } from '../statistics-aggregator';
import { StatsPeriod, StatsGameType, RandomUtils } from '@primo-poker/shared';

// Mock dependencies
jest.mock('@primo-poker/persistence');
jest.mock('@primo-poker/core');

describe('StatisticsAggregator', () => {
  let aggregator: StatisticsAggregator;
  let mockDb: any;
  let mockKv: any;

  beforeEach(() => {
    // Mock D1 Database
    mockDb = {
      prepare: jest.fn().mockReturnThis(),
      bind: jest.fn().mockReturnThis(),
      all: jest.fn(),
      first: jest.fn(),
      run: jest.fn()
    };

    // Mock KV Namespace
    mockKv = {
      put: jest.fn(),
      get: jest.fn(),
      list: jest.fn().mockResolvedValue({ keys: [] })
    };

    aggregator = new StatisticsAggregator(mockDb, mockKv);
  });

  describe('runAggregation', () => {
    it('should process statistics for all active players', async () => {
      // Mock active players
      mockDb.all.mockResolvedValueOnce({
        results: [
          { player_id: 'player1' },
          { player_id: 'player2' },
          { player_id: 'player3' }
        ]
      });

      // Mock hand and session data
      mockDb.all.mockResolvedValue({ results: [] });

      await aggregator.runAggregation(StatsPeriod.DAILY);

      // Verify job tracking
      expect(mockKv.put).toHaveBeenCalledWith(
        expect.stringContaining('stats-job:'),
        expect.stringContaining('"status":"running"'),
        expect.any(Object)
      );

      // Verify completion tracking
      expect(mockKv.put).toHaveBeenCalledWith(
        expect.stringContaining('stats-job:'),
        expect.stringContaining('"status":"completed"'),
        expect.any(Object)
      );
    });

    it('should handle errors gracefully', async () => {
      // Mock database error
      mockDb.all.mockRejectedValueOnce(new Error('Database error'));

      await expect(aggregator.runAggregation(StatsPeriod.DAILY)).rejects.toThrow('Database error');

      // Verify error tracking
      expect(mockKv.put).toHaveBeenCalledWith(
        expect.stringContaining('stats-job:'),
        expect.stringContaining('"status":"failed"'),
        expect.any(Object)
      );
    });

    it('should process players in batches', async () => {
      // Create 250 players (more than batch size)
      const players = Array.from({ length: 250 }, (_, i) => ({ player_id: `player${i}` }));
      
      mockDb.all.mockResolvedValueOnce({ results: players });
      mockDb.all.mockResolvedValue({ results: [] });

      await aggregator.runAggregation(StatsPeriod.WEEKLY);

      // Verify progress updates (should be at least 3 updates for 250 players with batch size 100)
      const progressUpdates = mockKv.put.mock.calls.filter(call => 
        call[1].includes('"status":"running"')
      );
      expect(progressUpdates.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('calculatePlayerStats', () => {
    it('should calculate statistics for a specific player', async () => {
      const playerId = 'test-player';

      // Mock hand statistics
      mockDb.all.mockResolvedValueOnce({
        results: [
          {
            id: '1',
            hand_id: 'hand1',
            player_id: playerId,
            table_id: 'table1',
            hand_number: 1,
            timestamp: new Date().toISOString(),
            position: 'BTN',
            pre_flop_action: 'RAISE',
            invested: 100,
            won: 250,
            net_result: 150,
            went_to_showdown: 1,
            won_at_showdown: 1,
            created_at: new Date().toISOString()
          }
        ]
      });

      // Mock session statistics
      mockDb.all.mockResolvedValueOnce({
        results: [
          {
            id: '1',
            player_id: playerId,
            table_id: 'table1',
            game_type: StatsGameType.CASH,
            start_time: new Date().toISOString(),
            duration: 3600,
            buy_in_amount: 1000,
            cash_out_amount: 1500,
            net_result: 500,
            hands_played: 50,
            hands_won: 20,
            biggest_pot_won: 250,
            peak_chip_count: 1800,
            lowest_chip_count: 800,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]
      });

      await aggregator.calculatePlayerStats(playerId, true);

      // Verify statistics were calculated for all periods
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM hand_statistics')
      );
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM session_statistics')
      );
    });
  });

  describe('getJobHistory', () => {
    it('should return job history from KV storage', async () => {
      const mockJobs = [
        {
          name: 'stats-job:job1',
          metadata: {}
        },
        {
          name: 'stats-job:job2',
          metadata: {}
        }
      ];

      mockKv.list.mockResolvedValueOnce({ keys: mockJobs });
      mockKv.get.mockResolvedValueOnce(JSON.stringify({
        status: 'completed',
        period: StatsPeriod.DAILY,
        startTime: new Date().toISOString()
      }));
      mockKv.get.mockResolvedValueOnce(JSON.stringify({
        status: 'running',
        period: StatsPeriod.WEEKLY,
        startTime: new Date().toISOString()
      }));

      const history = await aggregator.getJobHistory(10);

      expect(history).toHaveLength(2);
      expect(history[0].status).toBe('completed');
      expect(history[1].status).toBe('running');
    });

    it('should return empty array when no KV storage is available', async () => {
      const aggregatorNoKv = new StatisticsAggregator(mockDb);
      const history = await aggregatorNoKv.getJobHistory(10);
      expect(history).toEqual([]);
    });
  });

  describe('Statistics Calculation', () => {
    it('should calculate VPIP correctly', () => {
      const hands = [
        { preFlopAction: 'RAISE', invested: 100, won: 0, wentToShowdown: false },
        { preFlopAction: 'CALL', invested: 50, won: 0, wentToShowdown: false },
        { preFlopAction: 'FOLD', invested: 0, won: 0, wentToShowdown: false },
        { preFlopAction: 'CHECK', invested: 0, won: 0, wentToShowdown: false },
        { preFlopAction: 'BET', invested: 100, won: 200, wentToShowdown: true, wonAtShowdown: true }
      ];

      const stats = (aggregator as any).calculateStatistics(hands, []);
      
      // VPIP = 3/5 = 60% (RAISE, CALL, BET)
      expect(stats.vpip).toBe(60);
    });

    it('should calculate PFR correctly', () => {
      const hands = [
        { preFlopAction: 'RAISE', invested: 100, won: 0, wentToShowdown: false },
        { preFlopAction: 'CALL', invested: 50, won: 0, wentToShowdown: false },
        { preFlopAction: 'FOLD', invested: 0, won: 0, wentToShowdown: false },
        { preFlopAction: 'BET', invested: 100, won: 200, wentToShowdown: true },
        { preFlopAction: 'RAISE', invested: 150, won: 300, wentToShowdown: true }
      ];

      const stats = (aggregator as any).calculateStatistics(hands, []);
      
      // PFR = 3/5 = 60% (RAISE, BET, RAISE)
      expect(stats.pfr).toBe(60);
    });

    it('should calculate aggression factor correctly', () => {
      const hands = [
        { 
          preFlopAction: 'RAISE', 
          flopAction: 'BET',
          turnAction: 'RAISE',
          riverAction: 'BET',
          invested: 400, 
          won: 800, 
          wentToShowdown: true 
        },
        { 
          preFlopAction: 'CALL', 
          flopAction: 'CALL',
          turnAction: 'FOLD',
          invested: 100, 
          won: 0, 
          wentToShowdown: false 
        }
      ];

      const stats = (aggregator as any).calculateStatistics(hands, []);
      
      // Aggression Factor = (4 bets/raises) / (2 calls) = 2
      expect(stats.aggressionFactor).toBe(2);
    });

    it('should calculate tournament ROI correctly', () => {
      const sessions = [
        {
          gameType: StatsGameType.TOURNAMENT,
          buyInAmount: 100,
          cashOutAmount: 0,
          netResult: -100,
          duration: 3600
        },
        {
          gameType: StatsGameType.TOURNAMENT,
          buyInAmount: 100,
          cashOutAmount: 300,
          netResult: 200,
          duration: 7200
        },
        {
          gameType: StatsGameType.TOURNAMENT,
          buyInAmount: 50,
          cashOutAmount: 150,
          netResult: 100,
          duration: 5400
        }
      ];

      const stats = (aggregator as any).calculateStatistics([], sessions);
      
      // ROI = ((450 - 250) / 250) * 100 = 80%
      expect(stats.roi).toBe(80);
      expect(stats.tournamentsPlayed).toBe(3);
      expect(stats.totalBuyIns).toBe(250);
      expect(stats.totalCashes).toBe(450);
    });
  });

  describe('Period calculations', () => {
    it('should calculate correct cutoff times', () => {
      const now = new Date();
      
      // Test daily cutoff (24 hours ago)
      const dailyCutoff = (aggregator as any).getCutoffTime(StatsPeriod.DAILY);
      const dailyDiff = now.getTime() - dailyCutoff.getTime();
      expect(dailyDiff).toBeCloseTo(24 * 60 * 60 * 1000, -10000);

      // Test weekly cutoff (7 days ago)
      const weeklyCutoff = (aggregator as any).getCutoffTime(StatsPeriod.WEEKLY);
      const weeklyDiff = now.getTime() - weeklyCutoff.getTime();
      expect(weeklyDiff).toBeCloseTo(7 * 24 * 60 * 60 * 1000, -10000);

      // Test all-time cutoff (epoch)
      const allTimeCutoff = (aggregator as any).getCutoffTime(StatsPeriod.ALL_TIME);
      expect(allTimeCutoff.getTime()).toBe(0);
    });

    it('should calculate correct period start dates', () => {
      // Test daily period start (beginning of today)
      const dailyStart = (aggregator as any).getPeriodStart(StatsPeriod.DAILY);
      expect(dailyStart.getHours()).toBe(0);
      expect(dailyStart.getMinutes()).toBe(0);
      expect(dailyStart.getSeconds()).toBe(0);

      // Test monthly period start (first day of month)
      const monthlyStart = (aggregator as any).getPeriodStart(StatsPeriod.MONTHLY);
      expect(monthlyStart.getDate()).toBe(1);
      expect(monthlyStart.getHours()).toBe(0);

      // Test yearly period start (January 1st)
      const yearlyStart = (aggregator as any).getPeriodStart(StatsPeriod.YEARLY);
      expect(yearlyStart.getMonth()).toBe(0);
      expect(yearlyStart.getDate()).toBe(1);
    });
  });
});