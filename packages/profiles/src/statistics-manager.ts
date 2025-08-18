import { 
  PlayerStatistics, 
  SessionStatistics, 
  HandStatistics,
  PlayerStatisticsSchema,
  SessionStatisticsSchema,
  HandStatisticsSchema,
  StatsPeriod,
  StatsGameType,
  StatsCalculationResult
} from '@primo-poker/shared';
import { RandomUtils } from '@primo-poker/shared';

/**
 * Manages player statistics calculation, storage, and retrieval.
 * Handles real-time updates and periodic aggregations.
 */
export class StatisticsManager {
  private playerStats: Map<string, PlayerStatistics[]> = new Map();
  private sessionStats: Map<string, SessionStatistics[]> = new Map();
  private handStats: Map<string, HandStatistics[]> = new Map();

  /**
   * Records a completed hand for statistics tracking.
   */
  async recordHand(handData: {
    handId: string;
    playerId: string;
    tableId: string;
    handNumber: number;
    position: string;
    invested: number;
    won: number;
    wentToShowdown: boolean;
    wonAtShowdown?: boolean;
    preFlopAction?: string;
    flopAction?: string;
    turnAction?: string;
    riverAction?: string;
  }): Promise<HandStatistics> {
    const handStat: HandStatistics = {
      id: RandomUtils.generateUUID(),
      handId: handData.handId,
      playerId: handData.playerId,
      tableId: handData.tableId,
      handNumber: handData.handNumber,
      timestamp: new Date(),
      position: handData.position,
      invested: handData.invested,
      won: handData.won,
      netResult: handData.won - handData.invested,
      wentToShowdown: handData.wentToShowdown,
      wonAtShowdown: handData.wonAtShowdown,
      preFlopAction: handData.preFlopAction,
      flopAction: handData.flopAction,
      turnAction: handData.turnAction,
      riverAction: handData.riverAction,
      createdAt: new Date()
    };

    // Validate and store
    const validated = HandStatisticsSchema.parse(handStat);
    const playerHands = this.handStats.get(handData.playerId) || [];
    playerHands.push(validated);
    this.handStats.set(handData.playerId, playerHands);

    // Update session statistics
    await this.updateSessionStats(handData.playerId, handData.tableId, validated);
    
    // Update player statistics
    await this.updatePlayerStats(handData.playerId);

    return validated;
  }

