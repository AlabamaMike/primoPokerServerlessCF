import { IRequest, Router } from 'itty-router';
import { 
  ApiResponse,
  ValidationUtils,
  RandomUtils,
  TournamentState,
  TournamentType,
} from '@primo-poker/shared';
import { TournamentManager } from '@primo-poker/core';
import { logger, LogLevel } from '@primo-poker/logging';
import { authMiddleware } from '../middleware/auth';

interface AuthenticatedRequest extends IRequest {
  user?: {
    userId: string;
    username: string;
    email: string;
    roles: string[];
  };
  env?: any;
}

export class TournamentRoutes {
  private router: Router<any>;
  private tournamentManager?: TournamentManager;

  constructor() {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Public routes
    this.router.get('/', this.handleGetTournaments.bind(this));
    this.router.get('/:tournamentId', this.handleGetTournament.bind(this));
    this.router.get('/:tournamentId/leaderboard', this.handleGetLeaderboard.bind(this));
    this.router.get('/:tournamentId/structure', this.handleGetStructure.bind(this));
    
    // Authenticated routes
    this.router.post('/', authMiddleware, this.handleCreateTournament.bind(this));
    this.router.post('/:tournamentId/register', authMiddleware, this.handleRegisterPlayer.bind(this));
    this.router.post('/:tournamentId/unregister', authMiddleware, this.handleUnregisterPlayer.bind(this));
    this.router.post('/:tournamentId/start', authMiddleware, this.handleStartTournament.bind(this));
    this.router.post('/:tournamentId/pause', authMiddleware, this.handlePauseTournament.bind(this));
    this.router.post('/:tournamentId/resume', authMiddleware, this.handleResumeTournament.bind(this));
    this.router.post('/:tournamentId/cancel', authMiddleware, this.handleCancelTournament.bind(this));
    
    // Player actions
    this.router.post('/:tournamentId/rebuy', authMiddleware, this.handleRebuy.bind(this));
    this.router.post('/:tournamentId/addon', authMiddleware, this.handleAddOn.bind(this));
    
    // Admin routes
    this.router.post('/:tournamentId/announce', authMiddleware, this.handleBroadcastAnnouncement.bind(this));
    this.router.get('/:tournamentId/statistics', authMiddleware, this.handleGetStatistics.bind(this));
  }

  private getTournamentManager(env: any): TournamentManager {
    if (!this.tournamentManager) {
      this.tournamentManager = new TournamentManager(env);
    }
    return this.tournamentManager;
  }

  /**
   * GET /api/tournaments
   * Get list of tournaments with filtering
   */
  private async handleGetTournaments(request: AuthenticatedRequest): Promise<Response> {
    try {
      const url = new URL(request.url);
      const params = url.searchParams;
      
      const filters = {
        status: params.get('status') as TournamentState | null,
        type: params.get('type') as TournamentType | null,
        limit: parseInt(params.get('limit') || '20'),
        offset: parseInt(params.get('offset') || '0'),
      };

      // Mock data for now - would query from database
      const tournaments = [
        {
          id: 'tournament-1',
          name: 'Daily $100 Freezeout',
          type: TournamentType.FREEZEOUT,
          status: TournamentState.REGISTERING,
          buyIn: 100,
          rake: 10,
          registeredPlayers: 42,
          maxPlayers: 100,
          startTime: new Date(Date.now() + 3600000).toISOString(),
          prizePool: 4200,
        },
        {
          id: 'tournament-2',
          name: 'Sunday Million',
          type: TournamentType.REBUY,
          status: TournamentState.IN_PROGRESS,
          buyIn: 1000,
          rake: 100,
          registeredPlayers: 856,
          playersRemaining: 234,
          maxPlayers: 1000,
          startTime: new Date(Date.now() - 7200000).toISOString(),
          prizePool: 912000,
        },
      ];

      return this.successResponse({
        tournaments: tournaments.slice(filters.offset, filters.offset + filters.limit),
        total: tournaments.length,
        hasMore: tournaments.length > filters.offset + filters.limit,
      });
    } catch (error) {
      logger.error('Get tournaments error', { error });
      return this.errorResponse('Failed to fetch tournaments', 500);
    }
  }

