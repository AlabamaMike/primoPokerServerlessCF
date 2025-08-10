import { 
  PlayerStatistics, 
  SessionStatistics, 
  HandStatistics,
  PlayerStatsView,
  StatsQuery,
  StatsPeriod,
  StatsGameType,
  RandomUtils 
} from '@primo-poker/shared';

// Repository interfaces
export interface IPlayerStatisticsRepository {
  findById(id: string): Promise<PlayerStatistics | null>;
  findByPlayer(playerId: string, period?: StatsPeriod, gameType?: StatsGameType): Promise<PlayerStatistics[]>;
  create(stats: Omit<PlayerStatistics, 'id' | 'createdAt' | 'updatedAt'>): Promise<PlayerStatistics>;
  update(id: string, updates: Partial<PlayerStatistics>): Promise<PlayerStatistics>;
  upsert(playerId: string, period: StatsPeriod, gameType: StatsGameType, periodStart: Date, updates: Partial<PlayerStatistics>): Promise<PlayerStatistics>;
  delete(id: string): Promise<void>;
  getLeaderboard(query: StatsQuery): Promise<PlayerStatsView[]>;
}

export interface ISessionStatisticsRepository {
  findById(id: string): Promise<SessionStatistics | null>;
  findByPlayer(playerId: string, limit?: number): Promise<SessionStatistics[]>;
  findActiveSession(playerId: string, tableId: string): Promise<SessionStatistics | null>;
  create(session: Omit<SessionStatistics, 'id' | 'createdAt' | 'updatedAt'>): Promise<SessionStatistics>;
  update(id: string, updates: Partial<SessionStatistics>): Promise<SessionStatistics>;
  endSession(id: string, cashOutAmount: number): Promise<SessionStatistics>;
  delete(id: string): Promise<void>;
}

export interface IHandStatisticsRepository {
  findById(id: string): Promise<HandStatistics | null>;
  findByHand(handId: string): Promise<HandStatistics[]>;
  findByPlayer(playerId: string, limit?: number): Promise<HandStatistics[]>;
  create(hand: Omit<HandStatistics, 'id' | 'createdAt'>): Promise<HandStatistics>;
  createBatch(hands: Omit<HandStatistics, 'id' | 'createdAt'>[]): Promise<HandStatistics[]>;
  delete(id: string): Promise<void>;
}

// Cloudflare D1 implementations
export class D1PlayerStatisticsRepository implements IPlayerStatisticsRepository {
  constructor(private db: D1Database) {}

  async findById(id: string): Promise<PlayerStatistics | null> {
    const stmt = this.db.prepare('SELECT * FROM player_statistics WHERE id = ?');
    const result = await stmt.bind(id).first();
    
    if (!result) return null;
    
    return this.mapRowToPlayerStatistics(result);
  }

  async findByPlayer(playerId: string, period?: StatsPeriod, gameType?: StatsGameType): Promise<PlayerStatistics[]> {
    let query = 'SELECT * FROM player_statistics WHERE player_id = ?';
    const bindings: any[] = [playerId];
    
    if (period) {
      query += ' AND period = ?';
      bindings.push(period);
    }
    
    if (gameType) {
      query += ' AND game_type = ?';
      bindings.push(gameType);
    }
    
    query += ' ORDER BY period_start DESC';
    
    const stmt = this.db.prepare(query);
    const results = await stmt.bind(...bindings).all();
    
    return results.results.map(row => this.mapRowToPlayerStatistics(row));
  }

