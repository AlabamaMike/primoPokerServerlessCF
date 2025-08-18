import {
  PlayerStatistics,
  SessionStatistics,
  HandStatistics,
  StatsPeriod,
  StatsGameType,
  RandomUtils
} from '@primo-poker/shared';
import { 
  D1PlayerStatisticsRepository,
  D1SessionStatisticsRepository,
  D1HandStatisticsRepository
} from '@primo-poker/persistence';
import { logger } from '@primo-poker/core';

/**
 * Handles scheduled statistics aggregation jobs.
 * Processes player statistics in batches to avoid timeouts.
 */
export class StatisticsAggregator {
  private playerStatsRepo: D1PlayerStatisticsRepository;
  private sessionStatsRepo: D1SessionStatisticsRepository;
  private handStatsRepo: D1HandStatisticsRepository;
  private batchSize: number = 100;
  private maxRetries: number = 3;

  constructor(private db: D1Database, private kv?: KVNamespace) {
    this.playerStatsRepo = new D1PlayerStatisticsRepository(db);
    this.sessionStatsRepo = new D1SessionStatisticsRepository(db);
    this.handStatsRepo = new D1HandStatisticsRepository(db);
  }

  /**
   * Main entry point for scheduled aggregation jobs.
   * Processes statistics based on the period.
   */
  async runAggregation(period: StatsPeriod): Promise<void> {
    const startTime = Date.now();
    const jobId = RandomUtils.generateUUID();
    
    logger.info('Starting statistics aggregation', { jobId, period });

    try {
      // Store job start in KV for monitoring
      if (this.kv) {
        await this.kv.put(`stats-job:${jobId}`, JSON.stringify({
          status: 'running',
          period,
          startTime: new Date().toISOString(),
          progress: 0
        }), { expirationTtl: 86400 }); // 24 hour TTL
      }

      // Get list of players to process
      const players = await this.getPlayersToProcess(period);
      logger.info('Players to process', { count: players.length, period });

      // Process players in batches
      let processed = 0;
      for (let i = 0; i < players.length; i += this.batchSize) {
        const batch = players.slice(i, i + this.batchSize);
        await this.processBatch(batch, period);
        
        processed += batch.length;
        const progress = Math.round((processed / players.length) * 100);
        
        // Update progress in KV
        if (this.kv) {
          await this.kv.put(`stats-job:${jobId}`, JSON.stringify({
            status: 'running',
            period,
            startTime: new Date(startTime).toISOString(),
            progress,
            processed,
            total: players.length
          }), { expirationTtl: 86400 });
        }
        
        logger.info('Batch processed', { processed, total: players.length, progress });
      }

      // Mark job as completed
      const duration = Date.now() - startTime;
      if (this.kv) {
        await this.kv.put(`stats-job:${jobId}`, JSON.stringify({
          status: 'completed',
          period,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date().toISOString(),
          duration,
          processed: players.length
        }), { expirationTtl: 604800 }); // 7 day TTL for completed jobs
      }

      logger.info('Statistics aggregation completed', { 
        jobId, 
        period, 
        duration, 
        playersProcessed: players.length 
      });

    } catch (error) {
      logger.error('Statistics aggregation failed', error as Error, { jobId, period });
      
      // Mark job as failed
      if (this.kv) {
        await this.kv.put(`stats-job:${jobId}`, JSON.stringify({
          status: 'failed',
          period,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date().toISOString(),
          error: (error as Error).message
        }), { expirationTtl: 604800 });
      }
      
      throw error;
    }
  }

  /**
   * Gets list of players that need statistics processing.
   */
  private async getPlayersToProcess(period: StatsPeriod): Promise<string[]> {
    const cutoffTime = this.getCutoffTime(period);
    
    // Query players who have been active since the cutoff time
    const result = await this.db.prepare(`
      SELECT DISTINCT player_id 
      FROM (
        SELECT player_id FROM session_statistics 
        WHERE start_time >= ? OR (end_time IS NOT NULL AND end_time >= ?)
        UNION
        SELECT player_id FROM hand_statistics 
        WHERE timestamp >= ?
      )
    `).bind(
      cutoffTime.toISOString(),
      cutoffTime.toISOString(),
      cutoffTime.toISOString()
    ).all();

    return result.results.map(row => row.player_id as string);
  }

