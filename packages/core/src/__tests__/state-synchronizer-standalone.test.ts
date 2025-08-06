import { StateSynchronizer, StateSnapshot, StateDelta, ConflictResolutionStrategy } from '../state-synchronizer'

// Mock types for testing
enum GamePhase {
  WAITING = 'waiting',
  PRE_FLOP = 'pre_flop',
  FLOP = 'flop',
  TURN = 'turn',
  RIVER = 'river',
  SHOWDOWN = 'showdown',
  FINISHED = 'finished'
}

enum PlayerAction {
  FOLD = 'fold',
  CHECK = 'check',
  CALL = 'call',
  BET = 'bet',
  RAISE = 'raise',
  ALL_IN = 'all_in'
}

enum Suit {
  HEARTS = 'hearts',
  DIAMONDS = 'diamonds',
  CLUBS = 'clubs',
  SPADES = 'spades'
}

enum Rank {
  ACE = 'A',
  KING = 'K',
  QUEEN = 'Q',
  JACK = 'J',
  TEN = '10'
}

interface Card {
  suit: Suit
  rank: Rank
}

interface GameState {
  tableId: string
  gameId: string
  phase: GamePhase
  pot: number
  sidePots: number[]
  communityCards: Card[]
  currentBet: number
  minRaise: number
  activePlayerId?: string
  dealerId: string
  smallBlindId: string
  bigBlindId: string
  handNumber: number
  timestamp: Date
}