  async create(stats: Omit<PlayerStatistics, 'id' | 'createdAt' | 'updatedAt'>): Promise<PlayerStatistics> {
    const id = RandomUtils.generateUUID();
    const now = new Date();
    
    const stmt = this.db.prepare(`
      INSERT INTO player_statistics (
        id, player_id, period, game_type, period_start, period_end,
        hands_played, hands_won, showdowns_won, showdowns_seen,
        total_bet_amount, total_winnings, total_rake_contributed, biggest_pot_won,
        vpip, pfr, three_bet, fold_to_three_bet,
        aggression_factor, aggression_frequency,
        c_bet, fold_to_c_bet, wtsd, wsd,
        sessions_played, total_session_duration, profitable_sessions,
        tournaments_played, tournaments_won, tournaments_cashed,
        average_finish_position, total_buy_ins, total_cashes, roi,
        created_at, updated_at, last_calculated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?
      )
    `);
    
    await stmt.bind(
      id, stats.playerId, stats.period, stats.gameType, stats.periodStart.toISOString(), stats.periodEnd?.toISOString() || null,
      stats.handsPlayed, stats.handsWon, stats.showdownsWon, stats.showdownsSeen,
      stats.totalBetAmount, stats.totalWinnings, stats.totalRakeContributed, stats.biggestPotWon,
      stats.vpip, stats.pfr, stats.threeBet, stats.foldToThreeBet,
      stats.aggressionFactor, stats.aggressionFrequency,
      stats.cBet, stats.foldToCBet, stats.wtsd, stats.wsd,
      stats.sessionsPlayed, stats.totalSessionDuration, stats.profitableSessions,
      stats.tournamentsPlayed || null, stats.tournamentsWon || null, stats.tournamentsCashed || null,
      stats.averageFinishPosition || null, stats.totalBuyIns || null, stats.totalCashes || null, stats.roi || null,
      now.toISOString(), now.toISOString(), stats.lastCalculatedAt.toISOString()
    ).run();
    
    return { ...stats, id, createdAt: now, updatedAt: now };
  }