  /**
   * Processes a batch of players.
   */
  private async processBatch(playerIds: string[], period: StatsPeriod): Promise<void> {
    const promises = playerIds.map(playerId => 
      this.processPlayerWithRetry(playerId, period)
    );
    
    await Promise.allSettled(promises);
  }

  /**
   * Processes a single player with retry logic.
   */
  private async processPlayerWithRetry(playerId: string, period: StatsPeriod, attempt: number = 1): Promise<void> {
    try {
      await this.processPlayer(playerId, period);
    } catch (error) {
      if (attempt < this.maxRetries) {
        logger.warn('Retrying player statistics processing', { 
          playerId, 
          period, 
          attempt, 
          error: (error as Error).message 
        });
        await this.processPlayerWithRetry(playerId, period, attempt + 1);
      } else {
        logger.error('Failed to process player statistics after retries', error as Error, { 
          playerId, 
          period, 
          attempts: attempt 
        });
        throw error;
      }
    }
  }

  /**
   * Processes statistics for a single player.
   */
  private async processPlayer(playerId: string, period: StatsPeriod): Promise<void> {
    const periodStart = this.getPeriodStart(period);
    const periodEnd = period === StatsPeriod.ALL_TIME ? undefined : new Date();

    // Aggregate statistics for all game types
    for (const gameType of Object.values(StatsGameType)) {
      await this.aggregatePlayerStats(playerId, period, gameType, periodStart, periodEnd);
    }
  }

  /**
   * Aggregates statistics for a player, period, and game type.
   */
  private async aggregatePlayerStats(
    playerId: string,
    period: StatsPeriod,
    gameType: StatsGameType,
    periodStart: Date,
    periodEnd?: Date
  ): Promise<void> {
    // Get hands for the period
    const hands = await this.getHandsForPeriod(playerId, gameType, periodStart, periodEnd);
    
    // Get sessions for the period
    const sessions = await this.getSessionsForPeriod(playerId, gameType, periodStart, periodEnd);

    if (hands.length === 0 && sessions.length === 0) {
      return; // No data to aggregate
    }

    // Calculate statistics
    const stats = this.calculateStatistics(hands, sessions);

    // Upsert player statistics
    await this.playerStatsRepo.upsert(playerId, period, gameType, periodStart, {
      periodEnd,
      handsPlayed: stats.handsPlayed,
      handsWon: stats.handsWon,
      showdownsWon: stats.showdownsWon,
      showdownsSeen: stats.showdownsSeen,
      totalBetAmount: stats.totalBetAmount,
      totalWinnings: stats.totalWinnings,
      totalRakeContributed: stats.totalRakeContributed,
      biggestPotWon: stats.biggestPotWon,
      vpip: stats.vpip,
      pfr: stats.pfr,
      threeBet: stats.threeBet,
      foldToThreeBet: stats.foldToThreeBet,
      aggressionFactor: stats.aggressionFactor,
      aggressionFrequency: stats.aggressionFrequency,
      cBet: stats.cBet,
      foldToCBet: stats.foldToCBet,
      wtsd: stats.wtsd,
      wsd: stats.wsd,
      sessionsPlayed: stats.sessionsPlayed,
      totalSessionDuration: stats.totalSessionDuration,
      profitableSessions: stats.profitableSessions,
      tournamentsPlayed: stats.tournamentsPlayed,
      tournamentsWon: stats.tournamentsWon,
      tournamentsCashed: stats.tournamentsCashed,
      averageFinishPosition: stats.averageFinishPosition,
      totalBuyIns: stats.totalBuyIns,
      totalCashes: stats.totalCashes,
      roi: stats.roi,
      lastCalculatedAt: new Date()
    });
  }

