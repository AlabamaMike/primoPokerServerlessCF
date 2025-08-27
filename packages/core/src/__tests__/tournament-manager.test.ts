import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TournamentManager } from '../tournament-manager';
import { Tournament, TournamentState, TournamentType } from '@primo-poker/shared';
import { TournamentCoordinator } from '@primo-poker/persistence';

// Mock the fetch API
global.fetch = jest.fn();

describe('TournamentManager', () => {
  let manager: TournamentManager;
  let mockEnv: any;
  let mockCoordinatorStub: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock coordinator stub
    mockCoordinatorStub = {
      fetch: jest.fn(),
    };

    // Mock environment
    mockEnv = {
      TOURNAMENT_COORDINATOR: {
        get: jest.fn().mockReturnValue(mockCoordinatorStub),
        idFromName: jest.fn(name => `id-${name}`),
      },
      GAME_TABLE: {
        get: jest.fn(),
        idFromName: jest.fn(name => `table-id-${name}`),
      },
    };

    manager = new TournamentManager(mockEnv);
  });

  describe('Tournament Creation', () => {
    it('should create a new tournament', async () => {
      const tournamentConfig = {
        name: 'Sunday Million',
        type: TournamentType.FREEZEOUT,
        buyIn: 100,
        rake: 10,
        startingChips: 10000,
        blindLevelDuration: 15,
        maxPlayers: 1000,
        minPlayers: 100,
        scheduledStart: new Date('2025-08-28T19:00:00Z'),
      };

      mockCoordinatorStub.fetch.mockResolvedValue(
        new Response(JSON.stringify({
          tournamentId: 'tournament-1',
          state: TournamentState.REGISTERING,
          tables: [],
        }))
      );

      const result = await manager.createTournament(tournamentConfig);

      expect(result.success).toBe(true);
      expect(result.tournamentId).toBe('tournament-1');
      expect(mockEnv.TOURNAMENT_COORDINATOR.get).toHaveBeenCalled();
      expect(mockCoordinatorStub.fetch).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('CREATE_TOURNAMENT'),
        })
      );
    });

    it('should validate tournament configuration', async () => {
      const invalidConfig = {
        name: 'Invalid Tournament',
        type: TournamentType.REBUY,
        buyIn: -100, // Invalid negative buy-in
        rake: 10,
        startingChips: 10000,
        blindLevelDuration: 15,
        maxPlayers: 50,
        minPlayers: 100, // Min > Max
      };

      const result = await manager.createTournament(invalidConfig as any);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(mockCoordinatorStub.fetch).not.toHaveBeenCalled();
    });

    it('should create tournament structure with blind levels', async () => {
      const structure = manager.generateTournamentStructure({
        type: TournamentType.TURBO,
        startingChips: 10000,
        blindLevelDuration: 5,
      });

      expect(structure.blindLevels).toBeDefined();
      expect(structure.blindLevels.length).toBeGreaterThan(10);
      expect(structure.blindLevels[0]).toMatchObject({
        level: 1,
        duration: 5,
        ante: 0,
      });
      
      // Check blind progression
      for (let i = 1; i < structure.blindLevels.length; i++) {
        expect(structure.blindLevels[i].smallBlind).toBeGreaterThan(
          structure.blindLevels[i - 1].smallBlind
        );
      }
    });
  });

  describe('Player Registration', () => {
    it('should register a player to tournament', async () => {
      mockCoordinatorStub.fetch.mockResolvedValue(
        new Response(JSON.stringify({
          registered: true,
          playerId: 'player-1',
          tableId: 'table-1',
          seatNumber: 5,
        }))
      );

      const result = await manager.registerPlayer('tournament-1', {
        playerId: 'player-1',
        name: 'John Doe',
        buyIn: 110,
      });

      expect(result.success).toBe(true);
      expect(result.tableId).toBe('table-1');
      expect(result.seatNumber).toBe(5);
    });

    it('should handle late registration', async () => {
      // First mock the tournament status
      mockCoordinatorStub.fetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({
            state: TournamentState.IN_PROGRESS,
            currentLevel: 3,
            config: { lateRegistrationLevels: 5 },
          }))
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({
            registered: true,
            playerId: 'player-late',
            tableId: 'table-2',
          }))
        );

      const result = await manager.registerPlayer('tournament-1', {
        playerId: 'player-late',
        name: 'Late Player',
        buyIn: 110,
      });

      expect(result.success).toBe(true);
    });

    it('should reject registration after late registration period', async () => {
      mockCoordinatorStub.fetch.mockResolvedValue(
        new Response(JSON.stringify({
          state: TournamentState.IN_PROGRESS,
          currentLevel: 6,
          config: { lateRegistrationLevels: 5 },
        }))
      );

      const result = await manager.registerPlayer('tournament-1', {
        playerId: 'player-too-late',
        name: 'Too Late',
        buyIn: 110,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Registration closed');
    });
  });

  describe('Tournament Lifecycle', () => {
    it('should start a tournament', async () => {
      mockCoordinatorStub.fetch.mockResolvedValue(
        new Response(JSON.stringify({
          started: true,
          tables: 10,
          players: 87,
        }))
      );

      const result = await manager.startTournament('tournament-1');

      expect(result.success).toBe(true);
      expect(result.tables).toBe(10);
      expect(result.players).toBe(87);
    });

    it('should pause tournament for break', async () => {
      mockCoordinatorStub.fetch.mockResolvedValue(
        new Response(JSON.stringify({
          onBreak: true,
          resumeTime: Date.now() + 300000,
          tables: [{ tableId: 'table-1', paused: true }],
        }))
      );

      const result = await manager.pauseForBreak('tournament-1', 5);

      expect(result.success).toBe(true);
      expect(result.resumeTime).toBeDefined();
    });

    it('should handle tournament cancellation', async () => {
      mockCoordinatorStub.fetch.mockResolvedValue(
        new Response(JSON.stringify({
          cancelled: true,
          refunds: [
            { playerId: 'player-1', amount: 110 },
            { playerId: 'player-2', amount: 110 },
          ],
        }))
      );

      const result = await manager.cancelTournament('tournament-1', 'Not enough players');

      expect(result.success).toBe(true);
      expect(result.refunds).toHaveLength(2);
    });
  });

  describe('Tournament Progress', () => {
    it('should get tournament status', async () => {
      mockCoordinatorStub.fetch.mockResolvedValue(
        new Response(JSON.stringify({
          tournamentId: 'tournament-1',
          state: TournamentState.IN_PROGRESS,
          currentLevel: 5,
          playersRemaining: 234,
          activeTables: 26,
          totalChips: 870000,
        }))
      );

      const status = await manager.getTournamentStatus('tournament-1');

      expect(status).toBeDefined();
      expect(status.state).toBe(TournamentState.IN_PROGRESS);
      expect(status.playersRemaining).toBe(234);
    });

    it('should get tournament leaderboard', async () => {
      mockCoordinatorStub.fetch.mockResolvedValue(
        new Response(JSON.stringify([
          { playerId: 'player-1', name: 'Chip Leader', chipCount: 125000 },
          { playerId: 'player-2', name: 'Second Place', chipCount: 98000 },
          { playerId: 'player-3', name: 'Third Place', chipCount: 87000 },
        ]))
      );

      const leaderboard = await manager.getLeaderboard('tournament-1', 10);

      expect(leaderboard).toHaveLength(3);
      expect(leaderboard[0].chipCount).toBe(125000);
      expect(leaderboard[1].chipCount).toBe(98000);
    });

    it('should calculate payouts', async () => {
      const payouts = manager.calculatePayouts(100, 1000, {
        type: 'percentage',
        places: 15,
        distribution: [
          { place: 1, percentage: 30 },
          { place: 2, percentage: 20 },
          { place: 3, percentage: 12.5 },
          { place: 4, percentage: 8 },
          { place: 5, percentage: 6 },
          { place: 6, percentage: 4.5 },
          { place: 7, percentage: 3.5 },
          { place: 8, percentage: 2.5 },
          { place: 9, percentage: 2 },
          { places: [10, 15], percentage: 1.83 },
        ],
      });

      expect(payouts.total).toBe(100000); // 100 * 1000
      expect(payouts.places).toHaveLength(15);
      expect(payouts.places[0].amount).toBe(30000); // 30%
      expect(payouts.places[1].amount).toBe(20000); // 20%
      expect(payouts.places[14].amount).toBe(1830); // 1.83%
    });
  });

  describe('Multi-Table Operations', () => {
    it('should handle player elimination', async () => {
      mockCoordinatorStub.fetch.mockResolvedValue(
        new Response(JSON.stringify({
          eliminated: true,
          position: 42,
          payout: 250,
          rebalanced: true,
          movedPlayers: [
            { playerId: 'player-x', from: 'table-3', to: 'table-2' },
          ],
        }))
      );

      const result = await manager.eliminatePlayer('tournament-1', 'player-1', 'table-1');

      expect(result.success).toBe(true);
      expect(result.position).toBe(42);
      expect(result.payout).toBe(250);
      expect(result.rebalanced).toBe(true);
    });

    it('should broadcast tournament announcements', async () => {
      mockCoordinatorStub.fetch.mockResolvedValue(
        new Response(JSON.stringify({
          tablesNotified: 15,
        }))
      );

      const result = await manager.broadcastAnnouncement(
        'tournament-1',
        'Final table will begin in 5 minutes'
      );

      expect(result.success).toBe(true);
      expect(result.tablesNotified).toBe(15);
    });

    it('should handle final table transition', async () => {
      // Mock the sequence of calls for final table
      mockCoordinatorStub.fetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({
            playersRemaining: 9,
            activeTables: 2,
          }))
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({
            eliminated: true,
            finalTable: true,
            consolidatedToTable: 'final-table',
          }))
        );

      // Trigger by eliminating a player when 10 remain
      const result = await manager.eliminatePlayer('tournament-1', 'player-10th', 'table-5');

      expect(result.finalTable).toBe(true);
      expect(result.consolidatedTable).toBe('final-table');
    });
  });

  describe('Error Handling', () => {
    it('should handle coordinator connection failures', async () => {
      mockCoordinatorStub.fetch.mockRejectedValue(new Error('Connection failed'));

      const result = await manager.getTournamentStatus('tournament-1');

      expect(result).toBeNull();
    });

    it('should handle invalid tournament IDs', async () => {
      mockCoordinatorStub.fetch.mockResolvedValue(
        new Response('Tournament not found', { status: 404 })
      );

      const result = await manager.getTournamentStatus('invalid-id');

      expect(result).toBeNull();
    });

    it('should retry failed operations', async () => {
      let attempts = 0;
      mockCoordinatorStub.fetch.mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return new Response(JSON.stringify({ success: true }));
      });

      const result = await manager.startTournament('tournament-1');

      expect(result.success).toBe(true);
      expect(attempts).toBe(3);
    });
  });

  describe('Tournament Analytics', () => {
    it('should track tournament statistics', async () => {
      const stats = await manager.getTournamentStatistics('tournament-1');

      // Mock implementation would return these
      expect(stats).toMatchObject({
        totalHands: expect.any(Number),
        averageHandDuration: expect.any(Number),
        biggestPot: expect.any(Number),
        totalRebuys: expect.any(Number),
        bustOutRate: expect.any(Number),
      });
    });

    it('should generate tournament report', async () => {
      mockCoordinatorStub.fetch.mockResolvedValue(
        new Response(JSON.stringify({
          winner: { playerId: 'player-1', name: 'Champion' },
          finalTable: [
            { playerId: 'player-1', position: 1, payout: 30000 },
            { playerId: 'player-2', position: 2, payout: 20000 },
          ],
          duration: 21600000, // 6 hours
          totalHands: 4532,
        }))
      );

      const report = await manager.generateTournamentReport('tournament-1');

      expect(report.winner).toBeDefined();
      expect(report.duration).toBe('6 hours');
      expect(report.totalHands).toBe(4532);
    });
  });
});