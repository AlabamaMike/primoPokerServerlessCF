/**
 * Chat Delivery Confirmation Tests
 * 
 * Tests for message delivery confirmation and reliability features
 */

import { ChatEnhancedWebSocketManager } from '../websocket-chat-enhanced'
import { createWebSocketMessage, ChatMessage } from '@primo-poker/shared'
import { AuthenticationManager } from '@primo-poker/security'
import { MockWebSocket, MockRequest, createMockWebSocketPair } from './websocket-test-utils'

// Enhanced mock environment with delivery tracking
const createMockEnv = () => {
  const deliveryTracking = new Map<string, DeliveryStatus>()
  
  return {
    CHAT_MODERATOR: {
      idFromName: (name: string) => ({ toString: () => name }),
      get: (id: any) => ({
        fetch: async (request: Request) => {
          const url = new URL(request.url)
          const body = await request.json().catch(() => ({})) as any
          
          // Simulate message processing with delivery states
          const messageId = `msg-${Date.now()}-${Math.random()}`
          
          // Track delivery status
          deliveryTracking.set(messageId, {
            id: messageId,
            status: 'pending',
            timestamp: Date.now(),
            recipients: []
          })
          
          // Simulate processing delay
          await new Promise(resolve => setTimeout(resolve, 10))
          
          // Simulate different scenarios
          if (body.message?.includes('[FAIL]')) {
            deliveryTracking.set(messageId, {
              ...deliveryTracking.get(messageId)!,
              status: 'failed',
              error: 'Message processing failed'
            })
            
            return new Response(JSON.stringify({
              success: false,
              error: 'Message processing failed'
            }), { status: 500, headers: { 'Content-Type': 'application/json' } })
          }
          
          if (body.message?.includes('[SLOW]')) {
            // Simulate slow processing
            await new Promise(resolve => setTimeout(resolve, 100))
          }
          
          // Success case
          deliveryTracking.set(messageId, {
            ...deliveryTracking.get(messageId)!,
            status: 'sent',
            sentAt: Date.now()
          })
          
          return new Response(JSON.stringify({
            success: true,
            data: {
              messageId,
              timestamp: Date.now(),
              deliveryStatus: deliveryTracking.get(messageId)
            }
          }), { headers: { 'Content-Type': 'application/json' } })
        }
      })
    },
    DB: {
      prepare: () => ({
        bind: () => ({
          run: async () => ({ success: true, meta: { changes: 1 } }),
          all: async () => ({ results: [] }),
          first: async () => null
        })
      })
    },
    JWT_SECRET: 'test-secret',
    // Expose for testing
    _deliveryTracking: deliveryTracking
  }
}

interface DeliveryStatus {
  id: string
  status: 'pending' | 'sent' | 'delivered' | 'failed'
  timestamp: number
  sentAt?: number
  deliveredAt?: number
  recipients?: string[]
  error?: string
}

