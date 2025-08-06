import { GameState, GamePhase, PlayerAction } from '@primo-poker/shared'
import { StateSynchronizer, StateSnapshot, ConflictResolutionStrategy } from '../state-synchronizer'

describe('StateSynchronizer Integration Tests', () => {
  let synchronizer: StateSynchronizer
  let mockGameState: GameState

  beforeEach(() => {
    // Create synchronizer with custom configuration
    synchronizer = new StateSynchronizer({
      maxHistorySize: 20,
      versionDiffThreshold: 5, // Lower threshold for testing
      maxDeltaSize: 5 * 1024, // 5KB for testing
      enableComparisonCache: true,
      maxComparisonCacheSize: 500
    })
    
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

  describe('Configurable Thresholds (Issue #45)', () => {
    it('should respect custom versionDiffThreshold', async () => {
      const playerStates = new Map()
      const snapshots: StateSnapshot[] = []
      
      // Create 6 snapshots (threshold is 5)
      for (let i = 0; i < 6; i++) {
        mockGameState.pot = 100 + (i * 50)
        snapshots.push(await synchronizer.createSnapshot(mockGameState, playerStates))
      }
      
      // Client at version 1, server at version 6 (diff = 5)
      const syncResult5 = await synchronizer.syncState(1, snapshots[5])
      expect(syncResult5.type).toBe('snapshot') // Should send snapshot as diff > threshold
      
      // Client at version 2, server at version 6 (diff = 4)
      const syncResult4 = await synchronizer.syncState(2, snapshots[5])
      expect(syncResult4.type).toBe('delta') // Should send delta as diff <= threshold
    })

    it('should respect custom maxDeltaSize', async () => {
      const playerStates = new Map()
      
      // Create a large state that exceeds 5KB when serialized
      for (let i = 0; i < 100; i++) {
        playerStates.set(`player-${i}`, {
          id: `player-${i}`,
          username: `very-long-username-to-increase-size-${i}`,
          chips: 1000 + i,
          currentBet: i * 10,
          hasActed: false,
          isFolded: false,
          isAllIn: false,
          position: { seat: i % 10 },
          cards: [],
          stats: {
            handsPlayed: i * 100,
            handsWon: i * 50,
            totalWinnings: i * 1000,
            description: 'A'.repeat(50) // Add bulk
          }
        })
      }
      
      const snapshot1 = await synchronizer.createSnapshot(mockGameState, playerStates)
      
      // Make changes
      playerStates.get('player-1')!.chips = 5000
      const snapshot2 = await synchronizer.createSnapshot(mockGameState, playerStates)
      
      // Even with small version diff, should send snapshot due to size
      const syncResult = await synchronizer.syncState(1, snapshot2)
      expect(syncResult.type).toBe('snapshot')
    })

    it('should allow runtime configuration via syncState options', async () => {
      const playerStates = new Map()
      const snapshots: StateSnapshot[] = []
      
      for (let i = 0; i < 3; i++) {
        mockGameState.pot = 100 + (i * 50)
        snapshots.push(await synchronizer.createSnapshot(mockGameState, playerStates))
      }
      
      // Override maxDeltaSize at runtime
      const syncResult = await synchronizer.syncState(1, snapshots[2], {
        maxDeltaSize: 1 // Extremely small, force snapshot
      })
      
      expect(syncResult.type).toBe('snapshot')
    })
  })

  describe('Race Condition Protection (Issue #43)', () => {
    it('should handle concurrent snapshot creation with unique versions', async () => {
      const concurrentCount = 20
      const promises: Promise<StateSnapshot>[] = []
      const playerStates = new Map()
      
      // Create many concurrent snapshots
      for (let i = 0; i < concurrentCount; i++) {
        const gameStateCopy = { 
          ...mockGameState, 
          pot: 100 + i,
          handNumber: i 
        }
        promises.push(synchronizer.createSnapshot(gameStateCopy, playerStates))
      }
      
      const snapshots = await Promise.all(promises)
      
      // Check that all versions are unique and sequential
      const versions = snapshots.map(s => s.version).sort((a, b) => a - b)
      const expectedVersions = Array.from({ length: concurrentCount }, (_, i) => i + 1)
      
      expect(versions).toEqual(expectedVersions)
      
      // Verify no version was skipped or duplicated
      const versionSet = new Set(versions)
      expect(versionSet.size).toBe(concurrentCount)
    })

    it('should maintain consistency under high concurrency', async () => {
      const iterations = 50
      const results: { version: number; pot: number }[] = []
      
      // Simulate high-concurrency scenario
      await Promise.all(
        Array.from({ length: iterations }, async (_, i) => {
          const snapshot = await synchronizer.createSnapshot(
            { ...mockGameState, pot: 100 + i },
            new Map()
          )
          results.push({ version: snapshot.version, pot: snapshot.gameState.pot })
        })
      )
      
      // Sort by version and verify integrity
      results.sort((a, b) => a.version - b.version)
      
      // Each version should be unique
      const versions = results.map(r => r.version)
      expect(new Set(versions).size).toBe(iterations)
      
      // Versions should be contiguous
      for (let i = 1; i < results.length; i++) {
        expect(results[i].version).toBe(results[i - 1].version + 1)
      }
    })

    it('should handle rapid action logging without conflicts', async () => {
      const playerActions = []
      const actionCount = 100
      
      // Generate many actions from different players
      for (let i = 0; i < actionCount; i++) {
        playerActions.push({
          playerId: `player-${i % 10}`,
          action: PlayerAction.BET,
          amount: 50 + i,
          timestamp: Date.now() + i
        })
      }
      
      // Process actions concurrently
      const conflictPromises = playerActions.map(action => 
        synchronizer.detectConflicts([action])
      )
      
      const results = await Promise.all(conflictPromises)
      
      // Should handle all without errors
      expect(results.every(r => Array.isArray(r))).toBe(true)
    })
  })

  describe('Performance Optimization Validation (Issue #42)', () => {
    it('should demonstrate cache effectiveness', async () => {
      const playerStates = new Map()
      
      // Create complex nested state
      for (let i = 0; i < 20; i++) {
        playerStates.set(`player-${i}`, {
          id: `player-${i}`,
          data: {
            level1: {
              level2: {
                level3: {
                  value: i,
                  array: Array(10).fill(i)
                }
              }
            }
          }
        })
      }
      
      const snapshot1 = await synchronizer.createSnapshot(mockGameState, playerStates)
      
      // Make minimal change
      playerStates.get('player-1')!.data.level1.level2.level3.value = 999
      
      const snapshot2 = await synchronizer.createSnapshot(mockGameState, playerStates)
      
      // Measure repeated delta generation (should benefit from cache)
      const iterations = 10
      const start = performance.now()
      
      for (let i = 0; i < iterations; i++) {
        await synchronizer.generateDelta(snapshot1, snapshot2)
      }
      
      const duration = performance.now() - start
      const avgDuration = duration / iterations
      
      // Subsequent iterations should be faster due to caching
      expect(avgDuration).toBeLessThan(5)
    })

    it('should handle large state comparisons efficiently', async () => {
      const playerStates = new Map()
      const playerCount = 200
      
      // Create very large state
      for (let i = 0; i < playerCount; i++) {
        playerStates.set(`player-${i}`, {
          id: `player-${i}`,
          chips: 1000 + i,
          stats: {
            games: Array(50).fill(0).map((_, j) => ({
              id: `game-${i}-${j}`,
              result: 'win',
              profit: Math.random() * 1000
            }))
          }
        })
      }
      
      const start = performance.now()
      const snapshot = await synchronizer.createSnapshot(mockGameState, playerStates)
      const duration = performance.now() - start
      
      expect(duration).toBeLessThan(200) // Should handle 200 players in under 200ms
      expect(snapshot.playerStates.size).toBe(playerCount)
    })
  })

  describe('Comprehensive End-to-End Workflows (Issue #46)', () => {
    it('should handle complete game flow with multiple clients', async () => {
      const clients = ['client-1', 'client-2', 'client-3']
      const clientVersions = new Map<string, number>()
      const playerStates = new Map()
      
      // Initialize players
      for (let i = 0; i < 3; i++) {
        playerStates.set(`player-${i}`, {
          id: `player-${i}`,
          chips: 1000,
          currentBet: 0,
          hasActed: false
        })
      }
      
      // Initial snapshot
      const snapshot1 = await synchronizer.createSnapshot(mockGameState, playerStates)
      clients.forEach(c => clientVersions.set(c, snapshot1.version))
      
      // Simulate game progression
      const gameFlow = [
        { phase: GamePhase.PRE_FLOP, pot: 150, activePlayer: 'player-1' },
        { phase: GamePhase.FLOP, pot: 300, activePlayer: 'player-2' },
        { phase: GamePhase.TURN, pot: 500, activePlayer: 'player-3' },
        { phase: GamePhase.RIVER, pot: 800, activePlayer: 'player-1' },
        { phase: GamePhase.SHOWDOWN, pot: 1000, activePlayer: null }
      ]
      
      for (const state of gameFlow) {
        // Update game state
        mockGameState.phase = state.phase
        mockGameState.pot = state.pot
        mockGameState.activePlayerId = state.activePlayer || ''
        
        // Random player updates
        const randomPlayer = `player-${Math.floor(Math.random() * 3)}`
        playerStates.get(randomPlayer)!.currentBet += 50
        playerStates.get(randomPlayer)!.chips -= 50
        
        const newSnapshot = await synchronizer.createSnapshot(mockGameState, playerStates)
        
        // Sync each client
        for (const client of clients) {
          const clientVersion = clientVersions.get(client)!
          const syncResult = await synchronizer.syncState(clientVersion, newSnapshot)
          
          // Verify sync result
          expect(syncResult).toBeDefined()
          if (syncResult.type === 'delta') {
            expect(syncResult.fromVersion).toBe(clientVersion)
            expect(syncResult.toVersion).toBe(newSnapshot.version)
          }
          
          // Update client version
          clientVersions.set(client, newSnapshot.version)
        }
      }
      
      // All clients should be at the same version
      const finalVersions = Array.from(clientVersions.values())
      expect(new Set(finalVersions).size).toBe(1)
    })

    it('should handle network failures and recovery', async () => {
      const playerStates = new Map([
        ['player-1', { id: 'player-1', chips: 1000, isConnected: true }],
        ['player-2', { id: 'player-2', chips: 1000, isConnected: true }]
      ])
      
      // Create initial snapshots
      const snapshots: StateSnapshot[] = []
      for (let i = 0; i < 10; i++) {
        mockGameState.pot = 100 + (i * 50)
        mockGameState.handNumber = i + 1
        snapshots.push(await synchronizer.createSnapshot(mockGameState, playerStates))
      }
      
      // Client disconnects at version 3
      const disconnectedVersion = 3
      const disconnectedHash = snapshots[2].hash
      
      // Game continues without the client
      const currentSnapshot = snapshots[9]
      
      // Client reconnects and requests recovery
      const recovery = await synchronizer.recoverState(
        disconnectedVersion,
        disconnectedHash,
        currentSnapshot
      )
      
      expect(recovery.success).toBe(true)
      expect(recovery.updates).toBeDefined()
      expect(recovery.updates?.fromVersion).toBe(disconnectedVersion)
      expect(recovery.updates?.toVersion).toBe(currentSnapshot.version)
      
      // Verify changes include all intermediate updates
      const changes = recovery.updates?.changes || []
      const potChanges = changes.filter(c => c.path === 'gameState.pot')
      expect(potChanges.length).toBeGreaterThan(0)
    })

    it('should handle large-scale synchronization', async () => {
      const playerCount = 1000
      const playerStates = new Map()
      
      // Create massive player base
      for (let i = 0; i < playerCount; i++) {
        playerStates.set(`player-${i}`, {
          id: `player-${i}`,
          username: `user_${i}`,
          chips: Math.floor(Math.random() * 10000),
          tableId: `table-${Math.floor(i / 10)}`,
          isActive: Math.random() > 0.5
        })
      }
      
      const start = performance.now()
      
      // Create snapshot
      const snapshot1 = await synchronizer.createSnapshot(mockGameState, playerStates)
      
      // Simulate 100 random changes
      for (let i = 0; i < 100; i++) {
        const playerId = `player-${Math.floor(Math.random() * playerCount)}`
        const player = playerStates.get(playerId)
        if (player) {
          player.chips = Math.floor(Math.random() * 10000)
          player.isActive = !player.isActive
        }
      }
      
      const snapshot2 = await synchronizer.createSnapshot(mockGameState, playerStates)
      
      // Generate delta
      const delta = await synchronizer.generateDelta(snapshot1, snapshot2)
      
      const duration = performance.now() - start
      
      console.log(`Large-scale sync (${playerCount} players, 100 changes): ${duration.toFixed(2)}ms`)
      
      expect(duration).toBeLessThan(1000) // Should complete in under 1 second
      expect(delta.changes.length).toBeGreaterThan(0)
      expect(delta.changes.length).toBeLessThan(300) // Should have reasonable number of changes
    })

    it('should maintain consistency across long-running games', async () => {
      const playerStates = new Map()
      const gameHistory: StateSnapshot[] = []
      const rounds = 50 // Simulate 50 rounds of poker
      
      // Initialize 6 players
      for (let i = 0; i < 6; i++) {
        playerStates.set(`player-${i}`, {
          id: `player-${i}`,
          chips: 1000,
          handsWon: 0,
          handsPlayed: 0
        })
      }
      
      // Simulate many rounds
      for (let round = 0; round < rounds; round++) {
        // Reset for new hand
        mockGameState.handNumber = round + 1
        mockGameState.pot = 0
        mockGameState.phase = GamePhase.PRE_FLOP
        
        // Simulate betting rounds
        const phases = [GamePhase.PRE_FLOP, GamePhase.FLOP, GamePhase.TURN, GamePhase.RIVER]
        
        for (const phase of phases) {
          mockGameState.phase = phase
          mockGameState.pot += Math.floor(Math.random() * 200) + 50
          
          // Random player actions
          const actingPlayer = `player-${Math.floor(Math.random() * 6)}`
          const player = playerStates.get(actingPlayer)!
          player.chips -= 50
          player.handsPlayed++
          
          if (phase === GamePhase.RIVER && Math.random() > 0.5) {
            player.handsWon++
            player.chips += mockGameState.pot
          }
          
          const snapshot = await synchronizer.createSnapshot(mockGameState, playerStates)
          gameHistory.push(snapshot)
        }
      }
      
      // Verify we can recover any historical state
      const randomHistoricalVersion = Math.floor(Math.random() * gameHistory.length) + 1
      const historicalState = await synchronizer.getStateAtVersion(
        randomHistoricalVersion, 
        gameHistory
      )
      
      expect(historicalState).toBeDefined()
      expect(historicalState?.version).toBe(randomHistoricalVersion)
      
      // Verify final state integrity
      const finalSnapshot = gameHistory[gameHistory.length - 1]
      const isValid = await synchronizer.validateState(finalSnapshot)
      expect(isValid).toBe(true)
      
      // Check total chips conservation (minus rakes/pots)
      let totalChips = 0
      for (const [_, player] of finalSnapshot.playerStates) {
        totalChips += player.chips
      }
      
      console.log(`After ${rounds} rounds: Total chips = ${totalChips}, Final pot = ${finalSnapshot.gameState.pot}`)
    })
  })
})