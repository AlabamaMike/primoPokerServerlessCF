import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  D1PlayerStatisticsRepository,
  D1SessionStatisticsRepository,
  D1HandStatisticsRepository,
} from '../statistics-repository';
import {
  StatsPeriod,
  StatsGameType,
  PlayerStatistics,
  SessionStatistics,
  HandStatistics,
  RandomUtils,
} from '@primo-poker/shared';

// Mock D1 Database
class MockD1Database {
  private data: Map<string, any[]> = new Map();
  private prepared: Map<string, MockPreparedStatement> = new Map();

  prepare(query: string): MockPreparedStatement {
    if (!this.prepared.has(query)) {
      this.prepared.set(query, new MockPreparedStatement(query, this.data));
    }
    return this.prepared.get(query)!;
  }

  clear() {
    this.data.clear();
    this.prepared.clear();
  }
}

class MockPreparedStatement {
  private bindings: any[] = [];

  constructor(private query: string, private data: Map<string, any[]>) {}

  bind(...values: any[]): this {
    this.bindings = values;
    return this;
  }

  async first(): Promise<any> {
    const tableName = this.extractTableName(this.query);
    const records = this.data.get(tableName) || [];
    
    if (this.query.includes('WHERE id = ?')) {
      return records.find(r => r.id === this.bindings[0]) || null;
    }
    
    if (this.query.includes('WHERE player_id = ?')) {
      const filtered = records.filter(r => r.player_id === this.bindings[0]);
      if (this.bindings[1] && this.query.includes('AND period = ?')) {
        return filtered.find(r => r.period === this.bindings[1]) || null;
      }
      return filtered[0] || null;
    }
    
    return records[0] || null;
  }

  async all(): Promise<{ results: any[] }> {
    const tableName = this.extractTableName(this.query);
    const records = this.data.get(tableName) || [];
    
    let filtered = records;
    
    if (this.query.includes('WHERE player_id = ?')) {
      filtered = filtered.filter(r => r.player_id === this.bindings[0]);
    }
    
    if (this.query.includes('ORDER BY')) {
      // Simple ordering implementation
      filtered = [...filtered].reverse();
    }
    
    if (this.query.includes('LIMIT')) {
      const limit = this.bindings[this.bindings.length - 1];
      filtered = filtered.slice(0, limit);
    }
    
    return { results: filtered };
  }

  async run(): Promise<void> {
    const tableName = this.extractTableName(this.query);
    
    if (this.query.startsWith('INSERT')) {
      const record = this.createRecordFromInsert();
      const records = this.data.get(tableName) || [];
      records.push(record);
      this.data.set(tableName, records);
    } else if (this.query.startsWith('UPDATE')) {
      const records = this.data.get(tableName) || [];
      const index = records.findIndex(r => r.id === this.bindings[this.bindings.length - 1]);
      if (index !== -1) {
        records[index] = { ...records[index], ...this.createRecordFromUpdate() };
      }
    } else if (this.query.startsWith('DELETE')) {
      const records = this.data.get(tableName) || [];
      const filtered = records.filter(r => r.id !== this.bindings[0]);
      this.data.set(tableName, filtered);
    }
  }

  private extractTableName(query: string): string {
    const match = query.match(/(?:FROM|INTO|UPDATE)\s+(\w+)/i);
    return match ? match[1] : 'unknown';
  }