describe('StateSynchronizer', () => {
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

  describe('State Versioning', () => {
    it('should create a snapshot with version number', async () => {
      const snapshot = await synchronizer.createSnapshot(mockGameState, new Map())
      
      expect(snapshot.version).toBe(1)
      expect(snapshot.gameState).toEqual(mockGameState)
      expect(snapshot.hash).toBeDefined()
      expect(snapshot.timestamp).toBeGreaterThan(0)
    })

    it('should increment version number with each state change', async () => {
      const snapshot1 = await synchronizer.createSnapshot(mockGameState, new Map())
      
      mockGameState.pot = 200
      const snapshot2 = await synchronizer.createSnapshot(mockGameState, new Map())
      
      expect(snapshot2.version).toBe(2)
      expect(snapshot2.version).toBeGreaterThan(snapshot1.version)
    })

    it('should generate consistent hash for same state', async () => {
      // Create two instances to ensure hash is consistent
      const synchronizer1 = new StateSynchronizer()
      const synchronizer2 = new StateSynchronizer()
      
      const snapshot1 = await synchronizer1.createSnapshot(mockGameState, new Map())
      const snapshot2 = await synchronizer2.createSnapshot(mockGameState, new Map())
      
      // Same state should produce same hash regardless of version
      expect(snapshot1.hash).toBe(snapshot2.hash)
    })

    it('should detect state changes via hash comparison', async () => {
      const snapshot1 = await synchronizer.createSnapshot(mockGameState, new Map())
      
      mockGameState.pot = 300
      const snapshot2 = await synchronizer.createSnapshot(mockGameState, new Map())
      
      expect(snapshot1.hash).not.toBe(snapshot2.hash)
    })
  })

  describe('Delta Updates', () => {
    it('should generate delta between two snapshots', async () => {
      const snapshot1 = await synchronizer.createSnapshot(mockGameState, new Map())
      
      mockGameState.pot = 200
      mockGameState.currentBet = 40
      mockGameState.phase = GamePhase.FLOP
      
      const snapshot2 = await synchronizer.createSnapshot(mockGameState, new Map())
      
      const delta = await synchronizer.generateDelta(snapshot1, snapshot2)
      
      expect(delta.fromVersion).toBe(1)
      expect(delta.toVersion).toBe(2)
      expect(delta.changes).toHaveLength(3)
      expect(delta.changes).toContainEqual({
        path: 'gameState.pot',
        oldValue: 100,
        newValue: 200
      })
      expect(delta.changes).toContainEqual({
        path: 'gameState.currentBet',
        oldValue: 20,
        newValue: 40
      })
      expect(delta.changes).toContainEqual({
        path: 'gameState.phase',
        oldValue: GamePhase.PRE_FLOP,
        newValue: GamePhase.FLOP
      })
    })

    it('should apply delta to update state', async () => {
      const snapshot1 = await synchronizer.createSnapshot(mockGameState, new Map())
      
      const delta: StateDelta = {
        fromVersion: 1,
        toVersion: 2,
        changes: [
          { path: 'gameState.pot', oldValue: 100, newValue: 250 },
          { path: 'gameState.phase', oldValue: GamePhase.PRE_FLOP, newValue: GamePhase.TURN }
        ],
        timestamp: Date.now()
      }
      
      const updatedSnapshot = await synchronizer.applyDelta(snapshot1, delta)
      
      expect(updatedSnapshot.version).toBe(2)
      expect(updatedSnapshot.gameState.pot).toBe(250)
      expect(updatedSnapshot.gameState.phase).toBe(GamePhase.TURN)
    })

    it('should handle complex nested changes in delta', async () => {
      const playerStates = new Map([
        ['player-1', { id: 'player-1', chips: 1000, currentBet: 20, hasActed: false }],
        ['player-2', { id: 'player-2', chips: 800, currentBet: 0, hasActed: false }]
      ])
      
      const snapshot1 = await synchronizer.createSnapshot(mockGameState, playerStates)
      
      // Update player states
      playerStates.get('player-1')!.chips = 980
      playerStates.get('player-1')!.hasActed = true
      playerStates.get('player-2')!.currentBet = 20
      
      const snapshot2 = await synchronizer.createSnapshot(mockGameState, playerStates)
      
      const delta = await synchronizer.generateDelta(snapshot1, snapshot2)
      
      expect(delta.changes).toContainEqual({
        path: 'playerStates.player-1.chips',
        oldValue: 1000,
        newValue: 980
      })
      expect(delta.changes).toContainEqual({
        path: 'playerStates.player-1.hasActed',
        oldValue: false,
        newValue: true
      })
    })

    it('should compress deltas by removing redundant changes', async () => {
      const deltas: StateDelta[] = [
        {
          fromVersion: 1,
          toVersion: 2,
          changes: [{ path: 'gameState.pot', oldValue: 100, newValue: 150 }],
          timestamp: Date.now()
        },
        {
          fromVersion: 2,
          toVersion: 3,
          changes: [{ path: 'gameState.pot', oldValue: 150, newValue: 200 }],
          timestamp: Date.now()
        },
        {
          fromVersion: 3,
          toVersion: 4,
          changes: [{ path: 'gameState.pot', oldValue: 200, newValue: 250 }],
          timestamp: Date.now()
        }
      ]
      
      const compressed = await synchronizer.compressDeltas(deltas)
      
      expect(compressed.fromVersion).toBe(1)
      expect(compressed.toVersion).toBe(4)
      expect(compressed.changes).toHaveLength(1)
      expect(compressed.changes[0]).toEqual({
        path: 'gameState.pot',
        oldValue: 100,
        newValue: 250
      })
    })

    it('should validate delta version continuity', async () => {
      const snapshot = await synchronizer.createSnapshot(mockGameState, new Map())
      
      const invalidDelta: StateDelta = {
        fromVersion: 3, // Wrong version
        toVersion: 4,
        changes: [{ path: 'gameState.pot', oldValue: 100, newValue: 200 }],
        timestamp: Date.now()
      }
      
      await expect(synchronizer.applyDelta(snapshot, invalidDelta)).rejects.toThrow('Version mismatch')
    })
  })

  describe('Conflict Resolution', () => {
    it('should detect conflicting player actions', async () => {
      const actions = [
        { playerId: 'player-1', action: PlayerAction.BET, amount: 50, timestamp: 1000 },
        { playerId: 'player-1', action: PlayerAction.RAISE, amount: 100, timestamp: 1000 }
      ]
      
      const conflicts = await synchronizer.detectConflicts(actions)
      
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].type).toBe('duplicate_action')
      expect(conflicts[0].actions).toHaveLength(2)
    })

    it('should resolve conflicts using timestamp strategy', async () => {
      const actions = [
        { playerId: 'player-1', action: PlayerAction.BET, amount: 50, timestamp: 1000 },
        { playerId: 'player-1', action: PlayerAction.RAISE, amount: 100, timestamp: 1000 }
      ]
      
      const resolved = await synchronizer.resolveConflicts(
        actions, 
        ConflictResolutionStrategy.TIMESTAMP_FIRST
      )
      
      // With same timestamp, should keep only first action
      expect(resolved).toHaveLength(1)
      expect(resolved[0].action).toBe(PlayerAction.BET)
      expect(resolved[0].timestamp).toBe(1000)
    })

    it('should handle out-of-turn actions as conflicts', async () => {
      const snapshot = await synchronizer.createSnapshot(mockGameState, new Map())
      
      const actions = [
        { playerId: 'player-2', action: PlayerAction.BET, amount: 50, timestamp: 1000 },
        { playerId: 'player-3', action: PlayerAction.CALL, amount: 50, timestamp: 1001 }
      ]
      
      // player-1 is active, so player-2 and player-3 are out of turn
      const conflicts = await synchronizer.detectConflicts(actions, snapshot)
      
      expect(conflicts).toHaveLength(2)
      expect(conflicts[0].type).toBe('out_of_turn')
    })

    it('should apply rollback for invalid state transitions', async () => {
      const snapshot1 = await synchronizer.createSnapshot(mockGameState, new Map())
      
      // Apply invalid change
      mockGameState.pot = -100 // Invalid negative pot
      
      const snapshot2 = await synchronizer.createSnapshot(mockGameState, new Map())
      
      const isValid = await synchronizer.validateState(snapshot2)
      expect(isValid).toBe(false)
      
      // Rollback should restore previous valid state
      const rolledBack = await synchronizer.rollback(snapshot2, snapshot1)
      expect(rolledBack.gameState.pot).toBe(100)
      expect(rolledBack.version).toBe(snapshot1.version)
    })

    it('should maintain action order during conflict resolution', async () => {
      const actions = [
        { playerId: 'player-1', action: PlayerAction.BET, amount: 50, timestamp: 1000 },
        { playerId: 'player-2', action: PlayerAction.CALL, amount: 50, timestamp: 1001 },
        { playerId: 'player-3', action: PlayerAction.RAISE, amount: 100, timestamp: 1002 },
        { playerId: 'player-1', action: PlayerAction.CALL, amount: 50, timestamp: 1003 }
      ]
      
      const resolved = await synchronizer.resolveConflicts(
        actions,
        ConflictResolutionStrategy.SEQUENTIAL
      )
      
      expect(resolved).toHaveLength(4)
      expect(resolved[0].playerId).toBe('player-1')
      expect(resolved[1].playerId).toBe('player-2')
      expect(resolved[2].playerId).toBe('player-3')
      expect(resolved[3].playerId).toBe('player-1')
    })
  })

  describe('State Recovery', () => {
    it('should sync client from older version to current', async () => {
      // Create multiple snapshots
      const snapshots: StateSnapshot[] = []
      
      for (let i = 0; i < 5; i++) {
        mockGameState.pot = 100 + (i * 50)
        mockGameState.handNumber = i + 1
        snapshots.push(await synchronizer.createSnapshot(mockGameState, new Map()))
      }
      
      // Client is at version 2, server is at version 5
      const syncResult = await synchronizer.syncState(2, snapshots[4])
      
      expect(syncResult.type).toBe('delta')
      expect(syncResult.fromVersion).toBe(2)
      expect(syncResult.toVersion).toBe(5)
      expect(syncResult.changes).toBeDefined()
    })

    it('should send full snapshot when delta is too large', async () => {
      const playerStates = new Map()
      
      // Create many changes
      for (let i = 0; i < 50; i++) {
        playerStates.set(`player-${i}`, { 
          id: `player-${i}`, 
          chips: 1000 + i, 
          currentBet: i * 10 
        })
      }
      
      const snapshot = await synchronizer.createSnapshot(mockGameState, playerStates)
      
      // Client version is too old, use small maxDeltaSize to force snapshot
      const syncResult = await synchronizer.syncState(1, snapshot, { maxDeltaSize: 100 })
      
      expect(syncResult.type).toBe('snapshot')
      expect(syncResult.snapshot).toBeDefined()
    })

    it('should validate client state checksum', async () => {
      const snapshot = await synchronizer.createSnapshot(mockGameState, new Map())
      
      const isValid = await synchronizer.validateChecksum(snapshot, snapshot.hash)
      expect(isValid).toBe(true)
      
      const isInvalid = await synchronizer.validateChecksum(snapshot, 'invalid-hash')
      expect(isInvalid).toBe(false)
    })

    it('should handle reconnection with state recovery', async () => {
      const snapshot1 = await synchronizer.createSnapshot(mockGameState, new Map())
      
      // Simulate disconnect and changes
      mockGameState.pot = 500
      mockGameState.phase = GamePhase.RIVER
      mockGameState.communityCards = [
        { suit: Suit.HEARTS, rank: Rank.ACE },
        { suit: Suit.DIAMONDS, rank: Rank.KING },
        { suit: Suit.CLUBS, rank: Rank.QUEEN },
        { suit: Suit.SPADES, rank: Rank.JACK },
        { suit: Suit.HEARTS, rank: Rank.TEN }
      ]
      
      const snapshot2 = await synchronizer.createSnapshot(mockGameState, new Map())
      
      // Client reconnects with old version
      const recovery = await synchronizer.recoverState(
        snapshot1.version,
        snapshot1.hash,
        snapshot2
      )
      
      expect(recovery.success).toBe(true)
      expect(recovery.updates).toBeDefined()
      expect(recovery.missedActions).toBeDefined()
    })

    it('should track state history for recovery', async () => {
      const history: StateSnapshot[] = []
      
      for (let i = 0; i < 10; i++) {
        mockGameState.handNumber = i + 1
        history.push(await synchronizer.createSnapshot(mockGameState, new Map()))
      }
      
      // Get state at specific version
      const historicalState = await synchronizer.getStateAtVersion(5, history)
      expect(historicalState?.version).toBe(5)
      expect(historicalState?.gameState.handNumber).toBe(5)
    })
  })

  describe('Performance and Efficiency', () => {
    it('should handle large state updates efficiently', async () => {
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
          cards: []
        })
      }
      
      const start = Date.now()
      const snapshot = await synchronizer.createSnapshot(mockGameState, playerStates)
      const duration = Date.now() - start
      
      expect(duration).toBeLessThan(100) // Should complete in under 100ms
      expect(snapshot.playerStates.size).toBe(100)
    })

    it('should compress state for bandwidth efficiency', async () => {
      const snapshot = await synchronizer.createSnapshot(mockGameState, new Map())
      
      const compressed = await synchronizer.compressSnapshot(snapshot)
      const uncompressed = JSON.stringify(snapshot)
      
      expect(compressed.length).toBeLessThan(uncompressed.length)
      
      // Simple compression removes whitespace - expect at least some compression
      const compressionRatio = compressed.length / uncompressed.length
      expect(compressionRatio).toBeLessThan(1.0) // Less than original
      expect(compressed.length).toBeLessThan(uncompressed.length)
    })

    it('should batch multiple updates efficiently', async () => {
      const updates = []
      
      for (let i = 0; i < 20; i++) {
        updates.push({
          type: 'player_action',
          playerId: `player-${i % 5}`,
          action: PlayerAction.CALL,
          amount: 50,
          timestamp: Date.now() + i
        })
      }
      
      const batched = await synchronizer.batchUpdates(updates)
      
      // Should consolidate updates per player
      expect(batched.length).toBeLessThan(updates.length)
      expect(batched.length).toBeLessThanOrEqual(5) // Max 5 unique players
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty state gracefully', async () => {
      const emptyState = {} as GameState
      const snapshot = await synchronizer.createSnapshot(emptyState, new Map())
      
      expect(snapshot).toBeDefined()
      expect(snapshot.version).toBe(1)
    })

    it('should handle concurrent modifications safely', async () => {
      const results = await Promise.all([
        synchronizer.createSnapshot(mockGameState, new Map()),
        synchronizer.createSnapshot(mockGameState, new Map()),
        synchronizer.createSnapshot(mockGameState, new Map())
      ])
      
      // All should succeed with sequential versions
      const versions = results.map(r => r.version).sort((a, b) => a - b)
      expect(versions).toEqual([1, 2, 3])
    })

    it('should recover from corrupted state data', async () => {
      const corrupted = {
        version: 10,
        hash: 'invalid',
        gameState: null as any,
        playerStates: 'not-a-map' as any,
        timestamp: 'not-a-number' as any
      }
      
      const isValid = await synchronizer.validateState(corrupted as StateSnapshot)
      expect(isValid).toBe(false)
      
      // Should be able to create fresh snapshot despite corruption
      const fresh = await synchronizer.createSnapshot(mockGameState, new Map())
      expect(fresh.version).toBe(1)
    })

    it('should handle network interruptions during sync', async () => {
      const snapshot = await synchronizer.createSnapshot(mockGameState, new Map())
      
      // Simulate partial delta
      const partialDelta = {
        fromVersion: 1,
        toVersion: 2,
        changes: [
          { path: 'gameState.pot', oldValue: 100 } // Missing newValue
        ],
        timestamp: Date.now()
      }
      
      await expect(
        synchronizer.applyDelta(snapshot, partialDelta as any)
      ).rejects.toThrow()
    })
  })
})