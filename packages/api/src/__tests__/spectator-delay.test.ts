import { SpectatorWebSocketManager } from '../spectator-websocket-manager'
import { AuthenticationManager } from '@primo-poker/security'
import { createWebSocketMessage, GameState, GamePhase, Card, Suit, Rank } from '@primo-poker/shared'

// Mock WebSocket implementation
class MockWebSocket implements WebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSING = 2
  readonly CLOSED = 3

  readyState = MockWebSocket.OPEN
  url = ''
  protocol = ''
  bufferedAmount = 0
  binaryType: BinaryType = 'blob'
  extensions = ''

  onopen: ((this: WebSocket, ev: Event) => any) | null = null
  onclose: ((this: WebSocket, ev: CloseEvent) => any) | null = null
  onerror: ((this: WebSocket, ev: Event) => any) | null = null
  onmessage: ((this: WebSocket, ev: MessageEvent) => any) | null = null

  private messageListeners: Array<(event: MessageEvent) => void> = []
  private closeListeners: Array<(event: CloseEvent) => void> = []
  private errorListeners: Array<(event: Event) => void> = []
  
  sentMessages: string[] = []
  closeCode?: number
  closeReason?: string

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.sentMessages.push(data.toString())
  }

  close(code?: number, reason?: string): void {
    this.closeCode = code
    this.closeReason = reason
    this.readyState = MockWebSocket.CLOSED
    
    const closeEvent = new Event('close') as CloseEvent
    this.closeListeners.forEach(listener => listener(closeEvent))
  }

  addEventListener(type: string, listener: EventListener): void {
    if (type === 'message') {
      this.messageListeners.push(listener as any)
    } else if (type === 'close') {
      this.closeListeners.push(listener as any)
    } else if (type === 'error') {
      this.errorListeners.push(listener as any)
    }
  }

  removeEventListener(): void {}
  dispatchEvent(): boolean { return true }

  // Test helper to simulate receiving a message
  receiveMessage(data: string): void {
    const event = new MessageEvent('message', { data })
    this.messageListeners.forEach(listener => listener(event))
  }
}

// Mock AuthenticationManager
jest.mock('@primo-poker/security')

