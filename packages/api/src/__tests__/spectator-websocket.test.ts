import { SpectatorWebSocketManager } from '../spectator-websocket-manager'
import { AuthenticationManager } from '@primo-poker/security'
import { createWebSocketMessage } from '@primo-poker/shared'

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

describe('Spectator WebSocket functionality', () => {
  let wsManager: SpectatorWebSocketManager
  let mockWebSocket: MockWebSocket
  let mockAuthManager: any
  const jwtSecret = 'test-secret'
  const validToken = 'valid-jwt-token'
  const tableId = 'table-123'
  const spectatorId = 'spectator-456'

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Create mock authentication manager
    mockAuthManager = {
      verifyAccessToken: jest.fn().mockImplementation((token) => {
        if (token === 'invalid') {
          return Promise.resolve({
            valid: false,
            error: 'Invalid token'
          })
        }
        return Promise.resolve({
          valid: true,
          payload: {
            userId: spectatorId,
            username: 'spectator1',
            email: 'spectator@test.com'
          }
        })
      })
    }
    
    wsManager = new SpectatorWebSocketManager(jwtSecret, mockAuthManager)
    mockWebSocket = new MockWebSocket()
  })
  
  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Spectator Join/Leave', () => {
    it('should allow spectators to join a table', async () => {
      const request = new Request(`ws://localhost?token=${validToken}&tableId=${tableId}&spectator=true`)
      
      await wsManager.handleSpectatorConnection(mockWebSocket, request)
      
      // Verify spectator was added
      expect(wsManager.getSpectatorCount(tableId)).toBe(1)
      
      // Verify welcome message was sent
      const sentMessages = mockWebSocket.sentMessages
      expect(sentMessages.length).toBeGreaterThan(0)
      const welcomeMessage = JSON.parse(sentMessages[0])
      expect(welcomeMessage.type).toBe('spectator_joined')
      expect(welcomeMessage.payload.spectatorId).toBe(spectatorId)
    })

    it('should handle spectator leaving a table', async () => {
      const request = new Request(`ws://localhost?token=${validToken}&tableId=${tableId}&spectator=true`)
      
      await wsManager.handleSpectatorConnection(mockWebSocket, request)
      expect(wsManager.getSpectatorCount(tableId)).toBe(1)
      
      // Simulate spectator leaving
      mockWebSocket.receiveMessage(JSON.stringify(createWebSocketMessage('spectator_leave', {})))
      
      // Verify spectator was removed
      expect(wsManager.getSpectatorCount(tableId)).toBe(0)
    })

    it('should track multiple spectators independently', async () => {
      // Create a fresh manager for this test
      let callCount = 0
      const multiAuthManager = {
        verifyAccessToken: jest.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve({
              valid: true,
              payload: {
                userId: spectatorId,
                username: 'spectator1',
                email: 'spectator@test.com'
              }
            })
          } else {
            return Promise.resolve({
              valid: true,
              payload: {
                userId: 'spectator-789',
                username: 'spectator2',
                email: 'spectator2@test.com'
              }
            })
          }
        })
      }
      
      const wsManager2 = new SpectatorWebSocketManager(jwtSecret, multiAuthManager)
      
      // Add first spectator
      const request1 = new Request(`ws://localhost?token=${validToken}&tableId=${tableId}&spectator=true`)
      await wsManager2.handleSpectatorConnection(mockWebSocket, request1)
      
      // Add second spectator
      const mockWebSocket2 = new MockWebSocket()
      const request2 = new Request(`ws://localhost?token=${validToken}&tableId=${tableId}&spectator=true`)
      await wsManager2.handleSpectatorConnection(mockWebSocket2, request2)
      
      expect(wsManager2.getSpectatorCount(tableId)).toBe(2)
    })

    it('should clean up spectator on disconnect', async () => {
      const request = new Request(`ws://localhost?token=${validToken}&tableId=${tableId}&spectator=true`)
      
      await wsManager.handleSpectatorConnection(mockWebSocket, request)
      expect(wsManager.getSpectatorCount(tableId)).toBe(1)
      
      // Simulate disconnect
      mockWebSocket.close()
      
      // Verify spectator was removed
      expect(wsManager.getSpectatorCount(tableId)).toBe(0)
    })

    it('should reject spectator without valid token', async () => {
      const invalidMockWebSocket = new MockWebSocket()
      const request = new Request(`ws://localhost?token=invalid&tableId=${tableId}&spectator=true`)
      
      await wsManager.handleSpectatorConnection(invalidMockWebSocket, request)
      
      expect(invalidMockWebSocket.closeCode).toBe(1008)
      expect(invalidMockWebSocket.closeReason).toBe('Invalid authentication token')
      expect(wsManager.getSpectatorCount(tableId)).toBe(0)
    })

    it('should broadcast spectator count updates', async () => {
      const request = new Request(`ws://localhost?token=${validToken}&tableId=${tableId}&spectator=true`)
      
      await wsManager.handleSpectatorConnection(mockWebSocket, request)
      
      // Check for spectator count broadcast
      const sentMessages = mockWebSocket.sentMessages
      const countMessage = sentMessages.find(msg => {
        const parsed = JSON.parse(msg)
        return parsed.type === 'spectator_count'
      })
      
      expect(countMessage).toBeDefined()
      const parsed = JSON.parse(countMessage!)
      expect(parsed.payload.count).toBe(1)
    })
  })
})