  /**
   * GET /api/tournaments/:tournamentId
   * Get detailed tournament information
   */
  private async handleGetTournament(request: AuthenticatedRequest): Promise<Response> {
    try {
      const tournamentId = request.params?.tournamentId;
      if (!tournamentId) {
        return this.errorResponse('Tournament ID required', 400);
      }

      const manager = this.getTournamentManager(request.env);
      const tournament = await manager.getTournamentStatus(tournamentId);

      if (!tournament) {
        return this.errorResponse('Tournament not found', 404);
      }

      return this.successResponse(tournament);
    } catch (error) {
      logger.error('Get tournament error', { error });
      return this.errorResponse('Failed to fetch tournament', 500);
    }
  }

  /**
   * POST /api/tournaments
   * Create a new tournament
   */
  private async handleCreateTournament(request: AuthenticatedRequest): Promise<Response> {
    try {
      if (!request.user) {
        return this.errorResponse('Authentication required', 401);
      }

      // Check if user has permission to create tournaments
      if (!request.user.roles.includes('admin') && !request.user.roles.includes('tournament_director')) {
        return this.errorResponse('Insufficient permissions', 403);
      }

      const body = await request.json();
      
      // Validate required fields
      if (!body.name || !body.type || !body.buyIn) {
        return this.errorResponse('Missing required fields', 400);
      }

      const manager = this.getTournamentManager(request.env);
      const result = await manager.createTournament({
        name: body.name,
        type: body.type,
        buyIn: body.buyIn,
        rake: body.rake || Math.floor(body.buyIn * 0.1),
        startingChips: body.startingChips || 10000,
        blindLevelDuration: body.blindLevelDuration || 15,
        maxPlayers: body.maxPlayers || 1000,
        minPlayers: body.minPlayers || 10,
        scheduledStart: body.scheduledStart ? new Date(body.scheduledStart) : undefined,
        lateRegistrationLevels: body.lateRegistrationLevels || 0,
        rebuyPeriod: body.rebuyPeriod,
        rebuyAmount: body.rebuyAmount,
        addOnAmount: body.addOnAmount,
      });

      if (!result.success) {
        return this.errorResponse(result.error || 'Failed to create tournament', 400);
      }

      logger.info('Tournament created', { 
        tournamentId: result.tournamentId,
        createdBy: request.user.userId 
      });

      return this.successResponse(result);
    } catch (error) {
      logger.error('Create tournament error', { error });
      return this.errorResponse('Failed to create tournament', 500);
    }
  }

  /**
   * POST /api/tournaments/:tournamentId/register
   * Register for a tournament
   */
  private async handleRegisterPlayer(request: AuthenticatedRequest): Promise<Response> {
    try {
      const tournamentId = request.params?.tournamentId;
      if (!tournamentId || !request.user) {
        return this.errorResponse('Tournament ID and authentication required', 400);
      }

      const manager = this.getTournamentManager(request.env);
      const result = await manager.registerPlayer(tournamentId, {
        playerId: request.user.userId,
        name: request.user.username,
        buyIn: 0, // Will be calculated based on tournament config
      });

      if (!result.success) {
        return this.errorResponse(result.error || 'Registration failed', 400);
      }

      logger.info('Player registered for tournament', { 
        tournamentId,
        playerId: request.user.userId 
      });

      return this.successResponse({
        registered: true,
        tableId: result.tableId,
        seatNumber: result.seatNumber,
      });
    } catch (error) {
      logger.error('Register player error', { error });
      return this.errorResponse('Failed to register for tournament', 500);
    }
  }

  /**
   * POST /api/tournaments/:tournamentId/unregister
   * Unregister from a tournament
   */
  private async handleUnregisterPlayer(request: AuthenticatedRequest): Promise<Response> {
    try {
      const tournamentId = request.params?.tournamentId;
      if (!tournamentId || !request.user) {
        return this.errorResponse('Tournament ID and authentication required', 400);
      }

      // Implementation would handle unregistration and refunds
      return this.successResponse({
        unregistered: true,
        refunded: true,
      });
    } catch (error) {
      logger.error('Unregister player error', { error });
      return this.errorResponse('Failed to unregister from tournament', 500);
    }
  }