describe('Chat Delivery Confirmation', () => {
  let wsManager: ChatEnhancedWebSocketManager
  let authManager: AuthenticationManager
  let mockEnv: ReturnType<typeof createMockEnv>

  beforeEach(() => {
    mockEnv = createMockEnv()
    wsManager = new ChatEnhancedWebSocketManager(mockEnv as any)
    authManager = new AuthenticationManager('test-secret')
  })

  describe('Basic Delivery Confirmation', () => {
    it('should send delivery confirmation when requested', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Send message with confirmation request
      const chatMessage: ChatMessage = createWebSocketMessage('chat', {
        playerId: 'player-123',
        username: 'TestPlayer',
        message: 'Test message',
        isSystem: false,
        requestConfirmation: true
      }) as ChatMessage

      await server.simulateMessage(JSON.stringify(chatMessage))

      // Should receive delivery confirmations
      const messages = client.getMessages()
      const confirmations = messages.filter(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'chat_delivered'
      })

      expect(confirmations.length).toBeGreaterThan(0)
      
      const sentConfirmation = confirmations.find(m => {
        const parsed = JSON.parse(m)
        return parsed.payload.status === 'sent'
      })
      
      expect(sentConfirmation).toBeDefined()
    })

    it('should not send confirmation when not requested', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Send message without confirmation request
      const chatMessage: ChatMessage = createWebSocketMessage('chat', {
        playerId: 'player-123',
        username: 'TestPlayer',
        message: 'Test message',
        isSystem: false,
        requestConfirmation: false
      }) as ChatMessage

      await server.simulateMessage(JSON.stringify(chatMessage))

      // Should not receive delivery confirmations
      const messages = client.getMessages()
      const confirmations = messages.filter(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'chat_delivered'
      })

      expect(confirmations).toHaveLength(0)
    })

    it('should include message ID in confirmation', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      const chatMessage: ChatMessage = createWebSocketMessage('chat', {
        playerId: 'player-123',
        username: 'TestPlayer',
        message: 'Test message',
        isSystem: false,
        requestConfirmation: true
      }) as ChatMessage

      await server.simulateMessage(JSON.stringify(chatMessage))

      const messages = client.getMessages()
      const confirmation = messages.find(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'chat_delivered'
      })

      expect(confirmation).toBeDefined()
      const parsed = JSON.parse(confirmation!)
      expect(parsed.payload.messageId).toBeDefined()
      expect(parsed.payload.timestamp).toBeDefined()
    })
  })

  describe('Delivery Status Tracking', () => {
    it('should track multiple delivery states', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      const chatMessage: ChatMessage = createWebSocketMessage('chat', {
        playerId: 'player-123',
        username: 'TestPlayer',
        message: 'Track this',
        isSystem: false,
        requestConfirmation: true
      }) as ChatMessage

      await server.simulateMessage(JSON.stringify(chatMessage))

      const messages = client.getMessages()
      const confirmations = messages.filter(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'chat_delivered'
      })

      // Should have 'sent' confirmation
      const sentConfirmation = confirmations.find(m => {
        const parsed = JSON.parse(m)
        return parsed.payload.status === 'sent'
      })

      expect(sentConfirmation).toBeDefined()

      // Should have 'delivered' confirmation
      const deliveredConfirmation = confirmations.find(m => {
        const parsed = JSON.parse(m)
        return parsed.payload.status === 'delivered'
      })

      expect(deliveredConfirmation).toBeDefined()
    })

    it('should handle delivery failure', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Send message that will fail
      const chatMessage: ChatMessage = createWebSocketMessage('chat', {
        playerId: 'player-123',
        username: 'TestPlayer',
        message: '[FAIL] This will fail',
        isSystem: false,
        requestConfirmation: true
      }) as ChatMessage

      await server.simulateMessage(JSON.stringify(chatMessage))

      const messages = client.getMessages()
      
      // Should receive error instead of delivery confirmation
      const errorMessage = messages.find(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'error'
      })

      expect(errorMessage).toBeDefined()
    })
  })

  describe('Message Queue and Retry', () => {
    it('should queue messages for reliability', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Send multiple messages quickly
      const messagePromises = []
      for (let i = 0; i < 5; i++) {
        const chatMessage: ChatMessage = createWebSocketMessage('chat', {
          playerId: 'player-123',
          username: 'TestPlayer',
          message: `Queued message ${i}`,
          isSystem: false,
          requestConfirmation: true
        }) as ChatMessage

        messagePromises.push(server.simulateMessage(JSON.stringify(chatMessage)))
      }

      await Promise.all(messagePromises)

      // All messages should be processed
      const messages = client.getMessages()
      const confirmations = messages.filter(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'chat_delivered' && parsed.payload.status === 'delivered'
      })

      expect(confirmations.length).toBe(5)
    })

    it('should handle slow message processing', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      const startTime = Date.now()

      // Send slow message
      const chatMessage: ChatMessage = createWebSocketMessage('chat', {
        playerId: 'player-123',
        username: 'TestPlayer',
        message: '[SLOW] This is slow',
        isSystem: false,
        requestConfirmation: true
      }) as ChatMessage

      await server.simulateMessage(JSON.stringify(chatMessage))

      const messages = client.getMessages()
      const confirmation = messages.find(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'chat_delivered' && parsed.payload.status === 'sent'
      })

      expect(confirmation).toBeDefined()
      
      // Should have taken some time
      const endTime = Date.now()
      expect(endTime - startTime).toBeGreaterThan(50)
    })
  })

  describe('Broadcast Confirmation', () => {
    it('should confirm broadcast to multiple recipients', async () => {
      // Create multiple players at the same table
      const players = []
      for (let i = 1; i <= 3; i++) {
        const token = await authManager.generateAccessToken({
          userId: `player-${i}`,
          username: `Player${i}`,
          email: `player${i}@example.com`
        })

        const { client, server } = createMockWebSocketPair()
        await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))
        
        players.push({ client, server, id: `player-${i}` })
      }

      // Player 1 sends a message
      const chatMessage: ChatMessage = createWebSocketMessage('chat', {
        playerId: 'player-1',
        username: 'Player1',
        message: 'Broadcast test',
        isSystem: false,
        requestConfirmation: true
      }) as ChatMessage

      await players[0].server.simulateMessage(JSON.stringify(chatMessage))

      // Player 1 should receive delivery confirmation
      const player1Messages = players[0].client.getMessages()
      const deliveryConfirmation = player1Messages.find(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'chat_delivered' && parsed.payload.status === 'delivered'
      })

      expect(deliveryConfirmation).toBeDefined()

      // All players should receive the broadcast
      for (const player of players) {
        const messages = player.client.getMessages()
        const chatBroadcast = messages.find(m => {
          const parsed = JSON.parse(m)
          return parsed.type === 'chat' && parsed.payload.message === 'Broadcast test'
        })
        
        expect(chatBroadcast).toBeDefined()
      }
    })
  })

  describe('Persistence Confirmation', () => {
    it('should confirm message persistence to D1', async () => {
      // Mock D1 with persistence tracking
      let persistedMessages = 0
      const trackingEnv = {
        ...mockEnv,
        DB: {
          prepare: () => ({
            bind: () => ({
              run: async () => {
                persistedMessages++
                return { success: true, meta: { changes: 1 } }
              },
              all: async () => ({ results: [] }),
              first: async () => null
            })
          })
        }
      }

      const persistenceManager = new ChatEnhancedWebSocketManager(trackingEnv as any)
      
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await persistenceManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      const chatMessage: ChatMessage = createWebSocketMessage('chat', {
        playerId: 'player-123',
        username: 'TestPlayer',
        message: 'Persist this',
        isSystem: false,
        requestConfirmation: true
      }) as ChatMessage

      await server.simulateMessage(JSON.stringify(chatMessage))

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 50))

      // Should have persisted the message
      expect(persistedMessages).toBe(1)

      // Should receive confirmation
      const messages = client.getMessages()
      const confirmation = messages.find(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'chat_delivered'
      })

      expect(confirmation).toBeDefined()
    })
  })

  describe('Connection Recovery', () => {
    it('should handle delivery confirmation across reconnection', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      // First connection
      const { client: client1, server: server1 } = createMockWebSocketPair()
      await wsManager.handleConnection(server1, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Send message
      const chatMessage: ChatMessage = createWebSocketMessage('chat', {
        playerId: 'player-123',
        username: 'TestPlayer',
        message: 'Before disconnect',
        isSystem: false,
        requestConfirmation: true,
        clientMessageId: 'client-msg-123' // Client-side ID for tracking
      }) as ChatMessage

      await server1.simulateMessage(JSON.stringify(chatMessage))

      // Simulate disconnect
      server1.close()

      // Reconnect
      const { client: client2, server: server2 } = createMockWebSocketPair()
      await wsManager.handleConnection(server2, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Could implement pending confirmation recovery here
      // For now, just verify new connection works
      const newMessage: ChatMessage = createWebSocketMessage('chat', {
        playerId: 'player-123',
        username: 'TestPlayer',
        message: 'After reconnect',
        isSystem: false,
        requestConfirmation: true
      }) as ChatMessage

      await server2.simulateMessage(JSON.stringify(newMessage))

      const messages = client2.getMessages()
      const confirmation = messages.find(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'chat_delivered'
      })

      expect(confirmation).toBeDefined()
    })
  })

  describe('Batch Delivery Confirmation', () => {
    it('should support batch delivery confirmations', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Send multiple messages that could be confirmed in batch
      const messageIds = []
      for (let i = 0; i < 3; i++) {
        const chatMessage: ChatMessage = createWebSocketMessage('chat', {
          playerId: 'player-123',
          username: 'TestPlayer',
          message: `Batch ${i}`,
          isSystem: false,
          requestConfirmation: true,
          clientMessageId: `batch-${i}`
        }) as ChatMessage

        await server.simulateMessage(JSON.stringify(chatMessage))
        messageIds.push(`batch-${i}`)
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100))

      const messages = client.getMessages()
      const confirmations = messages.filter(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'chat_delivered'
      })

      // Should have confirmations for all messages
      expect(confirmations.length).toBeGreaterThanOrEqual(3)
    })
  })
})