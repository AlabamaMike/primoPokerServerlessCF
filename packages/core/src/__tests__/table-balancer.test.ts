import { describe, it, expect, beforeEach } from '@jest/globals';
import { TableBalancer, BalancingStrategy, TableState, PlayerMove } from '../table-balancer';

describe('TableBalancer', () => {
  let balancer: TableBalancer;

  beforeEach(() => {
    balancer = new TableBalancer();
  });

  describe('Basic Balancing', () => {
    it('should balance tables with uneven player counts', () => {
      const tables: TableState[] = [
        {
          tableId: 'table-1',
          playerCount: 9,
          maxSeats: 9,
          players: Array.from({ length: 9 }, (_, i) => ({
            playerId: `t1-p${i}`,
            seatNumber: i + 1,
            chipCount: 10000,
          })),
        },
        {
          tableId: 'table-2',
          playerCount: 5,
          maxSeats: 9,
          players: Array.from({ length: 5 }, (_, i) => ({
            playerId: `t2-p${i}`,
            seatNumber: i + 1,
            chipCount: 10000,
          })),
        },
      ];

      const moves = balancer.calculateMoves(tables, BalancingStrategy.MINIMIZE_MOVES);
      
      expect(moves.length).toBeGreaterThan(0);
      expect(moves[0].fromTable).toBe('table-1');
      expect(moves[0].toTable).toBe('table-2');
      
      // After moves, tables should have 7 and 7 players
      const finalCounts = applyMoves(tables, moves);
      expect(finalCounts['table-1']).toBe(7);
      expect(finalCounts['table-2']).toBe(7);
    });

    it('should not balance tables that are already balanced', () => {
      const tables: TableState[] = [
        {
          tableId: 'table-1',
          playerCount: 7,
          maxSeats: 9,
          players: Array.from({ length: 7 }, (_, i) => ({
            playerId: `t1-p${i}`,
            seatNumber: i + 1,
            chipCount: 10000,
          })),
        },
        {
          tableId: 'table-2',
          playerCount: 7,
          maxSeats: 9,
          players: Array.from({ length: 7 }, (_, i) => ({
            playerId: `t2-p${i}`,
            seatNumber: i + 1,
            chipCount: 10000,
          })),
        },
      ];

      const moves = balancer.calculateMoves(tables, BalancingStrategy.MINIMIZE_MOVES);
      expect(moves.length).toBe(0);
    });

    it('should handle tables with different max seats', () => {
      const tables: TableState[] = [
        {
          tableId: 'table-1',
          playerCount: 6,
          maxSeats: 6, // 6-max table
          players: Array.from({ length: 6 }, (_, i) => ({
            playerId: `t1-p${i}`,
            seatNumber: i + 1,
            chipCount: 10000,
          })),
        },
        {
          tableId: 'table-2',
          playerCount: 4,
          maxSeats: 9, // 9-max table
          players: Array.from({ length: 4 }, (_, i) => ({
            playerId: `t2-p${i}`,
            seatNumber: i + 1,
            chipCount: 10000,
          })),
        },
      ];

      const moves = balancer.calculateMoves(tables, BalancingStrategy.MINIMIZE_MOVES);
      
      // Should move 1 player from table-1 to table-2
      expect(moves.length).toBe(1);
      expect(moves[0].fromTable).toBe('table-1');
      expect(moves[0].toTable).toBe('table-2');
    });
  });

  describe('Table Consolidation', () => {
    it('should consolidate tables when possible', () => {
      const tables: TableState[] = [
        {
          tableId: 'table-1',
          playerCount: 5,
          maxSeats: 9,
          players: Array.from({ length: 5 }, (_, i) => ({
            playerId: `t1-p${i}`,
            seatNumber: i + 1,
            chipCount: 10000,
          })),
        },
        {
          tableId: 'table-2',
          playerCount: 4,
          maxSeats: 9,
          players: Array.from({ length: 4 }, (_, i) => ({
            playerId: `t2-p${i}`,
            seatNumber: i + 1,
            chipCount: 10000,
          })),
        },
        {
          tableId: 'table-3',
          playerCount: 3,
          maxSeats: 9,
          players: Array.from({ length: 3 }, (_, i) => ({
            playerId: `t3-p${i}`,
            seatNumber: i + 1,
            chipCount: 10000,
          })),
        },
      ];

      const consolidation = balancer.consolidateTables(tables);
      
      expect(consolidation.tablesToClose.length).toBe(1);
      expect(consolidation.moves.length).toBeGreaterThan(0);
      
      // Should result in 2 tables with 6 players each
      const remainingTables = tables.filter(t => !consolidation.tablesToClose.includes(t.tableId));
      expect(remainingTables.length).toBe(2);
    });

    it('should prioritize keeping feature tables open', () => {
      const tables: TableState[] = [
        {
          tableId: 'table-1',
          playerCount: 3,
          maxSeats: 9,
          isFeatureTable: true,
          players: Array.from({ length: 3 }, (_, i) => ({
            playerId: `t1-p${i}`,
            seatNumber: i + 1,
            chipCount: 10000,
          })),
        },
        {
          tableId: 'table-2',
          playerCount: 4,
          maxSeats: 9,
          players: Array.from({ length: 4 }, (_, i) => ({
            playerId: `t2-p${i}`,
            seatNumber: i + 1,
            chipCount: 10000,
          })),
        },
      ];

      const consolidation = balancer.consolidateTables(tables);
      
      // Should close table-2 and move players to feature table
      expect(consolidation.tablesToClose).toContain('table-2');
      expect(consolidation.tablesToClose).not.toContain('table-1');
    });
  });

  describe('Final Table Detection', () => {
    it('should detect when final table is reached', () => {
      const tables: TableState[] = [
        {
          tableId: 'table-1',
          playerCount: 5,
          maxSeats: 9,
          players: Array.from({ length: 5 }, (_, i) => ({
            playerId: `t1-p${i}`,
            seatNumber: i + 1,
            chipCount: 10000 + i * 1000,
          })),
        },
        {
          tableId: 'table-2',
          playerCount: 4,
          maxSeats: 9,
          players: Array.from({ length: 4 }, (_, i) => ({
            playerId: `t2-p${i}`,
            seatNumber: i + 1,
            chipCount: 10000 + i * 1000,
          })),
        },
      ];

      const finalTableCheck = balancer.checkFinalTable(tables, 9);
      
      expect(finalTableCheck.isFinalTable).toBe(true);
      expect(finalTableCheck.totalPlayers).toBe(9);
      expect(finalTableCheck.consolidationNeeded).toBe(true);
    });

    it('should order final table by chip count', () => {
      const players = [
        { playerId: 'p1', chipCount: 15000 },
        { playerId: 'p2', chipCount: 25000 },
        { playerId: 'p3', chipCount: 10000 },
        { playerId: 'p4', chipCount: 30000 },
        { playerId: 'p5', chipCount: 20000 },
      ];

      const seating = balancer.arrangeFinalTableSeating(players);
      
      // Chip leader should be in a specific position
      expect(seating[0].playerId).toBe('p4'); // Chip leader
      expect(seating[0].seatNumber).toBeDefined();
      
      // All players should have seat assignments
      expect(seating.length).toBe(5);
      seating.forEach(seat => {
        expect(seat.seatNumber).toBeGreaterThan(0);
        expect(seat.seatNumber).toBeLessThanOrEqual(9);
      });
    });
  });

  describe('Advanced Strategies', () => {
    it('should minimize disruption during moves', () => {
      const tables: TableState[] = [
        {
          tableId: 'table-1',
          playerCount: 8,
          maxSeats: 9,
          avgPotSize: 5000,
          currentHandNumber: 150,
          players: Array.from({ length: 8 }, (_, i) => ({
            playerId: `t1-p${i}`,
            seatNumber: i + 1,
            chipCount: 10000,
            isInHand: i < 3, // First 3 players in hand
          })),
        },
        {
          tableId: 'table-2',
          playerCount: 4,
          maxSeats: 9,
          avgPotSize: 3000,
          currentHandNumber: 148,
          players: Array.from({ length: 4 }, (_, i) => ({
            playerId: `t2-p${i}`,
            seatNumber: i + 1,
            chipCount: 10000,
            isInHand: false,
          })),
        },
      ];

      const moves = balancer.calculateMoves(tables, BalancingStrategy.MINIMIZE_DISRUPTION);
      
      // Should prefer moving players not in hands
      moves.forEach(move => {
        const player = tables
          .find(t => t.tableId === move.fromTable)
          ?.players.find(p => p.playerId === move.playerId);
        expect(player?.isInHand).toBe(false);
      });
    });

    it('should maintain position fairness when moving players', () => {
      const tables: TableState[] = [
        {
          tableId: 'table-1',
          playerCount: 8,
          maxSeats: 9,
          buttonPosition: 3,
          players: Array.from({ length: 8 }, (_, i) => ({
            playerId: `t1-p${i}`,
            seatNumber: i + 1,
            chipCount: 10000,
            handsPlayed: 50 + i,
          })),
        },
        {
          tableId: 'table-2',
          playerCount: 4,
          maxSeats: 9,
          buttonPosition: 2,
          players: Array.from({ length: 4 }, (_, i) => ({
            playerId: `t2-p${i}`,
            seatNumber: i + 1,
            chipCount: 10000,
            handsPlayed: 48 + i,
          })),
        },
      ];

      const moves = balancer.calculateMoves(tables, BalancingStrategy.POSITION_FAIRNESS);
      
      // Should include position recommendations
      expect(moves[0].recommendedSeat).toBeDefined();
      expect(moves[0].positionMetadata).toBeDefined();
      expect(moves[0].positionMetadata?.maintainsBlinds).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should handle large tournaments efficiently', () => {
      // Create 100 tables with varying player counts
      const tables: TableState[] = Array.from({ length: 100 }, (_, i) => ({
        tableId: `table-${i + 1}`,
        playerCount: 5 + Math.floor(Math.random() * 5), // 5-9 players
        maxSeats: 9,
        players: Array.from({ length: 5 + Math.floor(Math.random() * 5) }, (_, j) => ({
          playerId: `t${i + 1}-p${j}`,
          seatNumber: j + 1,
          chipCount: 10000 + Math.random() * 20000,
        })),
      }));

      const startTime = performance.now();
      const moves = balancer.calculateMoves(tables, BalancingStrategy.MINIMIZE_MOVES);
      const endTime = performance.now();

      // Should complete in under 100ms
      expect(endTime - startTime).toBeLessThan(100);
      
      // Should produce valid moves
      moves.forEach(move => {
        expect(move.fromTable).toBeDefined();
        expect(move.toTable).toBeDefined();
        expect(move.playerId).toBeDefined();
      });
    });

    it('should batch moves efficiently', () => {
      const tables: TableState[] = [
        {
          tableId: 'table-1',
          playerCount: 9,
          maxSeats: 9,
          players: Array.from({ length: 9 }, (_, i) => ({
            playerId: `t1-p${i}`,
            seatNumber: i + 1,
            chipCount: 10000,
          })),
        },
        {
          tableId: 'table-2',
          playerCount: 3,
          maxSeats: 9,
          players: Array.from({ length: 3 }, (_, i) => ({
            playerId: `t2-p${i}`,
            seatNumber: i + 1,
            chipCount: 10000,
          })),
        },
      ];

      const moves = balancer.calculateMoves(tables, BalancingStrategy.MINIMIZE_MOVES);
      const batches = balancer.batchMoves(moves);
      
      // Should create batches that can be executed in parallel
      expect(batches.length).toBeGreaterThan(0);
      
      // Moves in same batch should not conflict
      batches.forEach(batch => {
        const tables = new Set<string>();
        batch.forEach(move => {
          expect(tables.has(move.fromTable)).toBe(false);
          expect(tables.has(move.toTable)).toBe(false);
          tables.add(move.fromTable);
          tables.add(move.toTable);
        });
      });
    });
  });
});

// Helper function to apply moves and count players
function applyMoves(tables: TableState[], moves: PlayerMove[]): Record<string, number> {
  const counts: Record<string, number> = {};
  
  tables.forEach(table => {
    counts[table.tableId] = table.playerCount;
  });
  
  moves.forEach(move => {
    counts[move.fromTable]--;
    counts[move.toTable]++;
  });
  
  return counts;
}