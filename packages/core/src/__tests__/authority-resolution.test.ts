import { StateSynchronizer } from '../state-synchronizer'
import { 
  ConflictResolutionStrategy, 
  PlayerActionRecord, 
  PlayerRole,
  AuthorityLevel,
  AuthorityRules 
} from '../state-snapshot'

describe('Authority-based Conflict Resolution', () => {
  let synchronizer: StateSynchronizer

  beforeEach(() => {
    synchronizer = new StateSynchronizer({ enableLogging: false })
  })

  describe('Default Authority Levels', () => {
    it('should resolve conflicts based on role hierarchy', async () => {
      const actions: PlayerActionRecord[] = [
        {
          playerId: 'player1',
          action: 'bet',
          amount: 100,
          timestamp: 1000,
          playerRole: PlayerRole.PLAYER
        },
        {
          playerId: 'dealer1',
          action: 'bet',
          amount: 200,
          timestamp: 1000,
          playerRole: PlayerRole.DEALER
        },
        {
          playerId: 'admin1',
          action: 'bet',
          amount: 300,
          timestamp: 1000,
          playerRole: PlayerRole.ADMIN
        }
      ]

      const resolved = await synchronizer.resolveConflicts(
        actions,
        ConflictResolutionStrategy.AUTHORITY_BASED
      )

      expect(resolved).toHaveLength(1)
      expect(resolved[0]!.playerId).toBe('admin1')
      expect(resolved[0]!.amount).toBe(300)
    })

    it('should keep all actions at different timestamps', async () => {
      const actions: PlayerActionRecord[] = [
        {
          playerId: 'player1',
          action: 'bet',
          amount: 100,
          timestamp: 1000,
          playerRole: PlayerRole.PLAYER
        },
        {
          playerId: 'dealer1',
          action: 'bet',
          amount: 200,
          timestamp: 2000,
          playerRole: PlayerRole.DEALER
        }
      ]

      const resolved = await synchronizer.resolveConflicts(
        actions,
        ConflictResolutionStrategy.AUTHORITY_BASED
      )

      expect(resolved).toHaveLength(2)
      expect(resolved[0]!.timestamp).toBe(1000)
      expect(resolved[1]!.timestamp).toBe(2000)
    })

    it('should handle equal authority with timestamp tiebreaker', async () => {
      const actions: PlayerActionRecord[] = [
        {
          playerId: 'player1',
          action: 'bet',
          amount: 100,
          timestamp: 1000.123,
          playerRole: PlayerRole.PLAYER
        },
        {
          playerId: 'player2',
          action: 'bet',
          amount: 200,
          timestamp: 1000.456,
          playerRole: PlayerRole.PLAYER
        }
      ]

      const resolved = await synchronizer.resolveConflicts(
        actions,
        ConflictResolutionStrategy.AUTHORITY_BASED
      )

      expect(resolved).toHaveLength(1)
      expect(resolved[0]!.playerId).toBe('player1') // Earlier microseconds win
    })

    it('should use player ID as final tiebreaker', async () => {
      const actions: PlayerActionRecord[] = [
        {
          playerId: 'player2',
          action: 'bet',
          amount: 100,
          timestamp: 1000,
          playerRole: PlayerRole.PLAYER
        },
        {
          playerId: 'player1',
          action: 'bet',
          amount: 200,
          timestamp: 1000,
          playerRole: PlayerRole.PLAYER
        }
      ]

      const resolved = await synchronizer.resolveConflicts(
        actions,
        ConflictResolutionStrategy.AUTHORITY_BASED
      )

      expect(resolved).toHaveLength(1)
      expect(resolved[0]!.playerId).toBe('player1') // Alphabetically first
    })
  })

  describe('Custom Authority Rules', () => {
    it('should use custom role authority levels', async () => {
      const customRules: AuthorityRules = {
        roleAuthority: {
          [PlayerRole.ADMIN]: 10,
          [PlayerRole.DEALER]: 5,
          [PlayerRole.PLAYER]: 1
        }
      }

      const actions: PlayerActionRecord[] = [
        {
          playerId: 'player1',
          action: 'bet',
          amount: 100,
          timestamp: 1000,
          playerRole: PlayerRole.PLAYER
        },
        {
          playerId: 'dealer1',
          action: 'bet',
          amount: 200,
          timestamp: 1000,
          playerRole: PlayerRole.DEALER
        }
      ]

      const resolved = await synchronizer.resolveConflicts(
        actions,
        ConflictResolutionStrategy.AUTHORITY_BASED,
        { authorityRules: customRules }
      )

      expect(resolved).toHaveLength(1)
      expect(resolved[0]!.playerId).toBe('dealer1')
    })

    it('should respect explicit authority levels over roles', async () => {
      const actions: PlayerActionRecord[] = [
        {
          playerId: 'player1',
          action: 'bet',
          amount: 100,
          timestamp: 1000,
          playerRole: PlayerRole.PLAYER,
          authorityLevel: 10 // Higher than default admin
        },
        {
          playerId: 'admin1',
          action: 'bet',
          amount: 200,
          timestamp: 1000,
          playerRole: PlayerRole.ADMIN
        }
      ]

      const resolved = await synchronizer.resolveConflicts(
        actions,
        ConflictResolutionStrategy.AUTHORITY_BASED
      )

      expect(resolved).toHaveLength(1)
      expect(resolved[0]!.playerId).toBe('player1')
    })

    it('should disable timestamp tiebreaker when specified', async () => {
      const customRules: AuthorityRules = {
        useTimestampTiebreaker: false
      }

      const actions: PlayerActionRecord[] = [
        {
          playerId: 'player2',
          action: 'bet',
          amount: 100,
          timestamp: 1000.789,
          playerRole: PlayerRole.PLAYER
        },
        {
          playerId: 'player1',
          action: 'bet',
          amount: 200,
          timestamp: 1000.123,
          playerRole: PlayerRole.PLAYER
        }
      ]

      const resolved = await synchronizer.resolveConflicts(
        actions,
        ConflictResolutionStrategy.AUTHORITY_BASED,
        { authorityRules: customRules }
      )

      expect(resolved).toHaveLength(1)
      expect(resolved[0]!.playerId).toBe('player1') // Alphabetical order, not timestamp
    })

    it('should use custom resolver function', async () => {
      const customRules: AuthorityRules = {
        customResolver: (action1, action2) => {
          // Custom logic: prefer higher amounts
          return (action1.amount || 0) > (action2.amount || 0) ? action1 : action2
        }
      }

      const actions: PlayerActionRecord[] = [
        {
          playerId: 'admin1',
          action: 'bet',
          amount: 100,
          timestamp: 1000,
          playerRole: PlayerRole.ADMIN
        },
        {
          playerId: 'player1',
          action: 'bet',
          amount: 500,
          timestamp: 1000,
          playerRole: PlayerRole.PLAYER
        }
      ]

      const resolved = await synchronizer.resolveConflicts(
        actions,
        ConflictResolutionStrategy.AUTHORITY_BASED,
        { authorityRules: customRules }
      )

      expect(resolved).toHaveLength(1)
      expect(resolved[0]!.playerId).toBe('player1') // Higher amount wins
      expect(resolved[0]!.amount).toBe(500)
    })
  })

  describe('Edge Cases', () => {
    it('should handle actions without roles', async () => {
      const actions: PlayerActionRecord[] = [
        {
          playerId: 'player1',
          action: 'bet',
          amount: 100,
          timestamp: 1000
          // No role specified
        },
        {
          playerId: 'dealer1',
          action: 'bet',
          amount: 200,
          timestamp: 1000,
          playerRole: PlayerRole.DEALER
        }
      ]

      const resolved = await synchronizer.resolveConflicts(
        actions,
        ConflictResolutionStrategy.AUTHORITY_BASED
      )

      expect(resolved).toHaveLength(1)
      expect(resolved[0]!.playerId).toBe('dealer1') // Dealer wins over default player
    })

    it('should handle empty action list', async () => {
      const resolved = await synchronizer.resolveConflicts(
        [],
        ConflictResolutionStrategy.AUTHORITY_BASED
      )

      expect(resolved).toHaveLength(0)
    })

    it('should preserve action order when no conflicts', async () => {
      const actions: PlayerActionRecord[] = [
        {
          playerId: 'player1',
          action: 'bet',
          amount: 100,
          timestamp: 3000,
          playerRole: PlayerRole.PLAYER
        },
        {
          playerId: 'dealer1',
          action: 'raise',
          amount: 200,
          timestamp: 1000,
          playerRole: PlayerRole.DEALER
        },
        {
          playerId: 'admin1',
          action: 'call',
          amount: 200,
          timestamp: 2000,
          playerRole: PlayerRole.ADMIN
        }
      ]

      const resolved = await synchronizer.resolveConflicts(
        actions,
        ConflictResolutionStrategy.AUTHORITY_BASED
      )

      expect(resolved).toHaveLength(3)
      expect(resolved[0]!.timestamp).toBe(1000)
      expect(resolved[1]!.timestamp).toBe(2000)
      expect(resolved[2]!.timestamp).toBe(3000)
    })

    it('should handle complex multi-way conflicts', async () => {
      const actions: PlayerActionRecord[] = [
        // Conflict at timestamp 1000
        { playerId: 'player1', action: 'bet', timestamp: 1000, playerRole: PlayerRole.PLAYER },
        { playerId: 'player2', action: 'bet', timestamp: 1000, playerRole: PlayerRole.PLAYER },
        { playerId: 'dealer1', action: 'bet', timestamp: 1000, playerRole: PlayerRole.DEALER },
        // No conflict at timestamp 2000
        { playerId: 'player3', action: 'call', timestamp: 2000, playerRole: PlayerRole.PLAYER },
        // Another conflict at timestamp 3000
        { playerId: 'admin1', action: 'raise', timestamp: 3000, playerRole: PlayerRole.ADMIN },
        { playerId: 'dealer2', action: 'raise', timestamp: 3000, playerRole: PlayerRole.DEALER }
      ]

      const resolved = await synchronizer.resolveConflicts(
        actions,
        ConflictResolutionStrategy.AUTHORITY_BASED
      )

      expect(resolved).toHaveLength(3)
      expect(resolved[0]!.playerId).toBe('dealer1') // Dealer wins at t=1000
      expect(resolved[1]!.playerId).toBe('player3') // No conflict at t=2000
      expect(resolved[2]!.playerId).toBe('admin1')  // Admin wins at t=3000
    })
  })
})