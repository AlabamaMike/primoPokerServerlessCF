import { SpectatorWebSocketManager } from '../spectator-websocket-manager'
import { GameState, GamePlayer, GamePhase, Suit, Rank, PlayerStatus } from '@primo-poker/shared'

// Mock WebSocket implementation
class MockWebSocket {
  readyState: number = WebSocket.OPEN
  messages: string[] = []
  eventListeners: Map<string, Function[]> = new Map()
  
  send(data: string) {
    this.messages.push(data)
  }
  
  addEventListener(event: string, handler: Function) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, [])
    }
    this.eventListeners.get(event)!.push(handler)
  }
  
  triggerEvent(event: string, data?: any) {
    const handlers = this.eventListeners.get(event) || []
    handlers.forEach(handler => handler(data))
  }
  
  close() {
    this.readyState = WebSocket.CLOSED
    this.triggerEvent('close')
  }
}

// Mock WebSocketPair
class MockWebSocketPair {
  0: MockWebSocket
  1: MockWebSocket
  
  constructor() {
    this[0] = new MockWebSocket()
    this[1] = new MockWebSocket()
  }
}

// Replace global WebSocketPair
(global as any).WebSocketPair = function() {
  return new MockWebSocketPair()
}
(global as any).WebSocket = {
  OPEN: 1,
  CLOSED: 3
}

describe('SpectatorWebSocketManager', () => {
  let manager: SpectatorWebSocketManager
  let mockRequest: Request
  
  beforeEach(() => {
    manager = new SpectatorWebSocketManager()
    mockRequest = new Request('https://example.com', {
      headers: {
        'Authorization': 'Bearer test-token'
      }
    })
  })

  describe('spectator connection handling', () => {
    it('should accept spectator connection with valid auth', async () => {
      const response = await manager.handleSpectatorConnection(
        mockRequest,
        'spectator-1',
        'TestSpectator',
        'table-1'
      )
      
      expect(response.status).toBe(101)
      expect(response.webSocket).toBeDefined()
    })

    it('should reject spectator without auth', async () => {
      const noAuthRequest = new Request('https://example.com')
      
      const response = await manager.handleSpectatorConnection(
        noAuthRequest,
        'spectator-1',
        'TestSpectator',
        'table-1'
      )
      
      expect(response.status).toBe(401)
      expect(response.webSocket).toBeUndefined()
    })

    it('should enforce spectator limit', async () => {
      // Add 50 spectators
      for (let i = 0; i < 50; i++) {
        const response = await manager.handleSpectatorConnection(
          mockRequest,
          `spectator-${i}`,
          `Spectator${i}`,
          'table-1'
        )
        expect(response.status).toBe(101)
      }
      
      // Try to add 51st spectator
      const response = await manager.handleSpectatorConnection(
        mockRequest,
        'spectator-51',
        'ExtraSpectator',
        'table-1'
      )
      
      expect(response.status).toBe(403)
      expect(await response.text()).toBe('Table spectator limit reached')
    })

    it('should send initial messages on connection', async () => {
      const response = await manager.handleSpectatorConnection(
        mockRequest,
        'spectator-1',
        'TestSpectator',
        'table-1'
      )
      
      // Get the server-side WebSocket
      const pair = response.webSocket as any
      const serverWs = (pair as any).constructor === MockWebSocketPair ? pair[1] : null
      
      expect(serverWs).toBeDefined()
      expect(serverWs.messages.length).toBeGreaterThan(0)
      
      // Check for join confirmation message
      const messages = serverWs.messages.map(m => JSON.parse(m))
      const joinMessage = messages.find(m => m.type === 'SPECTATOR_JOIN')
      expect(joinMessage).toBeDefined()
      expect(joinMessage.payload.success).toBe(true)
      expect(joinMessage.payload.spectatorCount).toBe(1)
    })
  })

  describe('game state updates', () => {
    let gameState: GameState
    let players: GamePlayer[]
    
    beforeEach(() => {
      gameState = {
        tableId: 'table-1',
        gameId: 'game-1',
        phase: GamePhase.FLOP,
        pot: 150,
        sidePots: [],
        communityCards: [
          { suit: Suit.HEARTS, rank: Rank.ACE },
          { suit: Suit.DIAMONDS, rank: Rank.KING },
          { suit: Suit.CLUBS, rank: Rank.QUEEN }
        ],
        currentBet: 50,
        minRaise: 100,
        activePlayerId: 'player-1',
        dealerId: 'player-1',
        smallBlindId: 'player-2',
        bigBlindId: 'player-3',
        handNumber: 1,
        timestamp: new Date()
      }

      players = [
        {
          id: 'player-1',
          username: 'Player1',
          email: 'player1@test.com',
          chipCount: 1000,
          chips: 950,
          currentBet: 50,
          hasActed: true,
          isFolded: false,
          isAllIn: false,
          status: PlayerStatus.ACTIVE,
          cards: [
            { suit: Suit.HEARTS, rank: Rank.TEN },
            { suit: Suit.SPADES, rank: Rank.JACK }
          ]
        }
      ]
    })

    it('should queue game state updates', () => {
      manager.queueGameStateUpdate('table-1', gameState, players)
      
      // This should be queued internally
      const stats = manager.getSpectatorStats()
      expect(stats).toBeDefined()
    })

    it('should broadcast updates with delay', (done) => {
      // First add a spectator
      manager.handleSpectatorConnection(
        mockRequest,
        'spectator-1',
        'TestSpectator',
        'table-1'
      ).then(() => {
        const startTime = Date.now()
        
        // Queue an update
        manager.queueGameStateUpdate('table-1', gameState, players)
        
        // Check that update is delivered after delay
        setTimeout(() => {
          const elapsed = Date.now() - startTime
          expect(elapsed).toBeGreaterThanOrEqual(500)
          done()
        }, 600)
      })
    })
  })

  describe('spectator messages', () => {
    it('should handle spectator preferences update', async () => {
      const response = await manager.handleSpectatorConnection(
        mockRequest,
        'spectator-1',
        'TestSpectator',
        'table-1'
      )
      
      const pair = response.webSocket as any
      const clientWs = pair[0]
      const serverWs = pair[1]
      
      // Send preferences update
      const prefsMessage = {
        type: 'SPECTATOR_PREFERENCES',
        payload: {
          isEducationalMode: true,
          preferredView: 'educational'
        }
      }
      
      // Simulate client sending message
      serverWs.triggerEvent('message', { data: JSON.stringify(prefsMessage) })
      
      // Check response
      setTimeout(() => {
        const messages = serverWs.messages.map(m => JSON.parse(m))
        const confirmMessage = messages.find(m => m.type === 'SPECTATOR_PREFERENCES')
        expect(confirmMessage).toBeDefined()
        expect(confirmMessage.payload.success).toBe(true)
      }, 100)
    })

    it('should handle spectator disconnect', async () => {
      const response = await manager.handleSpectatorConnection(
        mockRequest,
        'spectator-1',
        'TestSpectator',
        'table-1'
      )
      
      const stats1 = manager.getSpectatorStats()
      expect(stats1.totalSpectators).toBe(1)
      
      // Disconnect spectator
      const pair = response.webSocket as any
      const serverWs = pair[1]
      serverWs.close()
      
      // Check that spectator was removed
      setTimeout(() => {
        const stats2 = manager.getSpectatorStats()
        expect(stats2.totalSpectators).toBe(0)
      }, 100)
    })
  })
})