  /**
   * POST /api/tournaments/:tournamentId/start
   * Start a tournament (admin only)
   */
  private async handleStartTournament(request: AuthenticatedRequest): Promise<Response> {
    try {
      const tournamentId = request.params?.tournamentId;
      if (!tournamentId || !request.user) {
        return this.errorResponse('Tournament ID and authentication required', 400);
      }

      // Check permissions
      if (!request.user.roles.includes('admin') && !request.user.roles.includes('tournament_director')) {
        return this.errorResponse('Insufficient permissions', 403);
      }

      const manager = this.getTournamentManager(request.env);
      const result = await manager.startTournament(tournamentId);

      if (!result.success) {
        return this.errorResponse(result.error || 'Failed to start tournament', 400);
      }

      logger.info('Tournament started', { 
        tournamentId,
        startedBy: request.user.userId,
        tables: result.tables,
        players: result.players,
      });

      return this.successResponse(result);
    } catch (error) {
      logger.error('Start tournament error', { error });
      return this.errorResponse('Failed to start tournament', 500);
    }
  }

  /**
   * POST /api/tournaments/:tournamentId/pause
   * Pause tournament for break
   */
  private async handlePauseTournament(request: AuthenticatedRequest): Promise<Response> {
    try {
      const tournamentId = request.params?.tournamentId;
      if (!tournamentId || !request.user) {
        return this.errorResponse('Tournament ID and authentication required', 400);
      }

      const body = await request.json();
      const duration = body.duration || 5; // Default 5 minute break

      const manager = this.getTournamentManager(request.env);
      const result = await manager.pauseForBreak(tournamentId, duration);

      if (!result.success) {
        return this.errorResponse(result.error || 'Failed to pause tournament', 400);
      }

      return this.successResponse(result);
    } catch (error) {
      logger.error('Pause tournament error', { error });
      return this.errorResponse('Failed to pause tournament', 500);
    }
  }

  /**
   * POST /api/tournaments/:tournamentId/resume
   * Resume tournament from break
   */
  private async handleResumeTournament(request: AuthenticatedRequest): Promise<Response> {
    try {
      const tournamentId = request.params?.tournamentId;
      if (!tournamentId || !request.user) {
        return this.errorResponse('Tournament ID and authentication required', 400);
      }

      // Implementation would resume tournament
      return this.successResponse({
        resumed: true,
      });
    } catch (error) {
      logger.error('Resume tournament error', { error });
      return this.errorResponse('Failed to resume tournament', 500);
    }
  }

  /**
   * POST /api/tournaments/:tournamentId/cancel
   * Cancel a tournament
   */
  private async handleCancelTournament(request: AuthenticatedRequest): Promise<Response> {
    try {
      const tournamentId = request.params?.tournamentId;
      if (!tournamentId || !request.user) {
        return this.errorResponse('Tournament ID and authentication required', 400);
      }

      const body = await request.json();
      const reason = body.reason || 'Tournament cancelled by administrator';

      const manager = this.getTournamentManager(request.env);
      const result = await manager.cancelTournament(tournamentId, reason);

      if (!result.success) {
        return this.errorResponse(result.error || 'Failed to cancel tournament', 400);
      }

      logger.info('Tournament cancelled', { 
        tournamentId,
        cancelledBy: request.user.userId,
        reason,
      });

      return this.successResponse(result);
    } catch (error) {
      logger.error('Cancel tournament error', { error });
      return this.errorResponse('Failed to cancel tournament', 500);
    }
  }

