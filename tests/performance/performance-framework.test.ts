import { PokerGame } from '@primo-poker/core';
import { Hand } from '@primo-poker/core';
import { BettingEngine } from '@primo-poker/core';
import { WebSocketManager } from '@primo-poker/api';
import { 
  TableConfig, 
  Player, 
  GameType, 
  BettingStructure, 
  GameFormat, 
  PlayerStatus,
  Card,
  Suit,
  Rank
} from '@primo-poker/shared';

interface PerformanceMetrics {
  operation: string;
  iterations: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  opsPerSecond: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];

  async measurePerformance(
    operation: string,
    iterations: number,
    testFn: () => Promise<void> | void
  ): Promise<PerformanceMetrics> {
    const times: number[] = [];
    
    // Warm up
    for (let i = 0; i < Math.min(10, iterations / 10); i++) {
      await testFn();
    }
    
    // Actual measurements
    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      await testFn();
      const end = process.hrtime.bigint();
      times.push(Number(end - start) / 1_000_000); // Convert to milliseconds
    }
    
    const totalTime = times.reduce((a, b) => a + b, 0);
    const metrics: PerformanceMetrics = {
      operation,
      iterations,
      totalTime,
      averageTime: totalTime / iterations,
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      opsPerSecond: (iterations / totalTime) * 1000
    };
    
    this.metrics.push(metrics);
    return metrics;
  }

  printReport(): void {
    console.log('\n=== Performance Test Report ===\n');
    
    const table = this.metrics.map(m => ({
      Operation: m.operation,
      'Iterations': m.iterations.toLocaleString(),
      'Avg Time (ms)': m.averageTime.toFixed(3),
      'Min Time (ms)': m.minTime.toFixed(3),
      'Max Time (ms)': m.maxTime.toFixed(3),
      'Ops/Sec': m.opsPerSecond.toFixed(0)
    }));
    
    console.table(table);
  }

  assertPerformance(operation: string, maxAvgTime: number): void {
    const metric = this.metrics.find(m => m.operation === operation);
    if (!metric) {
      throw new Error(`No metrics found for operation: ${operation}`);
    }
    
    if (metric.averageTime > maxAvgTime) {
      throw new Error(
        `Performance assertion failed for ${operation}: ` +
        `Average time ${metric.averageTime.toFixed(3)}ms exceeds threshold ${maxAvgTime}ms`
      );
    }
  }
}