  /**
   * Gets hands for a specific period.
   */
  private async getHandsForPeriod(
    playerId: string,
    gameType: StatsGameType,
    periodStart: Date,
    periodEnd?: Date
  ): Promise<HandStatistics[]> {
    let query = `
      SELECT h.* FROM hand_statistics h
      JOIN session_statistics s ON h.player_id = s.player_id AND h.table_id = s.table_id
      WHERE h.player_id = ? AND h.timestamp >= ?
    `;
    const bindings: any[] = [playerId, periodStart.toISOString()];

    if (periodEnd) {
      query += ' AND h.timestamp <= ?';
      bindings.push(periodEnd.toISOString());
    }

    if (gameType !== StatsGameType.ALL) {
      query += ' AND s.game_type = ?';
      bindings.push(gameType);
    }

    const result = await this.db.prepare(query).bind(...bindings).all();
    
    return result.results.map(row => ({
      id: row.id as string,
      handId: row.hand_id as string,
      playerId: row.player_id as string,
      tableId: row.table_id as string,
      handNumber: row.hand_number as number,
      timestamp: new Date(row.timestamp as string),
      position: row.position as string,
      preFlopAction: row.pre_flop_action as string | undefined,
      flopAction: row.flop_action as string | undefined,
      turnAction: row.turn_action as string | undefined,
      riverAction: row.river_action as string | undefined,
      invested: row.invested as number,
      won: row.won as number,
      netResult: row.net_result as number,
      wentToShowdown: row.went_to_showdown === 1,
      wonAtShowdown: row.won_at_showdown !== null ? row.won_at_showdown === 1 : undefined,
      holeCardsHash: row.hole_cards_hash as string | undefined,
      createdAt: new Date(row.created_at as string)
    }));
  }