  private createRecordFromInsert(): any {
    // Simplified record creation based on bindings
    if (this.query.includes('player_statistics')) {
      return {
        id: this.bindings[0],
        player_id: this.bindings[1],
        period: this.bindings[2],
        game_type: this.bindings[3],
        period_start: this.bindings[4],
        period_end: this.bindings[5],
        hands_played: this.bindings[6],
        hands_won: this.bindings[7],
        showdowns_won: this.bindings[8],
        showdowns_seen: this.bindings[9],
        total_bet_amount: this.bindings[10],
        total_winnings: this.bindings[11],
        total_rake_contributed: this.bindings[12],
        biggest_pot_won: this.bindings[13],
        vpip: this.bindings[14],
        pfr: this.bindings[15],
        three_bet: this.bindings[16],
        fold_to_three_bet: this.bindings[17],
        aggression_factor: this.bindings[18],
        aggression_frequency: this.bindings[19],
        c_bet: this.bindings[20],
        fold_to_c_bet: this.bindings[21],
        wtsd: this.bindings[22],
        wsd: this.bindings[23],
        sessions_played: this.bindings[24],
        total_session_duration: this.bindings[25],
        profitable_sessions: this.bindings[26],
        tournaments_played: this.bindings[27],
        tournaments_won: this.bindings[28],
        tournaments_cashed: this.bindings[29],
        average_finish_position: this.bindings[30],
        total_buy_ins: this.bindings[31],
        total_cashes: this.bindings[32],
        roi: this.bindings[33],
        created_at: this.bindings[34],
        updated_at: this.bindings[35],
        last_calculated_at: this.bindings[36],
      };
    } else if (this.query.includes('session_statistics')) {
      return {
        id: this.bindings[0],
        player_id: this.bindings[1],
        table_id: this.bindings[2],
        game_type: this.bindings[3],
        start_time: this.bindings[4],
        end_time: this.bindings[5],
        duration: this.bindings[6],
        buy_in_amount: this.bindings[7],
        cash_out_amount: this.bindings[8],
        net_result: this.bindings[9],
        hands_played: this.bindings[10],
        hands_won: this.bindings[11],
        biggest_pot_won: this.bindings[12],
        peak_chip_count: this.bindings[13],
        lowest_chip_count: this.bindings[14],
        created_at: this.bindings[15],
        updated_at: this.bindings[16],
      };
    } else if (this.query.includes('hand_statistics')) {
      return {
        id: this.bindings[0],
        hand_id: this.bindings[1],
        player_id: this.bindings[2],
        table_id: this.bindings[3],
        hand_number: this.bindings[4],
        timestamp: this.bindings[5],
        position: this.bindings[6],
        pre_flop_action: this.bindings[7],
        flop_action: this.bindings[8],
        turn_action: this.bindings[9],
        river_action: this.bindings[10],
        invested: this.bindings[11],
        won: this.bindings[12],
        net_result: this.bindings[13],
        went_to_showdown: this.bindings[14],
        won_at_showdown: this.bindings[15],
        hole_cards_hash: this.bindings[16],
        created_at: this.bindings[17],
      };
    }
    return {};
  }

  private createRecordFromUpdate(): any {
    // Simplified update parsing
    return {
      updated_at: this.bindings[this.bindings.length - 2],
    };
  }
}

