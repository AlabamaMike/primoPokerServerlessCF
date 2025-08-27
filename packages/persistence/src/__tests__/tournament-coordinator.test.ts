import { describe, it, expect, beforeEach } from '@jest/globals';
import { TournamentCoordinator } from '../durable-objects/tournament-coordinator';
import { GameState, GamePhase, Tournament, TournamentState } from '@primo-poker/shared';
import { Env } from '../types/environment';

describe('TournamentCoordinator', () => {
  let coordinator: TournamentCoordinator;
  let mockEnv: Env;
  let mockState: DurableObjectState;

  beforeEach(() => {
    mockState = {
      storage: new Map(),
      waitUntil: jest.fn(),
      blockConcurrencyWhile: jest.fn(),
    } as any;

    mockEnv = {} as Env;
    coordinator = new TournamentCoordinator(mockState, mockEnv);
  });

  describe('Tournament Creation', () => {
    it('should create a tournament with multiple tables', async () => {
      const request = new Request('http://localhost/tournament', {
        method: 'POST',
        body: JSON.stringify({
          action: 'CREATE_TOURNAMENT',
          tournamentId: 'tournament-1',
          config: {
            name: 'Main Event',
            maxPlayersPerTable: 9,
            startingChips: 10000,
            blindLevelDuration: 15, // minutes
            minPlayers: 18,
            maxPlayers: 100,
          },
        }),
      });

      const response = await coordinator.fetch(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.tournamentId).toBe('tournament-1');
      expect(result.tables).toBeDefined();
      expect(result.tables.length).toBeGreaterThan(0);
    });

    it('should distribute players across tables evenly', async () => {
      // Create tournament
      const createReq = new Request('http://localhost/tournament', {
        method: 'POST',
        body: JSON.stringify({
          action: 'CREATE_TOURNAMENT',
          tournamentId: 'tournament-2',
          config: {
            name: 'Test Tournament',
            maxPlayersPerTable: 9,
            startingChips: 10000,
            blindLevelDuration: 15,
            minPlayers: 27,
            maxPlayers: 100,
          },
        }),
      });
      await coordinator.fetch(createReq);

      // Register 27 players
      const players = Array.from({ length: 27 }, (_, i) => ({
        playerId: `player-${i}`,
        name: `Player ${i}`,
      }));

      for (const player of players) {
        const registerReq = new Request('http://localhost/tournament', {
          method: 'POST',
          body: JSON.stringify({
            action: 'REGISTER_PLAYER',
            tournamentId: 'tournament-2',
            player,
          }),
        });
        await coordinator.fetch(registerReq);
      }

      // Check distribution
      const statusReq = new Request('http://localhost/tournament/tournament-2/status');
      const response = await coordinator.fetch(statusReq);
      const status = await response.json();

      expect(status.tables.length).toBe(3); // 27 players / 9 per table = 3 tables
      status.tables.forEach((table: any) => {
        expect(table.playerCount).toBe(9);
      });
    });
  });

  describe('Table Balancing', () => {
    it('should balance tables when a player is eliminated', async () => {
      // Setup tournament with 18 players on 2 tables
      await setupTournament(coordinator, 'tournament-3', 18);

      // Eliminate a player from table 1
      const eliminateReq = new Request('http://localhost/tournament', {
        method: 'POST',
        body: JSON.stringify({
          action: 'PLAYER_ELIMINATED',
          tournamentId: 'tournament-3',
          tableId: 'table-1',
          playerId: 'player-0',
          position: 18,
        }),
      });
      const response = await coordinator.fetch(eliminateReq);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.rebalanced).toBe(true);
      expect(result.movedPlayers.length).toBeGreaterThan(0);
    });

    it('should consolidate tables when enough players are eliminated', async () => {
      // Setup tournament with 20 players on 3 tables (7, 7, 6 players)
      await setupTournament(coordinator, 'tournament-4', 20);

      // Eliminate 10 players to trigger consolidation
      for (let i = 0; i < 10; i++) {
        const eliminateReq = new Request('http://localhost/tournament', {
          method: 'POST',
          body: JSON.stringify({
            action: 'PLAYER_ELIMINATED',
            tournamentId: 'tournament-4',
            tableId: `table-${Math.floor(i / 4) + 1}`,
            playerId: `player-${i}`,
            position: 20 - i,
          }),
        });
        await coordinator.fetch(eliminateReq);
      }

      // Check that tables were consolidated
      const statusReq = new Request('http://localhost/tournament/tournament-4/status');
      const response = await coordinator.fetch(statusReq);
      const status = await response.json();

      expect(status.activeTables).toBe(2); // Should consolidate to 2 tables
      expect(status.eliminatedTables.length).toBe(1);
    });

    it('should handle final table transition', async () => {
      // Setup tournament with 10 players
      await setupTournament(coordinator, 'tournament-5', 10);

      // Eliminate 1 player to trigger final table
      const eliminateReq = new Request('http://localhost/tournament', {
        method: 'POST',
        body: JSON.stringify({
          action: 'PLAYER_ELIMINATED',
          tournamentId: 'tournament-5',
          tableId: 'table-1',
          playerId: 'player-0',
          position: 10,
        }),
      });
      const response = await coordinator.fetch(eliminateReq);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.finalTable).toBe(true);
      expect(result.consolidatedToTable).toBeDefined();
    });
  });

  describe('Tournament Progression', () => {
    it('should advance blind levels on schedule', async () => {
      // Create tournament with 1-minute blind levels for testing
      const createReq = new Request('http://localhost/tournament', {
        method: 'POST',
        body: JSON.stringify({
          action: 'CREATE_TOURNAMENT',
          tournamentId: 'tournament-6',
          config: {
            name: 'Turbo Tournament',
            maxPlayersPerTable: 9,
            startingChips: 10000,
            blindLevelDuration: 0.1, // 6 seconds for testing
            minPlayers: 9,
            maxPlayers: 100,
          },
        }),
      });
      await coordinator.fetch(createReq);

      // Start tournament
      await setupTournament(coordinator, 'tournament-6', 9);
      const startReq = new Request('http://localhost/tournament', {
        method: 'POST',
        body: JSON.stringify({
          action: 'START_TOURNAMENT',
          tournamentId: 'tournament-6',
        }),
      });
      await coordinator.fetch(startReq);

      // Check initial level
      let statusReq = new Request('http://localhost/tournament/tournament-6/status');
      let response = await coordinator.fetch(statusReq);
      let status = await response.json();
      expect(status.currentLevel).toBe(1);

      // Wait for level to advance
      await new Promise(resolve => setTimeout(resolve, 7000));

      // Check level advanced
      statusReq = new Request('http://localhost/tournament/tournament-6/status');
      response = await coordinator.fetch(statusReq);
      status = await response.json();
      expect(status.currentLevel).toBe(2);
    });

    it('should pause all tables during break periods', async () => {
      await setupTournament(coordinator, 'tournament-7', 27);

      const breakReq = new Request('http://localhost/tournament', {
        method: 'POST',
        body: JSON.stringify({
          action: 'TOURNAMENT_BREAK',
          tournamentId: 'tournament-7',
          duration: 5, // 5 minute break
        }),
      });
      const response = await coordinator.fetch(breakReq);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.onBreak).toBe(true);
      expect(result.resumeTime).toBeDefined();
      result.tables.forEach((table: any) => {
        expect(table.paused).toBe(true);
      });
    });
  });

  describe('Cross-Table Communication', () => {
    it('should broadcast tournament-wide messages', async () => {
      await setupTournament(coordinator, 'tournament-8', 18);

      const broadcastReq = new Request('http://localhost/tournament', {
        method: 'POST',
        body: JSON.stringify({
          action: 'BROADCAST_MESSAGE',
          tournamentId: 'tournament-8',
          message: {
            type: 'ANNOUNCEMENT',
            content: 'Final table will begin in 5 minutes',
          },
        }),
      });
      const response = await coordinator.fetch(broadcastReq);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.tablesNotified).toBe(2); // 18 players = 2 tables
    });

    it('should synchronize chip leader updates across tables', async () => {
      await setupTournament(coordinator, 'tournament-9', 18);

      // Update chip count for a player
      const updateReq = new Request('http://localhost/tournament', {
        method: 'POST',
        body: JSON.stringify({
          action: 'UPDATE_CHIP_COUNT',
          tournamentId: 'tournament-9',
          playerId: 'player-5',
          chipCount: 25000,
          tableId: 'table-1',
        }),
      });
      await coordinator.fetch(updateReq);

      // Get tournament leaderboard
      const leaderboardReq = new Request('http://localhost/tournament/tournament-9/leaderboard');
      const response = await coordinator.fetch(leaderboardReq);
      const leaderboard = await response.json();

      expect(leaderboard[0].playerId).toBe('player-5');
      expect(leaderboard[0].chipCount).toBe(25000);
    });
  });

  describe('Error Recovery', () => {
    it('should handle table failures gracefully', async () => {
      await setupTournament(coordinator, 'tournament-10', 18);

      const tableFailReq = new Request('http://localhost/tournament', {
        method: 'POST',
        body: JSON.stringify({
          action: 'TABLE_FAILURE',
          tournamentId: 'tournament-10',
          tableId: 'table-1',
          reason: 'Network partition',
        }),
      });
      const response = await coordinator.fetch(tableFailReq);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.recovered).toBe(true);
      expect(result.playersRelocated).toBe(9);
      expect(result.newTableAssignments).toBeDefined();
    });

    it('should maintain tournament state consistency', async () => {
      await setupTournament(coordinator, 'tournament-11', 27);

      // Simulate concurrent updates
      const updates = Array.from({ length: 5 }, (_, i) => 
        coordinator.fetch(new Request('http://localhost/tournament', {
          method: 'POST',
          body: JSON.stringify({
            action: 'UPDATE_CHIP_COUNT',
            tournamentId: 'tournament-11',
            playerId: `player-${i}`,
            chipCount: 10000 + i * 1000,
            tableId: `table-${Math.floor(i / 9) + 1}`,
          }),
        }))
      );

      await Promise.all(updates);

      // Verify state consistency
      const statusReq = new Request('http://localhost/tournament/tournament-11/status');
      const response = await coordinator.fetch(statusReq);
      const status = await response.json();

      expect(status.totalChips).toBe(27 * 10000); // Chips should be conserved
      expect(status.playersRemaining).toBe(27);
    });
  });
});

// Helper function to setup a tournament with players
async function setupTournament(
  coordinator: TournamentCoordinator,
  tournamentId: string,
  playerCount: number
): Promise<void> {
  // Create tournament
  const createReq = new Request('http://localhost/tournament', {
    method: 'POST',
    body: JSON.stringify({
      action: 'CREATE_TOURNAMENT',
      tournamentId,
      config: {
        name: `Test Tournament ${tournamentId}`,
        maxPlayersPerTable: 9,
        startingChips: 10000,
        blindLevelDuration: 15,
        minPlayers: playerCount,
        maxPlayers: 100,
      },
    }),
  });
  await coordinator.fetch(createReq);

  // Register players
  const players = Array.from({ length: playerCount }, (_, i) => ({
    playerId: `player-${i}`,
    name: `Player ${i}`,
  }));

  for (const player of players) {
    const registerReq = new Request('http://localhost/tournament', {
      method: 'POST',
      body: JSON.stringify({
        action: 'REGISTER_PLAYER',
        tournamentId,
        player,
      }),
    });
    await coordinator.fetch(registerReq);
  }
}