  async update(id: string, updates: Partial<PlayerStatistics>): Promise<PlayerStatistics> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error('PlayerStatistics not found');
    }
    
    const updated = { ...existing, ...updates };
    const now = new Date();
    
    const stmt = this.db.prepare(`
      UPDATE player_statistics 
      SET hands_played = ?, hands_won = ?, showdowns_won = ?, showdowns_seen = ?,
          total_bet_amount = ?, total_winnings = ?, total_rake_contributed = ?, biggest_pot_won = ?,
          vpip = ?, pfr = ?, three_bet = ?, fold_to_three_bet = ?,
          aggression_factor = ?, aggression_frequency = ?,
          c_bet = ?, fold_to_c_bet = ?, wtsd = ?, wsd = ?,
          sessions_played = ?, total_session_duration = ?, profitable_sessions = ?,
          tournaments_played = ?, tournaments_won = ?, tournaments_cashed = ?,
          average_finish_position = ?, total_buy_ins = ?, total_cashes = ?, roi = ?,
          updated_at = ?, last_calculated_at = ?
      WHERE id = ?
    `);
    
    await stmt.bind(
      updated.handsPlayed, updated.handsWon, updated.showdownsWon, updated.showdownsSeen,
      updated.totalBetAmount, updated.totalWinnings, updated.totalRakeContributed, updated.biggestPotWon,
      updated.vpip, updated.pfr, updated.threeBet, updated.foldToThreeBet,
      updated.aggressionFactor, updated.aggressionFrequency,
      updated.cBet, updated.foldToCBet, updated.wtsd, updated.wsd,
      updated.sessionsPlayed, updated.totalSessionDuration, updated.profitableSessions,
      updated.tournamentsPlayed || null, updated.tournamentsWon || null, updated.tournamentsCashed || null,
      updated.averageFinishPosition || null, updated.totalBuyIns || null, updated.totalCashes || null, updated.roi || null,
      now.toISOString(), updated.lastCalculatedAt.toISOString(),
      id
    ).run();
    
    return { ...updated, updatedAt: now };
  }

  async upsert(playerId: string, period: StatsPeriod, gameType: StatsGameType, periodStart: Date, updates: Partial<PlayerStatistics>): Promise<PlayerStatistics> {
    // Check if record exists
    const stmt = this.db.prepare(`
      SELECT id FROM player_statistics 
      WHERE player_id = ? AND period = ? AND game_type = ? AND period_start = ?
    `);
    
    const existing = await stmt.bind(playerId, period, gameType, periodStart.toISOString()).first();
    
    if (existing) {
      return this.update(existing.id as string, updates);
    } else {
      const stats: Omit<PlayerStatistics, 'id' | 'createdAt' | 'updatedAt'> = {
        playerId,
        period,
        gameType,
        periodStart,
        periodEnd: updates.periodEnd,
        handsPlayed: 0,
        handsWon: 0,
        showdownsWon: 0,
        showdownsSeen: 0,
        totalBetAmount: 0,
        totalWinnings: 0,
        totalRakeContributed: 0,
        biggestPotWon: 0,
        vpip: 0,
        pfr: 0,
        threeBet: 0,
        foldToThreeBet: 0,
        aggressionFactor: 0,
        aggressionFrequency: 0,
        cBet: 0,
        foldToCBet: 0,
        wtsd: 0,
        wsd: 0,
        sessionsPlayed: 0,
        totalSessionDuration: 0,
        profitableSessions: 0,
        lastCalculatedAt: new Date(),
        ...updates
      };
      
      return this.create(stats);
    }
  }

  async delete(id: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM player_statistics WHERE id = ?');
    await stmt.bind(id).run();
  }

  async getLeaderboard(query: StatsQuery): Promise<PlayerStatsView[]> {
    const { period = StatsPeriod.ALL_TIME, gameType = StatsGameType.ALL, limit = 20, offset = 0, sortBy = 'winnings' } = query;
    
    let orderByClause = '';
    switch (sortBy) {
      case 'winnings':
        orderByClause = 'net_profit DESC';
        break;
      case 'handsPlayed':
        orderByClause = 'hands_played DESC';
        break;
      case 'winRate':
        orderByClause = 'bb_per_100 DESC';
        break;
      case 'roi':
        orderByClause = 'roi DESC';
        break;
    }
    
    const stmt = this.db.prepare(`
      SELECT * FROM profit_leaderboard
      ORDER BY ${orderByClause}
      LIMIT ? OFFSET ?
    `);
    
    const results = await stmt.bind(limit, offset).all();
    
    return results.results.map(row => this.mapRowToPlayerStatsView(row));
  }

  private mapRowToPlayerStatistics(row: any): PlayerStatistics {
    return {
      id: row.id,
      playerId: row.player_id,
      period: row.period as StatsPeriod,
      gameType: row.game_type as StatsGameType,
      periodStart: new Date(row.period_start),
      periodEnd: row.period_end ? new Date(row.period_end) : undefined,
      handsPlayed: row.hands_played,
      handsWon: row.hands_won,
      showdownsWon: row.showdowns_won,
      showdownsSeen: row.showdowns_seen,
      totalBetAmount: row.total_bet_amount,
      totalWinnings: row.total_winnings,
      totalRakeContributed: row.total_rake_contributed,
      biggestPotWon: row.biggest_pot_won,
      vpip: row.vpip,
      pfr: row.pfr,
      threeBet: row.three_bet,
      foldToThreeBet: row.fold_to_three_bet,
      aggressionFactor: row.aggression_factor,
      aggressionFrequency: row.aggression_frequency,
      cBet: row.c_bet,
      foldToCBet: row.fold_to_c_bet,
      wtsd: row.wtsd,
      wsd: row.wsd,
      sessionsPlayed: row.sessions_played,
      totalSessionDuration: row.total_session_duration,
      profitableSessions: row.profitable_sessions,
      tournamentsPlayed: row.tournaments_played,
      tournamentsWon: row.tournaments_won,
      tournamentsCashed: row.tournaments_cashed,
      averageFinishPosition: row.average_finish_position,
      totalBuyIns: row.total_buy_ins,
      totalCashes: row.total_cashes,
      roi: row.roi,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastCalculatedAt: new Date(row.last_calculated_at),
    };
  }

  private mapRowToPlayerStatsView(row: any): PlayerStatsView {
    return {
      playerId: row.player_id,
      username: row.username,
      lifetimeHandsPlayed: row.hands_played,
      lifetimeWinnings: row.value,
      lifetimeWinRate: row.bb_per_100,
      recentHandsPlayed: 0, // Would need a separate query
      recentWinnings: 0, // Would need a separate query
      recentWinRate: 0, // Would need a separate query
      overallRank: row.rank,
      profitRank: row.rank,
      volumeRank: undefined,
      achievementsCount: 0,
      lastActiveAt: new Date(),
    };
  }
}

export class D1SessionStatisticsRepository implements ISessionStatisticsRepository {
  constructor(private db: D1Database) {}