  /**
   * Gets sessions for a specific period.
   */
  private async getSessionsForPeriod(
    playerId: string,
    gameType: StatsGameType,
    periodStart: Date,
    periodEnd?: Date
  ): Promise<SessionStatistics[]> {
    let query = `
      SELECT * FROM session_statistics 
      WHERE player_id = ? AND start_time >= ?
    `;
    const bindings: any[] = [playerId, periodStart.toISOString()];

    if (periodEnd) {
      query += ' AND start_time <= ?';
      bindings.push(periodEnd.toISOString());
    }

    if (gameType !== StatsGameType.ALL) {
      query += ' AND game_type = ?';
      bindings.push(gameType);
    }

    const result = await this.db.prepare(query).bind(...bindings).all();
    
    return result.results.map(row => ({
      id: row.id as string,
      playerId: row.player_id as string,
      tableId: row.table_id as string,
      gameType: row.game_type as StatsGameType,
      startTime: new Date(row.start_time as string),
      endTime: row.end_time ? new Date(row.end_time as string) : undefined,
      duration: row.duration as number,
      buyInAmount: row.buy_in_amount as number,
      cashOutAmount: row.cash_out_amount as number,
      netResult: row.net_result as number,
      handsPlayed: row.hands_played as number,
      handsWon: row.hands_won as number,
      biggestPotWon: row.biggest_pot_won as number,
      peakChipCount: row.peak_chip_count as number,
      lowestChipCount: row.lowest_chip_count as number,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string)
    }));
  }

  /**
   * Calculates aggregated statistics from hands and sessions.
   */
  private calculateStatistics(hands: HandStatistics[], sessions: SessionStatistics[]): Partial<PlayerStatistics> {
    const stats: Partial<PlayerStatistics> = {
      handsPlayed: hands.length,
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
      sessionsPlayed: sessions.length,
      totalSessionDuration: 0,
      profitableSessions: 0
    };

    // Hand statistics
    let vpipHands = 0;
    let pfrHands = 0;
    let betsAndRaises = 0;
    let calls = 0;
    let checksAndFolds = 0;

    hands.forEach(hand => {
      if (hand.won > 0) stats.handsWon!++;
      if (hand.wentToShowdown) stats.showdownsSeen!++;
      if (hand.wonAtShowdown) stats.showdownsWon!++;
      
      stats.totalBetAmount! += hand.invested;
      stats.totalWinnings! += hand.won;
      stats.biggestPotWon = Math.max(stats.biggestPotWon!, hand.won);

      // Pre-flop statistics
      if (hand.preFlopAction) {
        if (['CALL', 'RAISE', 'BET'].includes(hand.preFlopAction)) {
          vpipHands++;
        }
        if (['RAISE', 'BET'].includes(hand.preFlopAction)) {
          pfrHands++;
        }
      }

      // Aggression statistics
      ['preFlopAction', 'flopAction', 'turnAction', 'riverAction'].forEach(street => {
        const action = hand[street as keyof HandStatistics] as string | undefined;
        if (action) {
          if (['BET', 'RAISE'].includes(action)) betsAndRaises++;
          else if (action === 'CALL') calls++;
          else if (['CHECK', 'FOLD'].includes(action)) checksAndFolds++;
        }
      });
    });

    // Calculate percentages
    if (hands.length > 0) {
      stats.vpip = (vpipHands / hands.length) * 100;
      stats.pfr = (pfrHands / hands.length) * 100;
      stats.wtsd = (stats.showdownsSeen! / hands.length) * 100;
      
      if (stats.showdownsSeen! > 0) {
        stats.wsd = (stats.showdownsWon! / stats.showdownsSeen!) * 100;
      }
      
      // Aggression factor: (Bet + Raise) / Call
      if (calls > 0) {
        stats.aggressionFactor = betsAndRaises / calls;
      } else {
        stats.aggressionFactor = betsAndRaises;
      }
      
      // Aggression frequency: % of non-passive actions that are aggressive
      const totalNonPassive = betsAndRaises + calls;
      if (totalNonPassive > 0) {
        stats.aggressionFrequency = (betsAndRaises / totalNonPassive) * 100;
      }
    }

    // Session statistics
    sessions.forEach(session => {
      stats.totalSessionDuration! += session.duration;
      if (session.netResult > 0) {
        stats.profitableSessions!++;
      }
    });

    // Tournament statistics (if applicable)
    const tournamentSessions = sessions.filter(s => 
      s.gameType === StatsGameType.TOURNAMENT || s.gameType === StatsGameType.SIT_N_GO
    );
    
    if (tournamentSessions.length > 0) {
      stats.tournamentsPlayed = tournamentSessions.length;
      stats.totalBuyIns = tournamentSessions.reduce((sum, s) => sum + s.buyInAmount, 0);
      stats.totalCashes = tournamentSessions.reduce((sum, s) => sum + s.cashOutAmount, 0);
      
      // ROI calculation
      if (stats.totalBuyIns! > 0) {
        stats.roi = ((stats.totalCashes! - stats.totalBuyIns!) / stats.totalBuyIns!) * 100;
      }
    }

    return stats;
  }

  /**
   * Gets the cutoff time for a given period.
   */
  private getCutoffTime(period: StatsPeriod): Date {
    const now = new Date();
    
    switch (period) {
      case StatsPeriod.DAILY:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case StatsPeriod.WEEKLY:
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case StatsPeriod.MONTHLY:
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case StatsPeriod.YEARLY:
        return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      case StatsPeriod.ALL_TIME:
      default:
        return new Date(0); // Beginning of time
    }
  }

  /**
   * Gets the period start date.
   */
  private getPeriodStart(period: StatsPeriod): Date {
    const now = new Date();
    
    switch (period) {
      case StatsPeriod.DAILY:
        now.setHours(0, 0, 0, 0);
        return now;
      case StatsPeriod.WEEKLY:
        const dayOfWeek = now.getDay();
        const diff = now.getDate() - dayOfWeek;
        now.setDate(diff);
        now.setHours(0, 0, 0, 0);
        return now;
      case StatsPeriod.MONTHLY:
        now.setDate(1);
        now.setHours(0, 0, 0, 0);
        return now;
      case StatsPeriod.YEARLY:
        now.setMonth(0, 1);
        now.setHours(0, 0, 0, 0);
        return now;
      case StatsPeriod.ALL_TIME:
      default:
        return new Date(0);
    }
  }

  /**
   * Gets job history from KV storage.
   */
  async getJobHistory(limit: number = 20): Promise<any[]> {
    if (!this.kv) return [];

    const list = await this.kv.list({ prefix: 'stats-job:' });
    const jobs = [];

    for (const key of list.keys.slice(0, limit)) {
      const value = await this.kv.get(key.name);
      if (value) {
        jobs.push({
          id: key.name.replace('stats-job:', ''),
          ...JSON.parse(value)
        });
      }
    }

    return jobs.sort((a, b) => 
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
  }

  /**
   * Manually triggers statistics calculation for a specific player.
   */
  async calculatePlayerStats(playerId: string, forceRecalculation: boolean = false): Promise<void> {
    logger.info('Manually calculating player statistics', { playerId, forceRecalculation });

    // Process all periods for the player
    for (const period of Object.values(StatsPeriod)) {
      await this.processPlayer(playerId, period);
    }
  }
}