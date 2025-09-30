/**
 * Statistics Collection Service
 *
 * Hooks into game events to collect real-time statistics data
 */

import {
  GameState,
  Player,
  GameEventType,
  StatsGameType,
  RandomUtils
} from '@primo-poker/shared';
import {
  ISessionStatisticsRepository,
  IHandStatisticsRepository,
  SessionStatistics,
  HandStatistics
} from '@primo-poker/persistence';

export interface StatisticsCollectorConfig {
  sessionRepository: ISessionStatisticsRepository;
  handRepository: IHandStatisticsRepository;
  gameType?: StatsGameType;
}

/**
 * Collects and records statistics from game events
 */
export class StatisticsCollector {
  private sessionRepository: ISessionStatisticsRepository;
  private handRepository: IHandStatisticsRepository;
  private activeSessions: Map<string, string> = new Map(); // playerId -> sessionId
  private gameType: StatsGameType;

  constructor(config: StatisticsCollectorConfig) {
    this.sessionRepository = config.sessionRepository;
    this.handRepository = config.handRepository;
    this.gameType = config.gameType || 'CASH_GAME';
  }

  /**
   * Called when a player joins a table
   */
  async onPlayerJoinTable(
    playerId: string,
    tableId: string,
    buyInAmount: number,
    startingChips: number
  ): Promise<void> {
    try {
      // Check if player already has an active session
      const existingSession = await this.sessionRepository.findActiveSession(playerId, tableId);

      if (existingSession) {
        // Player rejoining - reuse existing session
        this.activeSessions.set(playerId, existingSession.id);
        return;
      }

      // Create new session
      const session = await this.sessionRepository.create({
        playerId,
        tableId,
        gameType: this.gameType,
        startTime: new Date(),
        endTime: undefined,
        duration: 0,
        buyInAmount,
        cashOutAmount: 0,
        netResult: 0,
        handsPlayed: 0,
        handsWon: 0,
        biggestPotWon: 0,
        peakChipCount: startingChips,
        lowestChipCount: startingChips,
      });

      this.activeSessions.set(playerId, session.id);
    } catch (error) {
      console.error('Failed to create session statistics:', error);
      // Don't throw - statistics failures shouldn't break gameplay
    }
  }

  /**
   * Called when a player leaves a table
   */
  async onPlayerLeaveTable(
    playerId: string,
    cashOutAmount: number
  ): Promise<void> {
    try {
      const sessionId = this.activeSessions.get(playerId);

      if (!sessionId) {
        console.warn(`No active session found for player ${playerId}`);
        return;
      }

      await this.sessionRepository.endSession(sessionId, cashOutAmount);
      this.activeSessions.delete(playerId);
    } catch (error) {
      console.error('Failed to end session statistics:', error);
    }
  }

  /**
   * Called when a hand is completed
   */
  async onHandComplete(
    handId: string,
    gameState: GameState,
    winners: Map<string, number>
  ): Promise<void> {
    try {
      const handStats: Omit<HandStatistics, 'id' | 'createdAt'>[] = [];

      for (const player of gameState.players) {
        const sessionId = this.activeSessions.get(player.id);

        if (!sessionId) {
          console.warn(`No active session for player ${player.id} during hand ${handId}`);
          continue;
        }

        const winnings = winners.get(player.id) || 0;
        const invested = player.bet + (player.currentBet || 0);
        const netResult = winnings - invested;

        handStats.push({
          sessionId,
          handId,
          playerId: player.id,
          position: player.position,
          holeCards: player.hand?.map(c => `${c.rank}${c.suit}`) || [],
          actions: this.extractPlayerActions(gameState, player.id),
          finalPot: gameState.pots.reduce((sum, pot) => sum + pot.amount, 0),
          investment: invested,
          winnings,
          netResult,
          wonHand: winnings > invested,
          wentToShowdown: !player.folded && gameState.phase === 'SHOWDOWN',
        });

        // Update session statistics
        await this.updateSessionStats(sessionId, player, winnings, invested);
      }

      // Batch insert hand statistics
      if (handStats.length > 0) {
        await this.handRepository.createBatch(handStats);
      }
    } catch (error) {
      console.error('Failed to record hand statistics:', error);
    }
  }

  /**
   * Update session stats after each hand
   */
  private async updateSessionStats(
    sessionId: string,
    player: Player,
    winnings: number,
    invested: number
  ): Promise<void> {
    try {
      const session = await this.sessionRepository.findById(sessionId);

      if (!session) {
        console.warn(`Session ${sessionId} not found`);
        return;
      }

      const netResult = winnings - invested;
      const wonHand = winnings > invested;

      await this.sessionRepository.update(sessionId, {
        handsPlayed: session.handsPlayed + 1,
        handsWon: wonHand ? session.handsWon + 1 : session.handsWon,
        biggestPotWon: Math.max(session.biggestPotWon, winnings),
        peakChipCount: Math.max(session.peakChipCount, player.chips),
        lowestChipCount: Math.min(session.lowestChipCount, player.chips),
        netResult: session.netResult + netResult,
      });
    } catch (error) {
      console.error('Failed to update session statistics:', error);
    }
  }

  /**
   * Extract player actions from game state
   */
  private extractPlayerActions(gameState: GameState, playerId: string): string[] {
    // This is a simplified version - in production you'd track actions throughout the hand
    const player = gameState.players.find(p => p.id === playerId);

    if (!player) return [];

    const actions: string[] = [];

    if (player.folded) {
      actions.push('FOLD');
    } else if (player.isAllIn) {
      actions.push('ALL_IN');
    } else if (player.bet > 0) {
      actions.push(player.bet > gameState.currentBet ? 'RAISE' : 'CALL');
    }

    return actions;
  }

  /**
   * Get session ID for a player (useful for external queries)
   */
  getActiveSessionId(playerId: string): string | undefined {
    return this.activeSessions.get(playerId);
  }

  /**
   * Clean up orphaned sessions (useful for crash recovery)
   */
  async cleanupOrphanedSessions(tableId: string, activePlayerIds: string[]): Promise<void> {
    try {
      // This would query for all active sessions on this table
      // and end any that don't have players in activePlayerIds
      // Implementation depends on adding a method to SessionStatisticsRepository
      console.log(`Cleanup orphaned sessions for table ${tableId}`);
    } catch (error) {
      console.error('Failed to cleanup orphaned sessions:', error);
    }
  }
}