  /**
   * GET /api/tournaments/:tournamentId/leaderboard
   * Get tournament leaderboard
   */
  private async handleGetLeaderboard(request: AuthenticatedRequest): Promise<Response> {
    try {
      const tournamentId = request.params?.tournamentId;
      if (!tournamentId) {
        return this.errorResponse('Tournament ID required', 400);
      }

      const url = new URL(request.url);
      const limit = parseInt(url.searchParams.get('limit') || '50');

      const manager = this.getTournamentManager(request.env);
      const leaderboard = await manager.getLeaderboard(tournamentId, limit);

      return this.successResponse({
        tournamentId,
        leaderboard,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Get leaderboard error', { error });
      return this.errorResponse('Failed to fetch leaderboard', 500);
    }
  }

  /**
   * GET /api/tournaments/:tournamentId/structure
   * Get tournament structure (blinds, payouts)
   */
  private async handleGetStructure(request: AuthenticatedRequest): Promise<Response> {
    try {
      const tournamentId = request.params?.tournamentId;
      if (!tournamentId) {
        return this.errorResponse('Tournament ID required', 400);
      }

      const manager = this.getTournamentManager(request.env);
      
      // Get tournament details
      const tournament = await manager.getTournamentStatus(tournamentId);
      if (!tournament) {
        return this.errorResponse('Tournament not found', 404);
      }

      // Generate structure
      const structure = manager.generateTournamentStructure({
        type: tournament.type || TournamentType.FREEZEOUT,
        startingChips: tournament.config?.startingChips || 10000,
        blindLevelDuration: tournament.config?.blindLevelDuration || 15,
      });

      // Calculate payouts
      const payouts = manager.calculatePayouts(
        tournament.registeredPlayers || 0,
        tournament.config?.buyIn || 100,
        {
          type: 'percentage',
          places: Math.min(15, Math.floor((tournament.registeredPlayers || 0) / 10)),
          distribution: [
            { place: 1, percentage: 30 },
            { place: 2, percentage: 20 },
            { place: 3, percentage: 12.5 },
            { places: [4, 15], percentage: 37.5 / 12 },
          ],
        }
      );

      return this.successResponse({
        tournamentId,
        blindStructure: structure,
        payoutStructure: payouts,
      });
    } catch (error) {
      logger.error('Get structure error', { error });
      return this.errorResponse('Failed to fetch tournament structure', 500);
    }
  }

  /**
   * POST /api/tournaments/:tournamentId/rebuy
   * Process rebuy
   */
  private async handleRebuy(request: AuthenticatedRequest): Promise<Response> {
    try {
      const tournamentId = request.params?.tournamentId;
      if (!tournamentId || !request.user) {
        return this.errorResponse('Tournament ID and authentication required', 400);
      }

      // Implementation would process rebuy
      return this.successResponse({
        rebuy: true,
        newChipCount: 10000,
        totalRebuys: 1,
      });
    } catch (error) {
      logger.error('Rebuy error', { error });
      return this.errorResponse('Failed to process rebuy', 500);
    }
  }

  /**
   * POST /api/tournaments/:tournamentId/addon
   * Process add-on
   */
  private async handleAddOn(request: AuthenticatedRequest): Promise<Response> {
    try {
      const tournamentId = request.params?.tournamentId;
      if (!tournamentId || !request.user) {
        return this.errorResponse('Tournament ID and authentication required', 400);
      }

      // Implementation would process add-on
      return this.successResponse({
        addOn: true,
        newChipCount: 15000,
        addOnChips: 5000,
      });
    } catch (error) {
      logger.error('Add-on error', { error });
      return this.errorResponse('Failed to process add-on', 500);
    }
  }

  /**
   * POST /api/tournaments/:tournamentId/announce
   * Broadcast announcement to all tables
   */
  private async handleBroadcastAnnouncement(request: AuthenticatedRequest): Promise<Response> {
    try {
      const tournamentId = request.params?.tournamentId;
      if (!tournamentId || !request.user) {
        return this.errorResponse('Tournament ID and authentication required', 400);
      }

      const body = await request.json();
      if (!body.message) {
        return this.errorResponse('Message required', 400);
      }

      const manager = this.getTournamentManager(request.env);
      const result = await manager.broadcastAnnouncement(tournamentId, body.message);

      if (!result.success) {
        return this.errorResponse(result.error || 'Failed to broadcast announcement', 400);
      }

      return this.successResponse(result);
    } catch (error) {
      logger.error('Broadcast announcement error', { error });
      return this.errorResponse('Failed to broadcast announcement', 500);
    }
  }

  /**
   * GET /api/tournaments/:tournamentId/statistics
   * Get tournament statistics
   */
  private async handleGetStatistics(request: AuthenticatedRequest): Promise<Response> {
    try {
      const tournamentId = request.params?.tournamentId;
      if (!tournamentId) {
        return this.errorResponse('Tournament ID required', 400);
      }

      const manager = this.getTournamentManager(request.env);
      const statistics = await manager.getTournamentStatistics(tournamentId);

      return this.successResponse({
        tournamentId,
        statistics,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Get statistics error', { error });
      return this.errorResponse('Failed to fetch statistics', 500);
    }
  }

  getRouter(): Router<any> {
    return this.router;
  }

  private successResponse<T>(data: T): Response {
    const response: ApiResponse<T> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  private errorResponse(message: string, status: number = 500): Response {
    const response: ApiResponse = {
      success: false,
      error: {
        code: status.toString(),
        message,
      },
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      status,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

// Export singleton instance
export const tournamentRoutes = new TournamentRoutes();