describe('Spectator 500ms delay functionality', () => {
  let wsManager: SpectatorWebSocketManager
  let mockSpectatorWs: MockWebSocket
  let mockPlayerWs: MockWebSocket
  let mockAuthManager: Pick<AuthenticationManager, 'verifyAccessToken'>
  const jwtSecret = 'test-secret'
  const validToken = 'valid-jwt-token'
  const tableId = 'table-123'
  const spectatorId = 'spectator-456'
  const playerId = 'player-123'
  
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    
    // Create mock authentication manager
    mockAuthManager = {
      verifyAccessToken: jest.fn().mockImplementation((token) => {
        return Promise.resolve({
          valid: true,
          payload: {
            userId: token === 'spectator-token' ? spectatorId : playerId,
            username: token === 'spectator-token' ? 'spectator1' : 'player1',
            email: token === 'spectator-token' ? 'spectator@test.com' : 'player@test.com'
          }
        })
      })
    }
    
    wsManager = new SpectatorWebSocketManager(jwtSecret, mockAuthManager)
    mockSpectatorWs = new MockWebSocket()
    mockPlayerWs = new MockWebSocket()
  })
  
  afterEach(() => {
    jest.clearAllMocks()
    jest.useRealTimers()
  })

  describe('Delayed updates for spectators', () => {
    it('should delay game updates to spectators by 500ms', async () => {
      // Add spectator
      const spectatorRequest = new Request(`ws://localhost?token=spectator-token&tableId=${tableId}&spectator=true`)
      await wsManager.handleSpectatorConnection(mockSpectatorWs, spectatorRequest)
      
      // Clear welcome messages
      mockSpectatorWs.sentMessages = []
      
      // Create a game update
      const gameUpdate = createWebSocketMessage('game_update', {
        tableId,
        gameId: 'game-123',
        phase: GamePhase.FLOP,
        pot: 150,
        sidePots: [],
        communityCards: [
          { suit: Suit.HEARTS, rank: Rank.ACE },
          { suit: Suit.DIAMONDS, rank: Rank.KING },
          { suit: Suit.CLUBS, rank: Rank.QUEEN }
        ],
        currentBet: 50,
        minRaise: 50,
        activePlayerId: playerId,
        dealerId: playerId,
        smallBlindId: playerId,
        bigBlindId: playerId,
        handNumber: 1,
        timestamp: new Date()
      } as GameState)
      
      // Broadcast to spectators
      wsManager.broadcastToSpectators(tableId, gameUpdate)
      
      // Should not receive immediately
      expect(mockSpectatorWs.sentMessages.length).toBe(0)
      
      // Advance time by 499ms - still shouldn't receive
      jest.advanceTimersByTime(499)
      expect(mockSpectatorWs.sentMessages.length).toBe(0)
      
      // Advance by 1ms more (total 500ms) - should receive
      jest.advanceTimersByTime(1)
      expect(mockSpectatorWs.sentMessages.length).toBe(1)
      
      const receivedMessage = JSON.parse(mockSpectatorWs.sentMessages[0])
      expect(receivedMessage.type).toBe('game_update')
      expect(receivedMessage.payload.phase).toBe(GamePhase.FLOP)
    })

    it('should delay different message types to spectators', async () => {
      // Add spectator
      const spectatorRequest = new Request(`ws://localhost?token=spectator-token&tableId=${tableId}&spectator=true`)
      await wsManager.handleSpectatorConnection(mockSpectatorWs, spectatorRequest)
      
      // Clear welcome messages
      mockSpectatorWs.sentMessages = []
      
      // Send multiple message types
      const playerActionMsg = createWebSocketMessage('player_action', {
        playerId,
        action: 'bet',
        amount: 100
      })
      
      const chatMsg = createWebSocketMessage('chat', {
        playerId,
        username: 'player1',
        message: 'Nice hand!',
        isSystem: false
      })
      
      wsManager.broadcastToSpectators(tableId, playerActionMsg)
      wsManager.broadcastToSpectators(tableId, chatMsg)
      
      // Should not receive immediately
      expect(mockSpectatorWs.sentMessages.length).toBe(0)
      
      // After 500ms, should receive both
      jest.advanceTimersByTime(500)
      expect(mockSpectatorWs.sentMessages.length).toBe(2)
      expect(JSON.parse(mockSpectatorWs.sentMessages[0]).type).toBe('player_action')
      expect(JSON.parse(mockSpectatorWs.sentMessages[1]).type).toBe('chat')
    })

    it('should allow custom delay time for spectators', async () => {
      // Add spectator
      const spectatorRequest = new Request(`ws://localhost?token=spectator-token&tableId=${tableId}&spectator=true`)
      await wsManager.handleSpectatorConnection(mockSpectatorWs, spectatorRequest)
      
      // Clear welcome messages
      mockSpectatorWs.sentMessages = []
      
      const gameUpdate = createWebSocketMessage('game_update', { phase: GamePhase.TURN })
      
      // Broadcast with custom 1000ms delay
      wsManager.broadcastToSpectators(tableId, gameUpdate, 1000)
      
      // Should not receive at 500ms
      jest.advanceTimersByTime(500)
      expect(mockSpectatorWs.sentMessages.length).toBe(0)
      
      // Should not receive at 999ms
      jest.advanceTimersByTime(499)
      expect(mockSpectatorWs.sentMessages.length).toBe(0)
      
      // Should receive at 1000ms
      jest.advanceTimersByTime(1)
      expect(mockSpectatorWs.sentMessages.length).toBe(1)
    })

    it('should maintain message order when delaying', async () => {
      // Add spectator
      const spectatorRequest = new Request(`ws://localhost?token=spectator-token&tableId=${tableId}&spectator=true`)
      await wsManager.handleSpectatorConnection(mockSpectatorWs, spectatorRequest)
      
      // Clear welcome messages
      mockSpectatorWs.sentMessages = []
      
      // Send messages with different delays
      const msg1 = createWebSocketMessage('game_update', { phase: GamePhase.PRE_FLOP })
      const msg2 = createWebSocketMessage('game_update', { phase: GamePhase.FLOP })
      const msg3 = createWebSocketMessage('game_update', { phase: GamePhase.TURN })
      
      wsManager.broadcastToSpectators(tableId, msg1, 300)
      wsManager.broadcastToSpectators(tableId, msg2, 500)
      wsManager.broadcastToSpectators(tableId, msg3, 200)
      
      // After 200ms, should receive msg3
      jest.advanceTimersByTime(200)
      expect(mockSpectatorWs.sentMessages.length).toBe(1)
      expect(JSON.parse(mockSpectatorWs.sentMessages[0]).payload.phase).toBe(GamePhase.TURN)
      
      // After 300ms total, should receive msg1
      jest.advanceTimersByTime(100)
      expect(mockSpectatorWs.sentMessages.length).toBe(2)
      expect(JSON.parse(mockSpectatorWs.sentMessages[1]).payload.phase).toBe(GamePhase.PRE_FLOP)
      
      // After 500ms total, should receive msg2
      jest.advanceTimersByTime(200)
      expect(mockSpectatorWs.sentMessages.length).toBe(3)
      expect(JSON.parse(mockSpectatorWs.sentMessages[2]).payload.phase).toBe(GamePhase.FLOP)
    })

    it('should not delay messages to regular players', async () => {
      // This test would require implementing player connection handling
      // For now, it will fail as expected in TDD red phase
      
      // Add regular player
      const playerRequest = new Request(`ws://localhost?token=player-token&tableId=${tableId}`)
      await wsManager.handleConnection(mockPlayerWs, playerRequest)
      
      // Clear any initial messages
      mockPlayerWs.sentMessages = []
      
      const gameUpdate = createWebSocketMessage('game_update', { phase: GamePhase.RIVER })
      
      // Broadcast to all (including players)
      wsManager.broadcastGameUpdate(tableId, { phase: GamePhase.RIVER } as GameState)
      
      // Player should receive immediately
      expect(mockPlayerWs.sentMessages.length).toBe(1)
      
      // No additional messages after delay
      jest.advanceTimersByTime(500)
      expect(mockPlayerWs.sentMessages.length).toBe(1)
    })

    it('should handle spectator disconnection during delay', async () => {
      // Add spectator
      const spectatorRequest = new Request(`ws://localhost?token=spectator-token&tableId=${tableId}&spectator=true`)
      await wsManager.handleSpectatorConnection(mockSpectatorWs, spectatorRequest)
      
      // Clear welcome messages
      mockSpectatorWs.sentMessages = []
      
      const gameUpdate = createWebSocketMessage('game_update', { phase: GamePhase.SHOWDOWN })
      
      // Broadcast with delay
      wsManager.broadcastToSpectators(tableId, gameUpdate)
      
      // Disconnect spectator after 250ms
      jest.advanceTimersByTime(250)
      mockSpectatorWs.close()
      
      // Advance to 500ms
      jest.advanceTimersByTime(250)
      
      // Should not receive message after disconnection
      expect(mockSpectatorWs.sentMessages.length).toBe(0)
    })
  })
})