/**
 * Tournament Manager - Orchestrates tournament operations
 */

import { Tournament, TournamentState, TournamentType } from '@primo-poker/shared';
import { TournamentCoordinator } from '@primo-poker/persistence';

export interface TournamentCreateConfig {
  name: string;
  type: TournamentType;
  buyIn: number;
  rake: number;
  startingChips: number;
  blindLevelDuration: number; // minutes
  maxPlayers: number;
  minPlayers: number;
  scheduledStart?: Date;
  lateRegistrationLevels?: number;
  rebuyPeriod?: number; // levels
  rebuyAmount?: number;
  addOnAmount?: number;
}

export interface BlindStructure {
  blindLevels: Array<{
    level: number;
    smallBlind: number;
    bigBlind: number;
    ante: number;
    duration: number;
  }>;
  breakAfterLevels?: number[];
}

export interface PayoutStructure {
  type: 'percentage' | 'fixed';
  places: number;
  distribution: Array<{
    place?: number;
    places?: [number, number]; // range
    percentage?: number;
    amount?: number;
  }>;
}

export interface TournamentResult {
  success: boolean;
  error?: string;
  [key: string]: any;
}

export class TournamentManager {
  constructor(private env: any) {}

  /**
   * Create a new tournament
   */
  async createTournament(config: TournamentCreateConfig): Promise<TournamentResult> {
    try {
      // Validate configuration
      const validation = this.validateConfig(config);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Generate tournament ID
      const tournamentId = `tournament-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Get tournament coordinator
      const coordinator = this.getCoordinator(tournamentId);

      // Create tournament in coordinator
      const response = await coordinator.fetch(
        new Request('http://internal/tournament', {
          method: 'POST',
          body: JSON.stringify({
            action: 'CREATE_TOURNAMENT',
            tournamentId,
            config: {
              ...config,
              maxPlayersPerTable: 9,
            },
          }),
        })
      );

      const result = await response.json();
      
      return {
        success: response.ok,
        tournamentId,
        ...result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create tournament',
      };
    }
  }

  /**
   * Register a player to tournament
   */
  async registerPlayer(
    tournamentId: string,
    playerInfo: {
      playerId: string;
      name: string;
      buyIn: number;
    }
  ): Promise<TournamentResult> {
    try {
      const coordinator = this.getCoordinator(tournamentId);

      // Check if late registration is allowed
      const statusResponse = await coordinator.fetch(
        new Request(`http://internal/tournament/${tournamentId}/status`)
      );
      
      if (statusResponse.ok) {
        const status = await statusResponse.json();
        
        if (status.state === TournamentState.IN_PROGRESS) {
          const lateRegLevels = status.config?.lateRegistrationLevels || 0;
          if (status.currentLevel > lateRegLevels) {
            return { success: false, error: 'Registration closed' };
          }
        }
      }

      // Register player
      const response = await coordinator.fetch(
        new Request('http://internal/tournament', {
          method: 'POST',
          body: JSON.stringify({
            action: 'REGISTER_PLAYER',
            tournamentId,
            player: playerInfo,
          }),
        })
      );

      const result = await response.json();
      
      return {
        success: response.ok,
        ...result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to register player',
      };
    }
  }

  /**
   * Start a tournament
   */
  async startTournament(tournamentId: string): Promise<TournamentResult> {
    try {
      const coordinator = this.getCoordinator(tournamentId);

      const response = await coordinator.fetch(
        new Request('http://internal/tournament', {
          method: 'POST',
          body: JSON.stringify({
            action: 'START_TOURNAMENT',
            tournamentId,
          }),
        })
      );

      const result = await response.json();
      
      return {
        success: response.ok,
        ...result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start tournament',
      };
    }
  }

  /**
   * Pause tournament for break
   */
  async pauseForBreak(tournamentId: string, duration: number): Promise<TournamentResult> {
    try {
      const coordinator = this.getCoordinator(tournamentId);

      const response = await coordinator.fetch(
        new Request('http://internal/tournament', {
          method: 'POST',
          body: JSON.stringify({
            action: 'TOURNAMENT_BREAK',
            tournamentId,
            duration,
          }),
        })
      );

      const result = await response.json();
      
      return {
        success: response.ok,
        ...result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to pause tournament',
      };
    }
  }

  /**
   * Cancel a tournament
   */
  async cancelTournament(tournamentId: string, reason: string): Promise<TournamentResult> {
    try {
      const coordinator = this.getCoordinator(tournamentId);

      const response = await coordinator.fetch(
        new Request('http://internal/tournament', {
          method: 'POST',
          body: JSON.stringify({
            action: 'CANCEL_TOURNAMENT',
            tournamentId,
            reason,
          }),
        })
      );

      const result = await response.json();
      
      // Process refunds
      if (result.players) {
        const refunds = result.players.map((player: any) => ({
          playerId: player.playerId,
          amount: result.config.buyIn + result.config.rake,
        }));
        
        return {
          success: true,
          cancelled: true,
          refunds,
        };
      }
      
      return {
        success: response.ok,
        ...result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel tournament',
      };
    }
  }

  /**
   * Get tournament status
   */
  async getTournamentStatus(tournamentId: string): Promise<any> {
    try {
      const coordinator = this.getCoordinator(tournamentId);

      const response = await coordinator.fetch(
        new Request(`http://internal/tournament/${tournamentId}/status`)
      );

      if (response.ok) {
        return await response.json();
      }
      
      return null;
    } catch (error) {
      console.error('Failed to get tournament status:', error);
      return null;
    }
  }

  /**
   * Get tournament leaderboard
   */
  async getLeaderboard(tournamentId: string, limit: number = 50): Promise<any[]> {
    try {
      const coordinator = this.getCoordinator(tournamentId);

      const response = await coordinator.fetch(
        new Request(`http://internal/tournament/${tournamentId}/leaderboard`)
      );

      if (response.ok) {
        const leaderboard = await response.json();
        return leaderboard.slice(0, limit);
      }
      
      return [];
    } catch (error) {
      console.error('Failed to get leaderboard:', error);
      return [];
    }
  }

  /**
   * Handle player elimination
   */
  async eliminatePlayer(
    tournamentId: string,
    playerId: string,
    tableId: string
  ): Promise<TournamentResult> {
    try {
      const coordinator = this.getCoordinator(tournamentId);

      // Get current tournament state to determine position
      const statusResponse = await coordinator.fetch(
        new Request(`http://internal/tournament/${tournamentId}/status`)
      );
      
      let position = 1;
      if (statusResponse.ok) {
        const status = await statusResponse.json();
        position = status.playersRemaining || 1;
      }

      const response = await coordinator.fetch(
        new Request('http://internal/tournament', {
          method: 'POST',
          body: JSON.stringify({
            action: 'PLAYER_ELIMINATED',
            tournamentId,
            tableId,
            playerId,
            position,
          }),
        })
      );

      const result = await response.json();
      
      // Calculate payout if applicable
      let payout = 0;
      if (result.position && result.prizeStructure) {
        payout = this.calculatePayoutForPosition(result.position, result.prizeStructure);
      }
      
      return {
        success: response.ok,
        position: result.position,
        payout,
        rebalanced: result.rebalanced,
        movedPlayers: result.movedPlayers,
        finalTable: result.finalTable,
        consolidatedTable: result.consolidatedToTable,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to eliminate player',
      };
    }
  }

  /**
   * Broadcast tournament announcement
   */
  async broadcastAnnouncement(
    tournamentId: string,
    message: string
  ): Promise<TournamentResult> {
    try {
      const coordinator = this.getCoordinator(tournamentId);

      const response = await coordinator.fetch(
        new Request('http://internal/tournament', {
          method: 'POST',
          body: JSON.stringify({
            action: 'BROADCAST_MESSAGE',
            tournamentId,
            message: {
              type: 'ANNOUNCEMENT',
              content: message,
            },
          }),
        })
      );

      const result = await response.json();
      
      return {
        success: response.ok,
        ...result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to broadcast announcement',
      };
    }
  }

  /**
   * Generate tournament structure
   */
  generateTournamentStructure(config: {
    type: TournamentType;
    startingChips: number;
    blindLevelDuration: number;
  }): BlindStructure {
    const levels = [];
    const isturbo = config.type === TournamentType.TURBO || config.type === TournamentType.HYPER_TURBO;
    const duration = config.blindLevelDuration;
    
    // Standard blind progression
    const blindProgression = isturbo
      ? [25, 50, 100, 200, 400, 800, 1600, 3200, 6400, 12800]
      : [25, 50, 75, 100, 150, 200, 300, 400, 600, 800, 1200, 1600, 2400, 3200, 4800, 6400];

    for (let i = 0; i < blindProgression.length; i++) {
      const sb = blindProgression[i];
      const bb = sb * 2;
      const ante = i > 5 ? Math.floor(bb * 0.1) : 0;

      levels.push({
        level: i + 1,
        smallBlind: sb,
        bigBlind: bb,
        ante,
        duration,
      });
    }

    // Add break levels
    const breakAfterLevels = isturbo ? [6, 12] : [4, 8, 12, 16];

    return {
      blindLevels: levels,
      breakAfterLevels,
    };
  }

  /**
   * Calculate tournament payouts
   */
  calculatePayouts(
    entrants: number,
    prizePool: number,
    structure: PayoutStructure
  ): {
    total: number;
    places: Array<{ place: number; amount: number }>;
  } {
    const payouts: Array<{ place: number; amount: number }> = [];
    const actualPrizePool = entrants * prizePool;

    for (const dist of structure.distribution) {
      if (dist.place) {
        payouts.push({
          place: dist.place,
          amount: Math.floor(actualPrizePool * (dist.percentage! / 100)),
        });
      } else if (dist.places) {
        const [start, end] = dist.places;
        const eachAmount = Math.floor(actualPrizePool * (dist.percentage! / 100));
        
        for (let place = start; place <= end; place++) {
          payouts.push({ place, amount: eachAmount });
        }
      }
    }

    return {
      total: actualPrizePool,
      places: payouts,
    };
  }

  /**
   * Get tournament statistics
   */
  async getTournamentStatistics(tournamentId: string): Promise<any> {
    // Mock implementation - would aggregate from actual game data
    return {
      totalHands: Math.floor(Math.random() * 5000) + 1000,
      averageHandDuration: 45, // seconds
      biggestPot: Math.floor(Math.random() * 100000) + 10000,
      totalRebuys: Math.floor(Math.random() * 100),
      bustOutRate: Math.random() * 0.1 + 0.05, // 5-15% per level
    };
  }

  /**
   * Generate tournament report
   */
  async generateTournamentReport(tournamentId: string): Promise<any> {
    const coordinator = this.getCoordinator(tournamentId);

    try {
      const response = await coordinator.fetch(
        new Request(`http://internal/tournament/${tournamentId}/report`)
      );

      if (response.ok) {
        const data = await response.json();
        
        return {
          ...data,
          duration: this.formatDuration(data.duration),
        };
      }

      // Fallback mock data
      return {
        winner: { playerId: 'player-1', name: 'Champion' },
        finalTable: [
          { playerId: 'player-1', position: 1, payout: 30000 },
          { playerId: 'player-2', position: 2, payout: 20000 },
        ],
        duration: '6 hours',
        totalHands: 4532,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate tournament configuration
   */
  private validateConfig(config: TournamentCreateConfig): { valid: boolean; error?: string } {
    if (config.buyIn < 0) {
      return { valid: false, error: 'Buy-in must be positive' };
    }

    if (config.minPlayers > config.maxPlayers) {
      return { valid: false, error: 'Min players cannot exceed max players' };
    }

    if (config.minPlayers < 2) {
      return { valid: false, error: 'Minimum 2 players required' };
    }

    if (config.blindLevelDuration < 1) {
      return { valid: false, error: 'Blind level duration must be at least 1 minute' };
    }

    return { valid: true };
  }

  /**
   * Get tournament coordinator stub
   */
  private getCoordinator(tournamentId: string): DurableObjectStub {
    const id = this.env.TOURNAMENT_COORDINATOR.idFromName(tournamentId);
    return this.env.TOURNAMENT_COORDINATOR.get(id);
  }

  /**
   * Calculate payout for finishing position
   */
  private calculatePayoutForPosition(position: number, prizeStructure: any): number {
    // Simplified calculation - would use actual prize structure
    if (position === 1) return prizeStructure.total * 0.3;
    if (position === 2) return prizeStructure.total * 0.2;
    if (position === 3) return prizeStructure.total * 0.125;
    if (position <= 9) return prizeStructure.total * 0.05;
    if (position <= 15) return prizeStructure.total * 0.02;
    return 0;
  }

  /**
   * Format duration for display
   */
  private formatDuration(milliseconds: number): string {
    const hours = Math.floor(milliseconds / 3600000);
    const minutes = Math.floor((milliseconds % 3600000) / 60000);
    
    if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''}${minutes > 0 ? ` ${minutes} minutes` : ''}`;
    }
    return `${minutes} minutes`;
  }
}