import { GameState, GamePhase } from '@primo-poker/shared'
import { StateSynchronizer, StateSnapshot } from '../state-synchronizer'

describe('StateSynchronizer Performance Benchmarks', () => {
  let synchronizer: StateSynchronizer
  let mockGameState: GameState

  beforeEach(() => {
    synchronizer = new StateSynchronizer()
    mockGameState = {
      tableId: 'table-123',
      gameId: 'game-456',
      phase: GamePhase.PRE_FLOP,
      pot: 100,
      sidePots: [],
      communityCards: [],
      currentBet: 20,
      minRaise: 40,
      activePlayerId: 'player-1',
      dealerId: 'player-2',
      smallBlindId: 'player-3',
      bigBlindId: 'player-1',
      handNumber: 1,
      timestamp: new Date()
    }
  })

  describe('Object Comparison Performance', () => {
    it('should measure baseline performance for object comparison', async () => {
      const playerStates = new Map()
      
      // Create large player state
      for (let i = 0; i < 100; i++) {
        playerStates.set(`player-${i}`, {
          id: `player-${i}`,
          username: `user-${i}`,
          chips: Math.floor(Math.random() * 10000),
          currentBet: Math.floor(Math.random() * 100),
          hasActed: Math.random() > 0.5,
          isFolded: Math.random() > 0.7,
          isAllIn: Math.random() > 0.9,
          position: { seat: i % 10 },
          cards: [],
          stats: {
            handsPlayed: Math.floor(Math.random() * 1000),
            handsWon: Math.floor(Math.random() * 500),
            totalWinnings: Math.floor(Math.random() * 100000)
          }
        })
      }
      
      const snapshot1 = await synchronizer.createSnapshot(mockGameState, playerStates)
      
      // Make small changes
      playerStates.get('player-1')!.chips = 5000
      playerStates.get('player-5')!.hasActed = true
      playerStates.get('player-10')!.currentBet = 200
      
      const snapshot2 = await synchronizer.createSnapshot(mockGameState, playerStates)
      
      // Measure delta generation time
      const start = performance.now()
      const delta = await synchronizer.generateDelta(snapshot1, snapshot2)
      const duration = performance.now() - start
      
      console.log(`Delta generation for 100 players with 3 changes: ${duration.toFixed(2)}ms`)
      expect(delta.changes).toHaveLength(3)
      expect(duration).toBeLessThan(50) // Should complete in under 50ms
    })

    it('should handle identical object references efficiently', async () => {
      const playerStates = new Map()
      const sharedData = {
        stats: {
          handsPlayed: 100,
          handsWon: 50,
          totalWinnings: 5000
        }
      }
      
      // Create players with shared reference
      for (let i = 0; i < 50; i++) {
        playerStates.set(`player-${i}`, {
          id: `player-${i}`,
          chips: 1000,
          stats: sharedData // Same reference
        })
      }
      
      const snapshot1 = await synchronizer.createSnapshot(mockGameState, playerStates)
      const snapshot2 = await synchronizer.createSnapshot(mockGameState, playerStates)
      
      const start = performance.now()
      const delta = await synchronizer.generateDelta(snapshot1, snapshot2)
      const duration = performance.now() - start
      
      console.log(`Delta generation for identical states: ${duration.toFixed(2)}ms`)
      expect(delta.changes).toHaveLength(0)
      expect(duration).toBeLessThan(10) // Should be very fast
    })

    it('should measure performance with deep nested objects', async () => {
      const createDeepObject = (depth: number, value: any): any => {
        if (depth === 0) return value
        return { nested: createDeepObject(depth - 1, value) }
      }
      
      const playerStates = new Map()
      for (let i = 0; i < 20; i++) {
        playerStates.set(`player-${i}`, {
          id: `player-${i}`,
          data: createDeepObject(10, { value: i })
        })
      }
      
      const snapshot1 = await synchronizer.createSnapshot(mockGameState, playerStates)
      
      // Modify deep value
      playerStates.get('player-5')!.data.nested.nested.nested.nested.nested.value = 999
      
      const snapshot2 = await synchronizer.createSnapshot(mockGameState, playerStates)
      
      const start = performance.now()
      const delta = await synchronizer.generateDelta(snapshot1, snapshot2)
      const duration = performance.now() - start
      
      console.log(`Delta generation for deep nested objects: ${duration.toFixed(2)}ms`)
      expect(delta.changes.length).toBeGreaterThan(0)
    })

    it('should benchmark array comparison performance', async () => {
      const playerStates = new Map()
      
      // Create players with large arrays
      for (let i = 0; i < 50; i++) {
        const history = []
        for (let j = 0; j < 100; j++) {
          history.push({
            action: 'bet',
            amount: Math.floor(Math.random() * 100),
            timestamp: Date.now() - j * 1000
          })
        }
        
        playerStates.set(`player-${i}`, {
          id: `player-${i}`,
          actionHistory: history
        })
      }
      
      const snapshot1 = await synchronizer.createSnapshot(mockGameState, playerStates)
      
      // Modify one array
      playerStates.get('player-10')!.actionHistory.push({
        action: 'raise',
        amount: 200,
        timestamp: Date.now()
      })
      
      const snapshot2 = await synchronizer.createSnapshot(mockGameState, playerStates)
      
      const start = performance.now()
      const delta = await synchronizer.generateDelta(snapshot1, snapshot2)
      const duration = performance.now() - start
      
      console.log(`Delta generation for large arrays: ${duration.toFixed(2)}ms`)
      expect(delta.changes.length).toBeGreaterThan(0)
      expect(duration).toBeLessThan(100)
    })

    it('should measure repeated comparison performance', async () => {
      const playerStates = new Map()
      for (let i = 0; i < 30; i++) {
        playerStates.set(`player-${i}`, {
          id: `player-${i}`,
          chips: 1000 + i,
          data: { level: i % 5, experience: i * 100 }
        })
      }
      
      const snapshot1 = await synchronizer.createSnapshot(mockGameState, playerStates)
      const snapshot2 = await synchronizer.createSnapshot(mockGameState, playerStates)
      
      const iterations = 100
      const start = performance.now()
      
      for (let i = 0; i < iterations; i++) {
        await synchronizer.generateDelta(snapshot1, snapshot2)
      }
      
      const duration = performance.now() - start
      const avgDuration = duration / iterations
      
      console.log(`Average delta generation over ${iterations} iterations: ${avgDuration.toFixed(2)}ms`)
      expect(avgDuration).toBeLessThan(5) // Should benefit from any caching
    })
  })

  describe('State Synchronization Performance', () => {
    it('should efficiently sync large version differences', async () => {
      const snapshots: StateSnapshot[] = []
      const playerStates = new Map()
      
      // Create initial player states
      for (let i = 0; i < 50; i++) {
        playerStates.set(`player-${i}`, {
          id: `player-${i}`,
          chips: 1000
        })
      }
      
      // Create many snapshots with incremental changes
      for (let v = 0; v < 20; v++) {
        mockGameState.pot = 100 + (v * 50)
        mockGameState.handNumber = v + 1
        
        // Random player changes
        const randomPlayer = `player-${Math.floor(Math.random() * 50)}`
        if (playerStates.has(randomPlayer)) {
          playerStates.get(randomPlayer)!.chips += 100
        }
        
        snapshots.push(await synchronizer.createSnapshot(mockGameState, playerStates))
      }
      
      const start = performance.now()
      const syncResult = await synchronizer.syncState(1, snapshots[19])
      const duration = performance.now() - start
      
      console.log(`Sync from version 1 to 20: ${duration.toFixed(2)}ms`)
      expect(syncResult).toBeDefined()
      expect(duration).toBeLessThan(50)
    })

    it('should handle concurrent state updates efficiently', async () => {
      const concurrentUpdates = 50
      const promises = []
      
      const start = performance.now()
      
      for (let i = 0; i < concurrentUpdates; i++) {
        const gameStateCopy = { ...mockGameState, pot: 100 + i }
        promises.push(synchronizer.createSnapshot(gameStateCopy, new Map()))
      }
      
      const results = await Promise.all(promises)
      const duration = performance.now() - start
      
      console.log(`${concurrentUpdates} concurrent snapshots: ${duration.toFixed(2)}ms`)
      
      // Verify all snapshots have unique versions
      const versions = new Set(results.map(r => r.version))
      expect(versions.size).toBe(concurrentUpdates)
      expect(duration).toBeLessThan(200)
    })
  })
})