  async findById(id: string): Promise<SessionStatistics | null> {
    const stmt = this.db.prepare('SELECT * FROM session_statistics WHERE id = ?');
    const result = await stmt.bind(id).first();
    
    if (!result) return null;
    
    return this.mapRowToSessionStatistics(result);
  }

  async findByPlayer(playerId: string, limit: number = 50): Promise<SessionStatistics[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM session_statistics WHERE player_id = ? ORDER BY start_time DESC LIMIT ?'
    );
    const results = await stmt.bind(playerId, limit).all();
    
    return results.results.map(row => this.mapRowToSessionStatistics(row));
  }

  async findActiveSession(playerId: string, tableId: string): Promise<SessionStatistics | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM session_statistics WHERE player_id = ? AND table_id = ? AND end_time IS NULL'
    );
    const result = await stmt.bind(playerId, tableId).first();
    
    if (!result) return null;
    
    return this.mapRowToSessionStatistics(result);
  }

  async create(session: Omit<SessionStatistics, 'id' | 'createdAt' | 'updatedAt'>): Promise<SessionStatistics> {
    const id = RandomUtils.generateUUID();
    const now = new Date();
    
    const stmt = this.db.prepare(`
      INSERT INTO session_statistics (
        id, player_id, table_id, game_type,
        start_time, end_time, duration,
        buy_in_amount, cash_out_amount, net_result,
        hands_played, hands_won, biggest_pot_won,
        peak_chip_count, lowest_chip_count,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    await stmt.bind(
      id, session.playerId, session.tableId, session.gameType,
      session.startTime.toISOString(), session.endTime?.toISOString() || null, session.duration,
      session.buyInAmount, session.cashOutAmount, session.netResult,
      session.handsPlayed, session.handsWon, session.biggestPotWon,
      session.peakChipCount, session.lowestChipCount,
      now.toISOString(), now.toISOString()
    ).run();
    
    return { ...session, id, createdAt: now, updatedAt: now };
  }

  async update(id: string, updates: Partial<SessionStatistics>): Promise<SessionStatistics> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error('SessionStatistics not found');
    }
    
    const updated = { ...existing, ...updates };
    const now = new Date();
    
    // Calculate duration if end time is set
    if (updated.endTime && updated.startTime) {
      updated.duration = Math.floor((updated.endTime.getTime() - updated.startTime.getTime()) / 1000);
    }
    
    const stmt = this.db.prepare(`
      UPDATE session_statistics 
      SET end_time = ?, duration = ?,
          cash_out_amount = ?, net_result = ?,
          hands_played = ?, hands_won = ?, biggest_pot_won = ?,
          peak_chip_count = ?, lowest_chip_count = ?,
          updated_at = ?
      WHERE id = ?
    `);
    
    await stmt.bind(
      updated.endTime?.toISOString() || null, updated.duration,
      updated.cashOutAmount, updated.netResult,
      updated.handsPlayed, updated.handsWon, updated.biggestPotWon,
      updated.peakChipCount, updated.lowestChipCount,
      now.toISOString(),
      id
    ).run();
    
    return { ...updated, updatedAt: now };
  }

  async endSession(id: string, cashOutAmount: number): Promise<SessionStatistics> {
    const session = await this.findById(id);
    if (!session) {
      throw new Error('SessionStatistics not found');
    }
    
    const endTime = new Date();
    const netResult = cashOutAmount - session.buyInAmount;
    
    return this.update(id, {
      endTime,
      cashOutAmount,
      netResult,
    });
  }

  async delete(id: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM session_statistics WHERE id = ?');
    await stmt.bind(id).run();
  }

  private mapRowToSessionStatistics(row: any): SessionStatistics {
    return {
      id: row.id,
      playerId: row.player_id,
      tableId: row.table_id,
      gameType: row.game_type as StatsGameType,
      startTime: new Date(row.start_time),
      endTime: row.end_time ? new Date(row.end_time) : undefined,
      duration: row.duration,
      buyInAmount: row.buy_in_amount,
      cashOutAmount: row.cash_out_amount,
      netResult: row.net_result,
      handsPlayed: row.hands_played,
      handsWon: row.hands_won,
      biggestPotWon: row.biggest_pot_won,
      peakChipCount: row.peak_chip_count,
      lowestChipCount: row.lowest_chip_count,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

export class D1HandStatisticsRepository implements IHandStatisticsRepository {
  constructor(private db: D1Database) {}

  async findById(id: string): Promise<HandStatistics | null> {
    const stmt = this.db.prepare('SELECT * FROM hand_statistics WHERE id = ?');
    const result = await stmt.bind(id).first();
    
    if (!result) return null;
    
    return this.mapRowToHandStatistics(result);
  }

  async findByHand(handId: string): Promise<HandStatistics[]> {
    const stmt = this.db.prepare('SELECT * FROM hand_statistics WHERE hand_id = ?');
    const results = await stmt.bind(handId).all();
    
    return results.results.map(row => this.mapRowToHandStatistics(row));
  }

  async findByPlayer(playerId: string, limit: number = 100): Promise<HandStatistics[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM hand_statistics WHERE player_id = ? ORDER BY timestamp DESC LIMIT ?'
    );
    const results = await stmt.bind(playerId, limit).all();
    
    return results.results.map(row => this.mapRowToHandStatistics(row));
  }

  async create(hand: Omit<HandStatistics, 'id' | 'createdAt'>): Promise<HandStatistics> {
    const id = RandomUtils.generateUUID();
    const now = new Date();
    
    const stmt = this.db.prepare(`
      INSERT INTO hand_statistics (
        id, hand_id, player_id, table_id,
        hand_number, timestamp, position,
        pre_flop_action, flop_action, turn_action, river_action,
        invested, won, net_result,
        went_to_showdown, won_at_showdown, hole_cards_hash,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    await stmt.bind(
      id, hand.handId, hand.playerId, hand.tableId,
      hand.handNumber, hand.timestamp.toISOString(), hand.position,
      hand.preFlopAction || null, hand.flopAction || null, hand.turnAction || null, hand.riverAction || null,
      hand.invested, hand.won, hand.netResult,
      hand.wentToShowdown ? 1 : 0, hand.wonAtShowdown !== undefined ? (hand.wonAtShowdown ? 1 : 0) : null, hand.holeCardsHash || null,
      now.toISOString()
    ).run();
    
    return { ...hand, id, createdAt: now };
  }

  async createBatch(hands: Omit<HandStatistics, 'id' | 'createdAt'>[]): Promise<HandStatistics[]> {
    const now = new Date();
    const results: HandStatistics[] = [];
    
    // Use a transaction for batch insert
    const stmt = this.db.prepare(`
      INSERT INTO hand_statistics (
        id, hand_id, player_id, table_id,
        hand_number, timestamp, position,
        pre_flop_action, flop_action, turn_action, river_action,
        invested, won, net_result,
        went_to_showdown, won_at_showdown, hole_cards_hash,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (const hand of hands) {
      const id = RandomUtils.generateUUID();
      
      await stmt.bind(
        id, hand.handId, hand.playerId, hand.tableId,
        hand.handNumber, hand.timestamp.toISOString(), hand.position,
        hand.preFlopAction || null, hand.flopAction || null, hand.turnAction || null, hand.riverAction || null,
        hand.invested, hand.won, hand.netResult,
        hand.wentToShowdown ? 1 : 0, hand.wonAtShowdown !== undefined ? (hand.wonAtShowdown ? 1 : 0) : null, hand.holeCardsHash || null,
        now.toISOString()
      ).run();
      
      results.push({ ...hand, id, createdAt: now });
    }
    
    return results;
  }

  async delete(id: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM hand_statistics WHERE id = ?');
    await stmt.bind(id).run();
  }

  private mapRowToHandStatistics(row: any): HandStatistics {
    return {
      id: row.id,
      handId: row.hand_id,
      playerId: row.player_id,
      tableId: row.table_id,
      handNumber: row.hand_number,
      timestamp: new Date(row.timestamp),
      position: row.position,
      preFlopAction: row.pre_flop_action,
      flopAction: row.flop_action,
      turnAction: row.turn_action,
      riverAction: row.river_action,
      invested: row.invested,
      won: row.won,
      netResult: row.net_result,
      wentToShowdown: row.went_to_showdown === 1,
      wonAtShowdown: row.won_at_showdown !== null ? row.won_at_showdown === 1 : undefined,
      holeCardsHash: row.hole_cards_hash,
      createdAt: new Date(row.created_at),
    };
  }
}