  /**
   * Starts a new session for a player at a table.
   */
  async startSession(sessionData: {
    playerId: string;
    tableId: string;
    buyInAmount: number;
    gameType: StatsGameType;
  }): Promise<SessionStatistics> {
    const session: SessionStatistics = {
      id: RandomUtils.generateUUID(),
      playerId: sessionData.playerId,
      tableId: sessionData.tableId,
      gameType: sessionData.gameType,
      startTime: new Date(),
      duration: 0,
      buyInAmount: sessionData.buyInAmount,
      cashOutAmount: 0,
      netResult: -sessionData.buyInAmount,
      handsPlayed: 0,
      handsWon: 0,
      biggestPotWon: 0,
      peakChipCount: sessionData.buyInAmount,
      lowestChipCount: sessionData.buyInAmount,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const validated = SessionStatisticsSchema.parse(session);
    const playerSessions = this.sessionStats.get(sessionData.playerId) || [];
    playerSessions.push(validated);
    this.sessionStats.set(sessionData.playerId, playerSessions);

    return validated;
  }

  /**
   * Ends a session and calculates final statistics.
   */
  async endSession(playerId: string, tableId: string, cashOutAmount: number): Promise<SessionStatistics | null> {
    const sessions = this.sessionStats.get(playerId) || [];
    const activeSession = sessions.find(s => s.tableId === tableId && !s.endTime);
    
    if (!activeSession) {
      return null;
    }

    activeSession.endTime = new Date();
    activeSession.cashOutAmount = cashOutAmount;
    activeSession.netResult = cashOutAmount - activeSession.buyInAmount;
    activeSession.duration = Math.floor(
      (activeSession.endTime.getTime() - activeSession.startTime.getTime()) / 1000
    );
    activeSession.updatedAt = new Date();

    // Update player statistics
    await this.updatePlayerStats(playerId);

    return activeSession;
  }

  /**
   * Updates session statistics with hand results.
   */
  private async updateSessionStats(playerId: string, tableId: string, handStat: HandStatistics): Promise<void> {
    const sessions = this.sessionStats.get(playerId) || [];
    const activeSession = sessions.find(s => s.tableId === tableId && !s.endTime);
    
    if (!activeSession) {
      return;
    }

    activeSession.handsPlayed++;
    if (handStat.won > 0) {
      activeSession.handsWon++;
      activeSession.biggestPotWon = Math.max(activeSession.biggestPotWon, handStat.won);
    }
    activeSession.updatedAt = new Date();
  }

  /**
   * Updates player statistics based on hands and sessions.
   */
  private async updatePlayerStats(playerId: string): Promise<void> {
    const hands = this.handStats.get(playerId) || [];
    const sessions = this.sessionStats.get(playerId) || [];
    
    // Get or create player statistics
    let playerStatsList = this.playerStats.get(playerId) || [];
    let allTimeStats = playerStatsList.find(
      s => s.period === StatsPeriod.ALL_TIME && s.gameType === StatsGameType.ALL
    );

    if (!allTimeStats) {
      allTimeStats = {
        id: RandomUtils.generateUUID(),
        playerId,
        period: StatsPeriod.ALL_TIME,
        gameType: StatsGameType.ALL,
        periodStart: new Date(),
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
        createdAt: new Date(),
        updatedAt: new Date(),
        lastCalculatedAt: new Date()
      };
      playerStatsList.push(allTimeStats);
    }

    // Calculate statistics
    const stats = this.calculateStatistics(hands, sessions);
    
    // Update all-time statistics
    allTimeStats.handsPlayed = hands.length;
    allTimeStats.handsWon = hands.filter(h => h.won > 0).length;
    allTimeStats.showdownsSeen = hands.filter(h => h.wentToShowdown).length;
    allTimeStats.showdownsWon = hands.filter(h => h.wonAtShowdown).length;
    allTimeStats.totalWinnings = hands.reduce((sum, h) => sum + h.won, 0);
    allTimeStats.totalBetAmount = hands.reduce((sum, h) => sum + h.invested, 0);
    allTimeStats.biggestPotWon = Math.max(...hands.map(h => h.won), 0);
    allTimeStats.vpip = stats.vpip;
    allTimeStats.pfr = stats.pfr;
    allTimeStats.aggressionFactor = stats.aggressionFactor;
    allTimeStats.wtsd = stats.wtsd;
    allTimeStats.wsd = stats.wsd;
    allTimeStats.sessionsPlayed = sessions.length;
    allTimeStats.totalSessionDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
    allTimeStats.profitableSessions = sessions.filter(s => s.netResult > 0).length;
    allTimeStats.updatedAt = new Date();
    allTimeStats.lastCalculatedAt = new Date();

    // Validate and store
    const validated = PlayerStatisticsSchema.parse(allTimeStats);
    this.playerStats.set(playerId, playerStatsList);
  }

  /**
   * Calculates key poker statistics from hand history.
   */
  calculateStatistics(hands: HandStatistics[], sessions: SessionStatistics[]): StatsCalculationResult {
    if (hands.length === 0) {
      return {
        vpip: 0,
        pfr: 0,
        aggressionFactor: 0,
        wtsd: 0,
        wsd: 0,
        winRate: 0
      };
    }

    // VPIP (Voluntarily Put money In Pot)
    const vpipHands = hands.filter(h => 
      h.preFlopAction && ['CALL', 'RAISE', 'BET'].includes(h.preFlopAction)
    );
    const vpip = (vpipHands.length / hands.length) * 100;

    // PFR (Pre-Flop Raise)
    const pfrHands = hands.filter(h => 
      h.preFlopAction && ['RAISE', 'BET'].includes(h.preFlopAction)
    );
    const pfr = (pfrHands.length / hands.length) * 100;

    // Aggression Factor
    let betsAndRaises = 0;
    let calls = 0;
    hands.forEach(h => {
      ['preFlopAction', 'flopAction', 'turnAction', 'riverAction'].forEach(street => {
        const action = h[street as keyof HandStatistics] as string | undefined;
        if (action === 'BET' || action === 'RAISE') betsAndRaises++;
        if (action === 'CALL') calls++;
      });
    });
    const aggressionFactor = calls > 0 ? betsAndRaises / calls : betsAndRaises;

    // WTSD (Went To ShowDown)
    const wtsd = (hands.filter(h => h.wentToShowdown).length / hands.length) * 100;

    // WSD (Won at ShowDown)
    const showdownHands = hands.filter(h => h.wentToShowdown);
    const wsd = showdownHands.length > 0 
      ? (hands.filter(h => h.wonAtShowdown).length / showdownHands.length) * 100 
      : 0;

    // Win Rate (BB/100 hands)
    const totalProfit = hands.reduce((sum, h) => sum + h.netResult, 0);
    const totalHands = hands.length;
    const winRate = totalHands >= 100 ? (totalProfit / (totalHands / 100)) : 0;

    return {
      vpip,
      pfr,
      aggressionFactor,
      wtsd,
      wsd,
      winRate
    };
  }

  /**
   * Gets player statistics for a specific period and game type.
   */
  async getPlayerStatistics(
    playerId: string, 
    period: StatsPeriod = StatsPeriod.ALL_TIME,
    gameType: StatsGameType = StatsGameType.ALL
  ): Promise<PlayerStatistics | null> {
    const playerStatsList = this.playerStats.get(playerId) || [];
    return playerStatsList.find(s => s.period === period && s.gameType === gameType) || null;
  }

  /**
   * Gets session history for a player.
   */
  async getSessionHistory(playerId: string, limit: number = 20): Promise<SessionStatistics[]> {
    const sessions = this.sessionStats.get(playerId) || [];
    return sessions
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit);
  }

  /**
   * Gets hand history for a player.
   */
  async getHandHistory(playerId: string, limit: number = 100): Promise<HandStatistics[]> {
    const hands = this.handStats.get(playerId) || [];
    return hands
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }
}