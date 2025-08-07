import { SpectatorWebSocketManager } from '../spectator-websocket-manager'
import { AuthenticationManager } from '@primo-poker/security'

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

describe('Spectator limits functionality', () => {
  let wsManager: SpectatorWebSocketManager
  let mockAuthManager: Pick<AuthenticationManager, 'verifyAccessToken'>
  const jwtSecret = 'test-secret'
  const validToken = 'valid-jwt-token'
  const tableId = 'table-123'
  
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Create mock authentication manager that returns unique user IDs
    let userIdCounter = 0
    mockAuthManager = {
      verifyAccessToken: jest.fn().mockImplementation(() => {
        userIdCounter++
        return Promise.resolve({
          valid: true,
          payload: {
            userId: `spectator-${userIdCounter}`,
            username: `spectator${userIdCounter}`,
            email: `spectator${userIdCounter}@test.com`
          }
        })
      })
    }
    
    wsManager = new SpectatorWebSocketManager(jwtSecret, mockAuthManager)
  })
  
  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('50 spectator limit per table', () => {
    it('should accept up to 50 spectators per table', async () => {
      const spectators: MockWebSocket[] = []
      
      // Add 50 spectators
      for (let i = 0; i < 50; i++) {
        const ws = new MockWebSocket()
        spectators.push(ws)
        
        const request = new Request(`ws://localhost?token=${validToken}-${i}&tableId=${tableId}&spectator=true`)
        await wsManager.handleSpectatorConnection(ws, request)
      }
      
      // All 50 should be connected
      expect(wsManager.getSpectatorCount(tableId)).toBe(50)
      
      // None should be rejected
      spectators.forEach(ws => {
        expect(ws.closeCode).toBeUndefined()
      })
    })

    it('should reject the 51st spectator', async () => {
      const spectators: MockWebSocket[] = []
      
      // Add 50 spectators
      for (let i = 0; i < 50; i++) {
        const ws = new MockWebSocket()
        spectators.push(ws)
        
        const request = new Request(`ws://localhost?token=${validToken}-${i}&tableId=${tableId}&spectator=true`)
        await wsManager.handleSpectatorConnection(ws, request)
      }
      
      // Try to add 51st spectator
      const ws51 = new MockWebSocket()
      const request51 = new Request(`ws://localhost?token=${validToken}-51&tableId=${tableId}&spectator=true`)
      await wsManager.handleSpectatorConnection(ws51, request51)
      
      // Should still be 50
      expect(wsManager.getSpectatorCount(tableId)).toBe(50)
      
      // 51st should be rejected
      expect(ws51.closeCode).toBe(1008)
      expect(ws51.closeReason).toBe('Table spectator limit reached')
    })

    it('should allow new spectator after one leaves when at limit', async () => {
      const spectators: MockWebSocket[] = []
      
      // Add 50 spectators
      for (let i = 0; i < 50; i++) {
        const ws = new MockWebSocket()
        spectators.push(ws)
        
        const request = new Request(`ws://localhost?token=${validToken}-${i}&tableId=${tableId}&spectator=true`)
        await wsManager.handleSpectatorConnection(ws, request)
      }
      
      expect(wsManager.getSpectatorCount(tableId)).toBe(50)
      
      // Disconnect one spectator
      spectators[25].close()
      
      // Should be 49 now
      expect(wsManager.getSpectatorCount(tableId)).toBe(49)
      
      // Add new spectator
      const newSpectator = new MockWebSocket()
      const newRequest = new Request(`ws://localhost?token=${validToken}-new&tableId=${tableId}&spectator=true`)
      await wsManager.handleSpectatorConnection(newSpectator, newRequest)
      
      // Should be back to 50
      expect(wsManager.getSpectatorCount(tableId)).toBe(50)
      expect(newSpectator.closeCode).toBeUndefined()
    })

    it('should enforce limits independently per table', async () => {
      const table1Spectators: MockWebSocket[] = []
      const table2Spectators: MockWebSocket[] = []
      const table2Id = 'table-456'
      
      // Add 50 spectators to table 1
      for (let i = 0; i < 50; i++) {
        const ws = new MockWebSocket()
        table1Spectators.push(ws)
        
        const request = new Request(`ws://localhost?token=${validToken}-t1-${i}&tableId=${tableId}&spectator=true`)
        await wsManager.handleSpectatorConnection(ws, request)
      }
      
      // Add 50 spectators to table 2
      for (let i = 0; i < 50; i++) {
        const ws = new MockWebSocket()
        table2Spectators.push(ws)
        
        const request = new Request(`ws://localhost?token=${validToken}-t2-${i}&tableId=${table2Id}&spectator=true`)
        await wsManager.handleSpectatorConnection(ws, request)
      }
      
      // Both tables should have 50
      expect(wsManager.getSpectatorCount(tableId)).toBe(50)
      expect(wsManager.getSpectatorCount(table2Id)).toBe(50)
      
      // Try to add one more to each
      const extra1 = new MockWebSocket()
      const extraRequest1 = new Request(`ws://localhost?token=${validToken}-extra1&tableId=${tableId}&spectator=true`)
      await wsManager.handleSpectatorConnection(extra1, extraRequest1)
      
      const extra2 = new MockWebSocket()
      const extraRequest2 = new Request(`ws://localhost?token=${validToken}-extra2&tableId=${table2Id}&spectator=true`)
      await wsManager.handleSpectatorConnection(extra2, extraRequest2)
      
      // Both should be rejected
      expect(extra1.closeCode).toBe(1008)
      expect(extra2.closeCode).toBe(1008)
    })

    it('should send notification when spectator limit is reached', async () => {
      const spectators: MockWebSocket[] = []
      
      // Add 49 spectators
      for (let i = 0; i < 49; i++) {
        const ws = new MockWebSocket()
        spectators.push(ws)
        
        const request = new Request(`ws://localhost?token=${validToken}-${i}&tableId=${tableId}&spectator=true`)
        await wsManager.handleSpectatorConnection(ws, request)
      }
      
      // Clear messages from previous connections
      spectators.forEach(ws => ws.sentMessages = [])
      
      // Add 50th spectator (reaching limit)
      const ws50 = new MockWebSocket()
      const request50 = new Request(`ws://localhost?token=${validToken}-50&tableId=${tableId}&spectator=true`)
      await wsManager.handleSpectatorConnection(ws50, request50)
      
      // All spectators should receive notification that limit is reached
      spectators.forEach(ws => {
        const limitMessage = ws.sentMessages.find(msg => {
          const parsed = JSON.parse(msg)
          return parsed.type === 'spectator_limit_reached'
        })
        expect(limitMessage).toBeDefined()
      })
    })

    it('should handle rapid connection attempts gracefully', async () => {
      const connectionPromises: Promise<void>[] = []
      const spectators: MockWebSocket[] = []
      
      // Attempt to connect 60 spectators rapidly
      for (let i = 0; i < 60; i++) {
        const ws = new MockWebSocket()
        spectators.push(ws)
        
        const request = new Request(`ws://localhost?token=${validToken}-${i}&tableId=${tableId}&spectator=true`)
        connectionPromises.push(wsManager.handleSpectatorConnection(ws, request))
      }
      
      // Wait for all connection attempts
      await Promise.all(connectionPromises)
      
      // Should have exactly 50 connected
      expect(wsManager.getSpectatorCount(tableId)).toBe(50)
      
      // Count rejected connections
      const rejectedCount = spectators.filter(ws => ws.closeCode === 1008).length
      expect(rejectedCount).toBe(10)
    })
  })
})