describe('Performance Tests', () => {
  const monitor = new PerformanceMonitor();
  
  afterAll(() => {
    monitor.printReport();
  });

  describe('Hand Evaluation Performance', () => {
    const testHands: Card[][] = [];
    
    beforeAll(() => {
      // Generate test hands
      for (let i = 0; i < 1000; i++) {
        const hand: Card[] = [
          { suit: Suit.HEARTS, rank: (i % 13) as Rank },
          { suit: Suit.CLUBS, rank: ((i + 1) % 13) as Rank },
          { suit: Suit.DIAMONDS, rank: ((i + 2) % 13) as Rank },
          { suit: Suit.SPADES, rank: ((i + 3) % 13) as Rank },
          { suit: Suit.HEARTS, rank: ((i + 4) % 13) as Rank },
          { suit: Suit.CLUBS, rank: ((i + 5) % 13) as Rank },
          { suit: Suit.DIAMONDS, rank: ((i + 6) % 13) as Rank }
        ];
        testHands.push(hand);
      }
    });

    test('should evaluate hands quickly', async () => {
      const metrics = await monitor.measurePerformance(
        'Hand Evaluation',
        10000,
        () => {
          const hand = testHands[Math.floor(Math.random() * testHands.length)]!;
          Hand.evaluate(hand);
        }
      );
      
      expect(metrics.averageTime).toBeLessThan(0.1); // Less than 0.1ms per evaluation
      expect(metrics.opsPerSecond).toBeGreaterThan(10000); // More than 10k hands/second
    });

    test('should compare hands efficiently', async () => {
      const metrics = await monitor.measurePerformance(
        'Hand Comparison',
        5000,
        () => {
          const hand1 = testHands[Math.floor(Math.random() * testHands.length)]!;
          const hand2 = testHands[Math.floor(Math.random() * testHands.length)]!;
          const eval1 = Hand.evaluate(hand1);
          const eval2 = Hand.evaluate(hand2);
          Hand.compareHands(eval1, eval2);
        }
      );
      
      expect(metrics.averageTime).toBeLessThan(0.2); // Less than 0.2ms per comparison
    });
  });

  describe('Game State Management Performance', () => {
    let tableConfig: TableConfig;
    let players: Player[];
    
    beforeAll(() => {
      tableConfig = {
        id: 'perf-test-table',
        name: 'Performance Test',
        gameType: GameType.TEXAS_HOLDEM,
        bettingStructure: BettingStructure.NO_LIMIT,
        gameFormat: GameFormat.CASH,
        maxPlayers: 9,
        minBuyIn: 100,
        maxBuyIn: 1000,
        smallBlind: 5,
        bigBlind: 10,
        ante: 0,
        timeBank: 30,
        isPrivate: false,
      };
      
      players = Array.from({ length: 9 }, (_, i) => ({
        id: `player-${i}`,
        username: `Player${i}`,
        email: `player${i}@example.com`,
        chipCount: 1000,
        status: PlayerStatus.ACTIVE,
        timeBank: 30,
        isDealer: false,
      }));
    });

    test('should handle game initialization quickly', async () => {
      const metrics = await monitor.measurePerformance(
        'Game Initialization',
        1000,
        () => {
          new PokerGame(tableConfig, players);
        }
      );
      
      expect(metrics.averageTime).toBeLessThan(1); // Less than 1ms per initialization
    });

    test('should process betting actions efficiently', async () => {
      const game = new PokerGame(tableConfig, players);
      await game.dealCards();
      
      const metrics = await monitor.measurePerformance(
        'Betting Action Processing',
        1000,
        async () => {
          const gameState = game.getGameState();
          if (gameState.activePlayerId) {
            await game.processBet(gameState.activePlayerId, 20);
          }
        }
      );
      
      expect(metrics.averageTime).toBeLessThan(0.5); // Less than 0.5ms per action
    });

    test('should complete full hands within time limits', async () => {
      const metrics = await monitor.measurePerformance(
        'Complete Hand Simulation',
        100,
        async () => {
          const game = new PokerGame(tableConfig, players.slice(0, 6));
          await game.dealCards();
          
          // Simulate a complete hand
          let gameState = game.getGameState();
          let actions = 0;
          
          while (gameState.phase !== 'FINISHED' && actions < 50) {
            if (gameState.activePlayerId) {
              await game.processBet(gameState.activePlayerId, gameState.currentBet);
              gameState = game.getGameState();
              actions++;
            }
          }
        }
      );
      
      expect(metrics.averageTime).toBeLessThan(20); // Less than 20ms per complete hand
    });
  });

  describe('Betting Engine Performance', () => {
    test('should handle rapid betting sequences', async () => {
      const bettingEngine = new BettingEngine(5, 10);
      const players = new Map();
      
      for (let i = 0; i < 9; i++) {
        players.set(`player-${i}`, {
          playerId: `player-${i}`,
          chips: 1000,
          currentBet: 0,
          totalBet: 0,
          isAllIn: false,
          status: PlayerStatus.ACTIVE,
          hasActed: false,
          seatPosition: i
        });
      }
      
      const metrics = await monitor.measurePerformance(
        'Betting Engine Actions',
        5000,
        () => {
          const playerId = `player-${Math.floor(Math.random() * 9)}`;
          const amount = Math.floor(Math.random() * 100) + 10;
          bettingEngine.processBet(playerId, amount);
        }
      );
      
      expect(metrics.averageTime).toBeLessThan(0.1); // Less than 0.1ms per bet
      expect(metrics.opsPerSecond).toBeGreaterThan(10000); // More than 10k bets/second
    });

    test('should calculate side pots efficiently', async () => {
      const bettingEngine = new BettingEngine(5, 10);
      const players = new Map();
      
      // Create players with varying chip stacks
      for (let i = 0; i < 9; i++) {
        players.set(`player-${i}`, {
          playerId: `player-${i}`,
          chips: (i + 1) * 100,
          currentBet: 0,
          totalBet: 0,
          isAllIn: false,
          status: PlayerStatus.ACTIVE,
          hasActed: false,
          seatPosition: i
        });
      }
      
      const metrics = await monitor.measurePerformance(
        'Side Pot Calculation',
        1000,
        () => {
          bettingEngine.calculateSidePots(players);
        }
      );
      
      expect(metrics.averageTime).toBeLessThan(0.5); // Less than 0.5ms per calculation
    });
  });

  describe('WebSocket Performance', () => {
    test('should handle message broadcasting efficiently', async () => {
      const wsManager = new WebSocketManager('test-secret');
      
      // Simulate multiple connections
      const mockConnections = Array.from({ length: 100 }, (_, i) => ({
        ws: {
          readyState: 1,
          send: jest.fn(),
          close: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn()
        },
        playerId: `player-${i}`,
        tableId: 'table-1',
        username: `Player${i}`,
        isAuthenticated: true,
        lastActivity: new Date()
      }));
      
      const metrics = await monitor.measurePerformance(
        'WebSocket Broadcast',
        1000,
        () => {
          const gameState = {
            tableId: 'table-1',
            gameId: 'game-1',
            phase: 'PRE_FLOP',
            pot: 100,
            sidePots: [],
            communityCards: [],
            currentBet: 20,
            minRaise: 20,
            activePlayerId: 'player-1',
            dealerId: 'player-0',
            smallBlindId: 'player-1',
            bigBlindId: 'player-2',
            handNumber: 1,
            timestamp: new Date()
          };
          
          // Simulate broadcast
          mockConnections.forEach(conn => {
            if (conn.ws.readyState === 1) {
              conn.ws.send(JSON.stringify({ type: 'game_update', payload: gameState }));
            }
          });
        }
      );
      
      expect(metrics.averageTime).toBeLessThan(5); // Less than 5ms to broadcast to 100 connections
    });
  });

  describe('Memory Usage Tests', () => {
    test('should not leak memory during extended play', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const iterations = 100;
      
      for (let i = 0; i < iterations; i++) {
        const game = new PokerGame(
          {
            id: `table-${i}`,
            name: 'Memory Test',
            gameType: GameType.TEXAS_HOLDEM,
            bettingStructure: BettingStructure.NO_LIMIT,
            gameFormat: GameFormat.CASH,
            maxPlayers: 6,
            minBuyIn: 100,
            maxBuyIn: 1000,
            smallBlind: 5,
            bigBlind: 10,
            ante: 0,
            timeBank: 30,
            isPrivate: false,
          },
          Array.from({ length: 6 }, (_, j) => ({
            id: `player-${i}-${j}`,
            username: `Player${j}`,
            email: `player${j}@example.com`,
            chipCount: 1000,
            status: PlayerStatus.ACTIVE,
            timeBank: 30,
            isDealer: false,
          }))
        );
        
        await game.dealCards();
        
        // Simulate some actions
        for (let j = 0; j < 10; j++) {
          const gameState = game.getGameState();
          if (gameState.activePlayerId) {
            await game.processBet(gameState.activePlayerId, 20);
          }
        }
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB
      
      console.log(`Memory increase after ${iterations} games: ${memoryIncrease.toFixed(2)} MB`);
      
      // Memory increase should be reasonable (less than 50MB for 100 games)
      expect(memoryIncrease).toBeLessThan(50);
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle concurrent game actions', async () => {
      const games = Array.from({ length: 10 }, (_, i) => 
        new PokerGame(
          {
            id: `concurrent-table-${i}`,
            name: 'Concurrent Test',
            gameType: GameType.TEXAS_HOLDEM,
            bettingStructure: BettingStructure.NO_LIMIT,
            gameFormat: GameFormat.CASH,
            maxPlayers: 6,
            minBuyIn: 100,
            maxBuyIn: 1000,
            smallBlind: 5,
            bigBlind: 10,
            ante: 0,
            timeBank: 30,
            isPrivate: false,
          },
          Array.from({ length: 6 }, (_, j) => ({
            id: `player-${i}-${j}`,
            username: `Player${j}`,
            email: `player${j}@example.com`,
            chipCount: 1000,
            status: PlayerStatus.ACTIVE,
            timeBank: 30,
            isDealer: false,
          }))
        )
      );
      
      const metrics = await monitor.measurePerformance(
        'Concurrent Game Actions',
        100,
        async () => {
          await Promise.all(games.map(async (game, index) => {
            if (index === 0) {
              await game.dealCards();
            }
            
            const gameState = game.getGameState();
            if (gameState.activePlayerId) {
              await game.processBet(gameState.activePlayerId, 20);
            }
          }));
        }
      );
      
      expect(metrics.averageTime).toBeLessThan(10); // Less than 10ms for 10 concurrent actions
    });
  });
});