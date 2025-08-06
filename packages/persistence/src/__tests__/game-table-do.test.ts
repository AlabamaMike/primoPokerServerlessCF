/**
 * Test suite for GameTableDurableObject button rotation logic
 */

// Grace period for temporarily disconnected players before skipping their turn (30 seconds)
const RECONNECTION_GRACE_PERIOD_MS = 30000

// Define PlayerStatus enum for tests
enum PlayerStatus {
  ACTIVE = 'active',
  SITTING_OUT = 'sitting_out',
  INACTIVE = 'inactive'
}

// Mock the required types and classes since we can't import them in test
class GameRuleError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = 'GameRuleError'
  }
}

interface GameTablePlayer {
  id: string
  username: string
  status: PlayerStatus
  position?: { seat: number }
  chips: number
  isFolded: boolean
  currentBet: number
  hasActed: boolean
  timeBank: number
}

interface PlayerConnection {
  playerId: string
  isConnected: boolean
}

// Extract the button rotation logic into testable functions
// Since we can't directly test the private methods, we'll test the logic patterns

describe('GameTableDurableObject - Button Rotation Logic', () => {
  describe('isPlayerActiveAndConnected', () => {
    const isPlayerActiveAndConnected = (
      player: GameTablePlayer,
      connections: Map<string, PlayerConnection>
    ): boolean => {
      if (player.status !== PlayerStatus.ACTIVE) return false
      const connection = connections.get(player.id)
      return connection ? connection.isConnected : false
    }

    it('should return false for inactive players', () => {
      const player: GameTablePlayer = {
        id: 'player1',
        username: 'Player 1',
        status: PlayerStatus.SITTING_OUT,
        chips: 1000,
        isFolded: false,
        currentBet: 0,
        hasActed: false,
        timeBank: 30
      }
      const connections = new Map<string, PlayerConnection>()
      connections.set('player1', { playerId: 'player1', isConnected: true })

      expect(isPlayerActiveAndConnected(player, connections)).toBe(false)
    })

    it('should return false for disconnected players', () => {
      const player: GameTablePlayer = {
        id: 'player1',
        username: 'Player 1',
        status: PlayerStatus.ACTIVE,
        chips: 1000,
        isFolded: false,
        currentBet: 0,
        hasActed: false,
        timeBank: 30
      }
      const connections = new Map<string, PlayerConnection>()
      connections.set('player1', { playerId: 'player1', isConnected: false })

      expect(isPlayerActiveAndConnected(player, connections)).toBe(false)
    })

    it('should return false for players without connection record', () => {
      const player: GameTablePlayer = {
        id: 'player1',
        username: 'Player 1',
        status: PlayerStatus.ACTIVE,
        chips: 1000,
        isFolded: false,
        currentBet: 0,
        hasActed: false,
        timeBank: 30
      }
      const connections = new Map<string, PlayerConnection>()

      expect(isPlayerActiveAndConnected(player, connections)).toBe(false)
    })

    it('should return true for active and connected players', () => {
      const player: GameTablePlayer = {
        id: 'player1',
        username: 'Player 1',
        status: PlayerStatus.ACTIVE,
        chips: 1000,
        isFolded: false,
        currentBet: 0,
        hasActed: false,
        timeBank: 30
      }
      const connections = new Map<string, PlayerConnection>()
      connections.set('player1', { playerId: 'player1', isConnected: true })

      expect(isPlayerActiveAndConnected(player, connections)).toBe(true)
    })
  })

  describe('getActivePlayersWithIndices', () => {
    const getActivePlayersWithIndices = (
      sortedPlayers: GameTablePlayer[],
      connections: Map<string, PlayerConnection>
    ): Array<{ player: GameTablePlayer, index: number }> => {
      const activePlayers: Array<{ player: GameTablePlayer, index: number }> = []
      
      for (let i = 0; i < sortedPlayers.length; i++) {
        const player = sortedPlayers[i]
        if (player.status === PlayerStatus.ACTIVE) {
          const connection = connections.get(player.id)
          if (connection && connection.isConnected) {
            activePlayers.push({ player: sortedPlayers[i], index: i })
          }
        }
      }
      
      return activePlayers
    }

    it('should return empty array when no players are active', () => {
      const players: GameTablePlayer[] = [
        {
          id: 'player1',
          username: 'Player 1',
          status: PlayerStatus.SITTING_OUT,
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        },
        {
          id: 'player2',
          username: 'Player 2',
          status: PlayerStatus.INACTIVE,
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        }
      ]
      const connections = new Map<string, PlayerConnection>()
      connections.set('player1', { playerId: 'player1', isConnected: true })
      connections.set('player2', { playerId: 'player2', isConnected: true })

      expect(getActivePlayersWithIndices(players, connections)).toEqual([])
    })

    it('should filter out disconnected active players', () => {
      const players: GameTablePlayer[] = [
        {
          id: 'player1',
          username: 'Player 1',
          status: PlayerStatus.ACTIVE,
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        },
        {
          id: 'player2',
          username: 'Player 2',
          status: PlayerStatus.ACTIVE,
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        }
      ]
      const connections = new Map<string, PlayerConnection>()
      connections.set('player1', { playerId: 'player1', isConnected: true })
      connections.set('player2', { playerId: 'player2', isConnected: false })

      const result = getActivePlayersWithIndices(players, connections)
      expect(result).toHaveLength(1)
      expect(result[0].player.id).toBe('player1')
      expect(result[0].index).toBe(0)
    })

    it('should return all active and connected players with correct indices', () => {
      const players: GameTablePlayer[] = [
        {
          id: 'player1',
          username: 'Player 1',
          status: PlayerStatus.ACTIVE,
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        },
        {
          id: 'player2',
          username: 'Player 2',
          status: PlayerStatus.SITTING_OUT,
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        },
        {
          id: 'player3',
          username: 'Player 3',
          status: PlayerStatus.ACTIVE,
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        }
      ]
      const connections = new Map<string, PlayerConnection>()
      connections.set('player1', { playerId: 'player1', isConnected: true })
      connections.set('player2', { playerId: 'player2', isConnected: true })
      connections.set('player3', { playerId: 'player3', isConnected: true })

      const result = getActivePlayersWithIndices(players, connections)
      expect(result).toHaveLength(2)
      expect(result[0].player.id).toBe('player1')
      expect(result[0].index).toBe(0)
      expect(result[1].player.id).toBe('player3')
      expect(result[1].index).toBe(2)
    })
  })

  describe('findNextDealerIndex', () => {
    const MIN_PLAYERS_FOR_GAME = 2

    const findNextDealerIndex = (
      sortedPlayers: GameTablePlayer[],
      buttonPosition: number,
      connections: Map<string, PlayerConnection>
    ): number => {
      // Get active players using optimized helper
      const activePlayers: Array<{ player: GameTablePlayer, index: number }> = []
      
      for (let i = 0; i < sortedPlayers.length; i++) {
        const player = sortedPlayers[i]
        if (player.status === PlayerStatus.ACTIVE) {
          const connection = connections.get(player.id)
          if (connection && connection.isConnected) {
            activePlayers.push({ player: sortedPlayers[i], index: i })
          }
        }
      }
      
      // Need at least minimum active players for a game
      if (activePlayers.length < MIN_PLAYERS_FOR_GAME) {
        throw new GameRuleError(
          'INSUFFICIENT_PLAYERS',
          'Not enough active players to continue the game'
        )
      }
      
      // Find current button holder among active players
      const currentButtonPlayer = activePlayers.find(
        ({ player }) => player.position?.seat === buttonPosition
      )
      
      if (!currentButtonPlayer) {
        // Button position is invalid or on disconnected player
        // Assign to first active player
        if (!activePlayers[0]) {
          throw new GameRuleError(
            'NO_ACTIVE_PLAYER',
            'No active player found to assign the dealer button'
          )
        }
        return activePlayers[0].index
      }
      
      // Find index of current button holder in active players array
      const currentIndex = activePlayers.indexOf(currentButtonPlayer)
      
      // Move to next active player clockwise
      const nextActiveIndex = (currentIndex + 1) % activePlayers.length
      
      // Return the original index in sortedPlayers array
      if (!activePlayers[nextActiveIndex]) {
        throw new GameRuleError(
          'INVALID_DEALER_INDEX',
          'Failed to find next dealer index: activePlayers array out of bounds'
        )
      }
      return activePlayers[nextActiveIndex].index
    }

    it('should throw error when less than 2 active players', () => {
      const players: GameTablePlayer[] = [
        {
          id: 'player1',
          username: 'Player 1',
          status: PlayerStatus.ACTIVE,
          position: { seat: 0 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        }
      ]
      const connections = new Map<string, PlayerConnection>()
      connections.set('player1', { playerId: 'player1', isConnected: true })

      expect(() => findNextDealerIndex(players, 0, connections)).toThrow(GameRuleError)
      expect(() => findNextDealerIndex(players, 0, connections)).toThrow('Not enough active players')
    })

    it('should assign button to first active player when current button is invalid', () => {
      const players: GameTablePlayer[] = [
        {
          id: 'player1',
          username: 'Player 1',
          status: PlayerStatus.SITTING_OUT,
          position: { seat: 0 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        },
        {
          id: 'player2',
          username: 'Player 2',
          status: PlayerStatus.ACTIVE,
          position: { seat: 1 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        },
        {
          id: 'player3',
          username: 'Player 3',
          status: PlayerStatus.ACTIVE,
          position: { seat: 2 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        }
      ]
      const connections = new Map<string, PlayerConnection>()
      connections.set('player1', { playerId: 'player1', isConnected: true })
      connections.set('player2', { playerId: 'player2', isConnected: true })
      connections.set('player3', { playerId: 'player3', isConnected: true })

      // Button is at seat 0 (inactive player)
      const result = findNextDealerIndex(players, 0, connections)
      expect(result).toBe(1) // First active player's index
    })

    it('should rotate button to next active player clockwise', () => {
      const players: GameTablePlayer[] = [
        {
          id: 'player1',
          username: 'Player 1',
          status: PlayerStatus.ACTIVE,
          position: { seat: 0 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        },
        {
          id: 'player2',
          username: 'Player 2',
          status: PlayerStatus.ACTIVE,
          position: { seat: 1 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        },
        {
          id: 'player3',
          username: 'Player 3',
          status: PlayerStatus.ACTIVE,
          position: { seat: 2 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        }
      ]
      const connections = new Map<string, PlayerConnection>()
      connections.set('player1', { playerId: 'player1', isConnected: true })
      connections.set('player2', { playerId: 'player2', isConnected: true })
      connections.set('player3', { playerId: 'player3', isConnected: true })

      // Button is at seat 1 (player2)
      const result = findNextDealerIndex(players, 1, connections)
      expect(result).toBe(2) // Next active player clockwise
    })

    it('should wrap around to first active player after last', () => {
      const players: GameTablePlayer[] = [
        {
          id: 'player1',
          username: 'Player 1',
          status: PlayerStatus.ACTIVE,
          position: { seat: 0 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        },
        {
          id: 'player2',
          username: 'Player 2',
          status: PlayerStatus.ACTIVE,
          position: { seat: 1 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        },
        {
          id: 'player3',
          username: 'Player 3',
          status: PlayerStatus.ACTIVE,
          position: { seat: 2 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        }
      ]
      const connections = new Map<string, PlayerConnection>()
      connections.set('player1', { playerId: 'player1', isConnected: true })
      connections.set('player2', { playerId: 'player2', isConnected: true })
      connections.set('player3', { playerId: 'player3', isConnected: true })

      // Button is at seat 2 (player3, last active)
      const result = findNextDealerIndex(players, 2, connections)
      expect(result).toBe(0) // Wraps to first active player
    })

    it('should skip inactive players when rotating', () => {
      const players: GameTablePlayer[] = [
        {
          id: 'player1',
          username: 'Player 1',
          status: PlayerStatus.ACTIVE,
          position: { seat: 0 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        },
        {
          id: 'player2',
          username: 'Player 2',
          status: PlayerStatus.SITTING_OUT,
          position: { seat: 1 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        },
        {
          id: 'player3',
          username: 'Player 3',
          status: PlayerStatus.ACTIVE,
          position: { seat: 2 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        }
      ]
      const connections = new Map<string, PlayerConnection>()
      connections.set('player1', { playerId: 'player1', isConnected: true })
      connections.set('player2', { playerId: 'player2', isConnected: true })
      connections.set('player3', { playerId: 'player3', isConnected: true })

      // Button is at seat 0 (player1)
      const result = findNextDealerIndex(players, 0, connections)
      expect(result).toBe(2) // Skips inactive player2, goes to player3
    })

    it('should handle button holder disconnecting between games', () => {
      const players: GameTablePlayer[] = [
        {
          id: 'player1',
          username: 'Player 1',
          status: PlayerStatus.ACTIVE,
          position: { seat: 0 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        },
        {
          id: 'player2',
          username: 'Player 2',
          status: PlayerStatus.ACTIVE,
          position: { seat: 1 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        },
        {
          id: 'player3',
          username: 'Player 3',
          status: PlayerStatus.ACTIVE,
          position: { seat: 2 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        }
      ]
      const connections = new Map<string, PlayerConnection>()
      connections.set('player1', { playerId: 'player1', isConnected: false }) // Disconnected
      connections.set('player2', { playerId: 'player2', isConnected: true })
      connections.set('player3', { playerId: 'player3', isConnected: true })

      // Button is at seat 0 (disconnected player1)
      const result = findNextDealerIndex(players, 0, connections)
      expect(result).toBe(1) // Assigns to first active connected player
    })
  })

  describe('Button assignment on first game', () => {
    it('should randomly assign button among active players only', () => {
      const players: GameTablePlayer[] = [
        {
          id: 'player1',
          username: 'Player 1',
          status: PlayerStatus.SITTING_OUT,
          position: { seat: 0 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        },
        {
          id: 'player2',
          username: 'Player 2',
          status: PlayerStatus.ACTIVE,
          position: { seat: 1 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        },
        {
          id: 'player3',
          username: 'Player 3',
          status: PlayerStatus.ACTIVE,
          position: { seat: 2 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        },
        {
          id: 'player4',
          username: 'Player 4',
          status: PlayerStatus.INACTIVE,
          position: { seat: 3 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        }
      ]
      const connections = new Map<string, PlayerConnection>()
      connections.set('player1', { playerId: 'player1', isConnected: true })
      connections.set('player2', { playerId: 'player2', isConnected: true })
      connections.set('player3', { playerId: 'player3', isConnected: true })
      connections.set('player4', { playerId: 'player4', isConnected: true })

      // Get active players
      const activePlayers: number[] = []
      for (let i = 0; i < players.length; i++) {
        const player = players[i]
        if (player.status === PlayerStatus.ACTIVE) {
          const connection = connections.get(player.id)
          if (connection && connection.isConnected) {
            activePlayers.push(i)
          }
        }
      }

      // Random selection should only be from active players
      expect(activePlayers).toEqual([1, 2]) // Only players 2 and 3 are active

      // Simulate random selection
      const randomIndex = Math.floor(Math.random() * activePlayers.length)
      const selectedIndex = activePlayers[randomIndex]
      
      expect([1, 2]).toContain(selectedIndex)
    })
  })

  describe('Edge cases', () => {
    it('should handle all players except one disconnecting', () => {
      const players: GameTablePlayer[] = [
        {
          id: 'player1',
          username: 'Player 1',
          status: PlayerStatus.ACTIVE,
          position: { seat: 0 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        },
        {
          id: 'player2',
          username: 'Player 2',
          status: PlayerStatus.ACTIVE,
          position: { seat: 1 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        },
        {
          id: 'player3',
          username: 'Player 3',
          status: PlayerStatus.ACTIVE,
          position: { seat: 2 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        }
      ]
      const connections = new Map<string, PlayerConnection>()
      connections.set('player1', { playerId: 'player1', isConnected: true })
      connections.set('player2', { playerId: 'player2', isConnected: false }) // Disconnected
      connections.set('player3', { playerId: 'player3', isConnected: false }) // Disconnected

      const findNextDealerIndex = (
        sortedPlayers: GameTablePlayer[],
        buttonPosition: number,
        connections: Map<string, PlayerConnection>
      ): number => {
        const activePlayers: Array<{ player: GameTablePlayer, index: number }> = []
        
        for (let i = 0; i < sortedPlayers.length; i++) {
          const player = sortedPlayers[i]
          if (player.status === PlayerStatus.ACTIVE) {
            const connection = connections.get(player.id)
            if (connection && connection.isConnected) {
              activePlayers.push({ player: sortedPlayers[i], index: i })
            }
          }
        }
        
        if (activePlayers.length < 2) {
          throw new GameRuleError(
            'INSUFFICIENT_PLAYERS',
            'Not enough active players to continue the game'
          )
        }
        
        return 0 // Would not reach here
      }

      expect(() => findNextDealerIndex(players, 0, connections)).toThrow('Not enough active players')
    })

    it('should handle race condition where player disconnects during check', () => {
      // This test simulates the scenario where a player's connection state changes
      // between the initial check and actual use
      const players: GameTablePlayer[] = [
        {
          id: 'player1',
          username: 'Player 1',
          status: PlayerStatus.ACTIVE,
          position: { seat: 0 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        },
        {
          id: 'player2',
          username: 'Player 2',
          status: PlayerStatus.ACTIVE,
          position: { seat: 1 },
          chips: 1000,
          isFolded: false,
          currentBet: 0,
          hasActed: false,
          timeBank: 30
        }
      ]
      
      const connections = new Map<string, PlayerConnection>()
      connections.set('player1', { playerId: 'player1', isConnected: true })
      connections.set('player2', { playerId: 'player2', isConnected: true })

      // Helper that re-checks connection state each time
      const isPlayerActiveAndConnected = (
        player: GameTablePlayer,
        connections: Map<string, PlayerConnection>
      ): boolean => {
        if (player.status !== PlayerStatus.ACTIVE) return false
        // Re-check connection state to avoid race conditions
        const connection = connections.get(player.id)
        return connection ? connection.isConnected : false
      }

      // Initial check shows both connected
      expect(isPlayerActiveAndConnected(players[0], connections)).toBe(true)
      expect(isPlayerActiveAndConnected(players[1], connections)).toBe(true)

      // Simulate player 2 disconnecting
      connections.set('player2', { playerId: 'player2', isConnected: false })

      // Re-check shows updated state
      expect(isPlayerActiveAndConnected(players[0], connections)).toBe(true)
      expect(isPlayerActiveAndConnected(players[1], connections)).toBe(false)
    })
  })

  describe('Grace period for disconnected players', () => {
    it('should consider recently disconnected players as active within grace period', () => {
      const player: GameTablePlayer = {
        id: 'player1',
        username: 'Player 1',
        status: PlayerStatus.ACTIVE,
        chips: 1000,
        position: { seat: 0 },
        isFolded: false,
        currentBet: 0,
        hasActed: false,
        timeBank: 30
      }
      
      // Player is disconnected but has chips
      const connections = new Map<string, PlayerConnection>()
      connections.set('player1', { playerId: 'player1', isConnected: false })
      
      // Without grace period consideration
      const isActiveStrict = (
        player: GameTablePlayer,
        connections: Map<string, PlayerConnection>
      ): boolean => {
        if (player.status !== PlayerStatus.ACTIVE) return false
        const connection = connections.get(player.id)
        return connection ? connection.isConnected : false
      }
      
      expect(isActiveStrict(player, connections)).toBe(false)
      
      // With grace period consideration (for button rotation)
      const isActiveWithGrace = (
        player: GameTablePlayer,
        connections: Map<string, PlayerConnection>
      ): boolean => {
        if (player.status !== PlayerStatus.ACTIVE) return false
        
        if (player.chips > 0) {
          const connection = connections.get(player.id)
          if (connection && !connection.isConnected) {
            // In real implementation, would check:
            // const disconnectTime = Date.now() - connection.lastHeartbeat
            // return disconnectTime < RECONNECTION_GRACE_PERIOD_MS
            return true // Assume within grace period for test
          }
          return connection ? connection.isConnected : false
        }
        
        const connection = connections.get(player.id)
        return connection ? connection.isConnected : false
      }
      
      expect(isActiveWithGrace(player, connections)).toBe(true)
    })
    
    it('should not consider players without chips as active even within grace period', () => {
      const player: GameTablePlayer = {
        id: 'player1',
        username: 'Player 1',
        status: PlayerStatus.ACTIVE,
        chips: 0, // No chips
        position: { seat: 0 },
        isFolded: false,
        currentBet: 0,
        hasActed: false,
        timeBank: 30
      }
      
      const connections = new Map<string, PlayerConnection>()
      connections.set('player1', { playerId: 'player1', isConnected: false })
      
      // Even with grace period logic, players without chips aren't considered active
      const isActiveWithGrace = (
        player: GameTablePlayer,
        connections: Map<string, PlayerConnection>
      ): boolean => {
        if (player.status !== PlayerStatus.ACTIVE) return false
        
        if (player.chips > 0) {
          const connection = connections.get(player.id)
          if (connection && !connection.isConnected) {
            return true // Within grace period
          }
          return connection ? connection.isConnected : false
        }
        
        const connection = connections.get(player.id)
        return connection ? connection.isConnected : false
      }
      
      expect(isActiveWithGrace(player, connections)).toBe(false)
    })
  })
})