describe('Statistics Repositories', () => {
  let db: MockD1Database;
  let playerStatsRepo: D1PlayerStatisticsRepository;
  let sessionStatsRepo: D1SessionStatisticsRepository;
  let handStatsRepo: D1HandStatisticsRepository;

  beforeEach(() => {
    db = new MockD1Database();
    playerStatsRepo = new D1PlayerStatisticsRepository(db as any);
    sessionStatsRepo = new D1SessionStatisticsRepository(db as any);
    handStatsRepo = new D1HandStatisticsRepository(db as any);
  });

  afterEach(() => {
    db.clear();
  });

  describe('D1PlayerStatisticsRepository', () => {
    const createTestStats = (overrides: Partial<PlayerStatistics> = {}): Omit<PlayerStatistics, 'id' | 'createdAt' | 'updatedAt'> => ({
      playerId: '123e4567-e89b-12d3-a456-426614174000',
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
      lastCalculatedAt: new Date(),
      ...overrides,
    });

    it('should create player statistics', async () => {
      const stats = createTestStats();
      
      const created = await playerStatsRepo.create(stats);
      
      expect(created.id).toBeDefined();
      expect(created.playerId).toBe(stats.playerId);
      expect(created.handsPlayed).toBe(stats.handsPlayed);
      expect(created.vpip).toBe(stats.vpip);
    });

    it('should find player statistics by id', async () => {
      const stats = createTestStats();
      const created = await playerStatsRepo.create(stats);
      
      const found = await playerStatsRepo.findById(created.id);
      
      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.playerId).toBe(stats.playerId);
    });

    it('should find player statistics by player id', async () => {
      const playerId = '123e4567-e89b-12d3-a456-426614174000';
      const stats1 = createTestStats({ period: StatsPeriod.DAILY });
      const stats2 = createTestStats({ period: StatsPeriod.WEEKLY });
      
      await playerStatsRepo.create(stats1);
      await playerStatsRepo.create(stats2);
      
      const found = await playerStatsRepo.findByPlayer(playerId);
      
      expect(found).toHaveLength(2);
      expect(found.map(s => s.period)).toContain(StatsPeriod.DAILY);
      expect(found.map(s => s.period)).toContain(StatsPeriod.WEEKLY);
    });

    it('should update player statistics', async () => {
      const stats = createTestStats();
      const created = await playerStatsRepo.create(stats);
      
      const updated = await playerStatsRepo.update(created.id, {
        handsPlayed: 1500,
        handsWon: 400,
      });
      
      expect(updated.handsPlayed).toBe(1500);
      expect(updated.handsWon).toBe(400);
      expect(updated.vpip).toBe(stats.vpip); // Unchanged
    });

    it('should delete player statistics', async () => {
      const stats = createTestStats();
      const created = await playerStatsRepo.create(stats);
      
      await playerStatsRepo.delete(created.id);
      
      const found = await playerStatsRepo.findById(created.id);
      expect(found).toBeNull();
    });

    it('should upsert player statistics', async () => {
      const playerId = '123e4567-e89b-12d3-a456-426614174000';
      const period = StatsPeriod.MONTHLY;
      const gameType = StatsGameType.CASH;
      const periodStart = new Date('2024-01-01');
      
      // First upsert (create)
      const created = await playerStatsRepo.upsert(playerId, period, gameType, periodStart, {
        handsPlayed: 100,
        handsWon: 25,
      });
      
      expect(created.handsPlayed).toBe(100);
      
      // Second upsert (update)
      const updated = await playerStatsRepo.upsert(playerId, period, gameType, periodStart, {
        handsPlayed: 200,
        handsWon: 50,
      });
      
      expect(updated.handsPlayed).toBe(200);
    });
  });

  describe('D1SessionStatisticsRepository', () => {
    const createTestSession = (overrides: Partial<SessionStatistics> = {}): Omit<SessionStatistics, 'id' | 'createdAt' | 'updatedAt'> => ({
      playerId: '123e4567-e89b-12d3-a456-426614174000',
      tableId: '456e7890-e89b-12d3-a456-426614174111',
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
      ...overrides,
    });

    it('should create session statistics', async () => {
      const session = createTestSession();
      
      const created = await sessionStatsRepo.create(session);
      
      expect(created.id).toBeDefined();
      expect(created.playerId).toBe(session.playerId);
      expect(created.netResult).toBe(session.netResult);
    });

    it('should find active session', async () => {
      const playerId = '123e4567-e89b-12d3-a456-426614174000';
      const tableId = '456e7890-e89b-12d3-a456-426614174111';
      
      const activeSession = createTestSession({ endTime: undefined });
      await sessionStatsRepo.create(activeSession);
      
      const found = await sessionStatsRepo.findActiveSession(playerId, tableId);
      
      expect(found).toBeDefined();
      expect(found?.endTime).toBeUndefined();
    });

    it('should end session', async () => {
      const session = createTestSession({ endTime: undefined, cashOutAmount: 0 });
      const created = await sessionStatsRepo.create(session);
      
      const ended = await sessionStatsRepo.endSession(created.id, 1800);
      
      expect(ended.endTime).toBeDefined();
      expect(ended.cashOutAmount).toBe(1800);
      expect(ended.netResult).toBe(800); // 1800 - 1000
    });

    it('should find sessions by player', async () => {
      const playerId = '123e4567-e89b-12d3-a456-426614174000';
      
      await sessionStatsRepo.create(createTestSession());
      await sessionStatsRepo.create(createTestSession({ startTime: new Date('2024-01-02T10:00:00Z') }));
      
      const found = await sessionStatsRepo.findByPlayer(playerId);
      
      expect(found).toHaveLength(2);
    });
  });

  describe('D1HandStatisticsRepository', () => {
    const createTestHand = (overrides: Partial<HandStatistics> = {}): Omit<HandStatistics, 'id' | 'createdAt'> => ({
      handId: '123e4567-e89b-12d3-a456-426614174000',
      playerId: '456e7890-e89b-12d3-a456-426614174111',
      tableId: '789e0123-e89b-12d3-a456-426614174222',
      handNumber: 42,
      timestamp: new Date(),
      position: 'BTN',
      preFlopAction: 'RAISE',
      flopAction: 'BET',
      invested: 100,
      won: 250,
      netResult: 150,
      wentToShowdown: true,
      wonAtShowdown: true,
      ...overrides,
    });

    it('should create hand statistics', async () => {
      const hand = createTestHand();
      
      const created = await handStatsRepo.create(hand);
      
      expect(created.id).toBeDefined();
      expect(created.handId).toBe(hand.handId);
      expect(created.netResult).toBe(hand.netResult);
    });

    it('should find hands by hand id', async () => {
      const handId = '123e4567-e89b-12d3-a456-426614174000';
      
      await handStatsRepo.create(createTestHand({ playerId: 'player1' }));
      await handStatsRepo.create(createTestHand({ playerId: 'player2' }));
      
      const found = await handStatsRepo.findByHand(handId);
      
      expect(found).toHaveLength(2);
    });

    it('should create batch hand statistics', async () => {
      const hands = [
        createTestHand({ handNumber: 1 }),
        createTestHand({ handNumber: 2 }),
        createTestHand({ handNumber: 3 }),
      ];
      
      const created = await handStatsRepo.createBatch(hands);
      
      expect(created).toHaveLength(3);
      expect(created.map(h => h.handNumber)).toEqual([1, 2, 3]);
    });
  });
});