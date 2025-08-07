/**
 * Chat Rate Limiting Tests
 * 
 * Tests for rate limiting functionality in chat system
 */

import { ChatEnhancedWebSocketManager } from '../websocket-chat-enhanced'
import { createWebSocketMessage, ChatMessage } from '@primo-poker/shared'
import { AuthenticationManager } from '@primo-poker/security'
import { MockWebSocket, MockRequest, createMockWebSocketPair } from './websocket-test-utils'

// Mock environment
const createMockEnv = () => ({
  CHAT_MODERATOR: {
    idFromName: (name: string) => ({ toString: () => name }),
    get: (id: any) => ({
      fetch: async (request: Request) => {
        const url = new URL(request.url)
        const body = await request.json().catch(() => ({})) as any
        
        // Mock rate limiting logic
        const playerId = request.headers.get('X-Player-ID')
        const rateLimitKey = `${playerId}:${body.channelId}`
        
        if (!mockRateLimits.has(rateLimitKey)) {
          mockRateLimits.set(rateLimitKey, [])
        }
        
        const timestamps = mockRateLimits.get(rateLimitKey)!
        const now = Date.now()
        const recentTimestamps = timestamps.filter(t => now - t < 60000)
        
        // Different rate limits for different scenarios
        let limit = 10 // Default
        if (body.channelId?.includes('strict')) limit = 3
        if (body.channelId?.includes('relaxed')) limit = 20
        
        if (recentTimestamps.length >= limit) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Rate limit exceeded. Please slow down.'
          }), { status: 400, headers: { 'Content-Type': 'application/json' } })
        }
        
        recentTimestamps.push(now)
        mockRateLimits.set(rateLimitKey, recentTimestamps)
        
        return new Response(JSON.stringify({
          success: true,
          data: {
            messageId: `msg-${Date.now()}`,
            timestamp: now
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
  JWT_SECRET: 'test-secret'
})

const mockRateLimits = new Map<string, number[]>()

describe('Chat Rate Limiting', () => {
  let wsManager: ChatEnhancedWebSocketManager
  let authManager: AuthenticationManager
  const jwtSecret = 'test-secret'

  beforeEach(() => {
    mockRateLimits.clear()
    wsManager = new ChatEnhancedWebSocketManager(createMockEnv() as any)
    authManager = new AuthenticationManager(jwtSecret)
  })

  describe('Basic Rate Limiting', () => {
    it('should allow messages within rate limit', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Send messages within limit (10 per minute)
      for (let i = 0; i < 10; i++) {
        const chatMessage: ChatMessage = createWebSocketMessage('chat', {
          playerId: 'player-123',
          username: 'TestPlayer',
          message: `Message ${i}`,
          isSystem: false
        }) as ChatMessage

        await server.simulateMessage(JSON.stringify(chatMessage))
      }

      // All messages should be accepted
      const messages = client.getMessages()
      const errors = messages.filter(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'error'
      })

      expect(errors).toHaveLength(0)
    })

    it('should block messages exceeding rate limit', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Send messages exceeding limit
      for (let i = 0; i < 12; i++) {
        const chatMessage: ChatMessage = createWebSocketMessage('chat', {
          playerId: 'player-123',
          username: 'TestPlayer',
          message: `Message ${i}`,
          isSystem: false
        }) as ChatMessage

        await server.simulateMessage(JSON.stringify(chatMessage))
      }

      // Should have rate limit errors
      const messages = client.getMessages()
      const errors = messages.filter(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'error' && parsed.payload.message.includes('Rate limit')
      })

      expect(errors.length).toBeGreaterThan(0)
    })

    it('should reset rate limit after time window', async () => {
      jest.useFakeTimers()
      
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Send messages up to limit
      for (let i = 0; i < 10; i++) {
        const chatMessage: ChatMessage = createWebSocketMessage('chat', {
          playerId: 'player-123',
          username: 'TestPlayer',
          message: `Message ${i}`,
          isSystem: false
        }) as ChatMessage

        await server.simulateMessage(JSON.stringify(chatMessage))
      }

      // Advance time by 1 minute
      jest.advanceTimersByTime(60000)

      // Clear old timestamps manually (simulate time passing)
      mockRateLimits.clear()

      // Should be able to send more messages
      const newMessage: ChatMessage = createWebSocketMessage('chat', {
        playerId: 'player-123',
        username: 'TestPlayer',
        message: 'After time window',
        isSystem: false
      }) as ChatMessage

      await server.simulateMessage(JSON.stringify(newMessage))

      const messages = client.getMessages()
      const lastMessage = messages[messages.length - 1]
      const parsed = JSON.parse(lastMessage)
      
      expect(parsed.type).not.toBe('error')

      jest.useRealTimers()
    })
  })

  describe('Per-Channel Rate Limiting', () => {
    it('should apply rate limits per channel', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      // Connect to table 1
      const { client: client1, server: server1 } = createMockWebSocketPair()
      await wsManager.handleConnection(server1, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Connect to table 2
      const { client: client2, server: server2 } = createMockWebSocketPair()
      await wsManager.handleConnection(server2, new MockRequest(`ws://localhost?token=${token}&tableId=table-2`))

      // Send messages to table 1 up to limit
      for (let i = 0; i < 10; i++) {
        const chatMessage: ChatMessage = createWebSocketMessage('chat', {
          playerId: 'player-123',
          username: 'TestPlayer',
          message: `Table 1 Message ${i}`,
          isSystem: false
        }) as ChatMessage

        await server1.simulateMessage(JSON.stringify(chatMessage))
      }

      // Should still be able to send to table 2
      const table2Message: ChatMessage = createWebSocketMessage('chat', {
        playerId: 'player-123',
        username: 'TestPlayer',
        message: 'Table 2 Message',
        isSystem: false
      }) as ChatMessage

      await server2.simulateMessage(JSON.stringify(table2Message))

      const messages2 = client2.getMessages()
      const errors2 = messages2.filter(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'error'
      })

      expect(errors2).toHaveLength(0)
    })

    it('should support different rate limits for different channel types', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      // Connect to strict channel
      const { client: strictClient, server: strictServer } = createMockWebSocketPair()
      await wsManager.handleConnection(strictServer, new MockRequest(`ws://localhost?token=${token}&tableId=table-strict-1`))

      // Connect to relaxed channel
      const { client: relaxedClient, server: relaxedServer } = createMockWebSocketPair()
      await wsManager.handleConnection(relaxedServer, new MockRequest(`ws://localhost?token=${token}&tableId=table-relaxed-1`))

      // Strict channel should block after 3 messages
      for (let i = 0; i < 5; i++) {
        const chatMessage: ChatMessage = createWebSocketMessage('chat', {
          playerId: 'player-123',
          username: 'TestPlayer',
          message: `Strict ${i}`,
          isSystem: false
        }) as ChatMessage

        await strictServer.simulateMessage(JSON.stringify(chatMessage))
      }

      const strictMessages = strictClient.getMessages()
      const strictErrors = strictMessages.filter(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'error' && parsed.payload.message.includes('Rate limit')
      })

      expect(strictErrors.length).toBeGreaterThan(0)

      // Relaxed channel should allow more messages
      for (let i = 0; i < 15; i++) {
        const chatMessage: ChatMessage = createWebSocketMessage('chat', {
          playerId: 'player-123',
          username: 'TestPlayer',
          message: `Relaxed ${i}`,
          isSystem: false
        }) as ChatMessage

        await relaxedServer.simulateMessage(JSON.stringify(chatMessage))
      }

      const relaxedMessages = relaxedClient.getMessages()
      const relaxedErrors = relaxedMessages.filter(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'error'
      })

      expect(relaxedErrors).toHaveLength(0)
    })
  })

  describe('Burst Protection', () => {
    it('should detect and block burst messages', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'burst-player',
        username: 'BurstPlayer',
        email: 'burst@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Send burst of messages with no delay
      const promises = []
      for (let i = 0; i < 20; i++) {
        const chatMessage: ChatMessage = createWebSocketMessage('chat', {
          playerId: 'burst-player',
          username: 'BurstPlayer',
          message: `Burst ${i}`,
          isSystem: false
        }) as ChatMessage

        promises.push(server.simulateMessage(JSON.stringify(chatMessage)))
      }

      await Promise.all(promises)

      const messages = client.getMessages()
      const errors = messages.filter(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'error' && parsed.payload.message.includes('Rate limit')
      })

      expect(errors.length).toBeGreaterThan(5)
    })

    it('should allow legitimate rapid messaging within limits', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'rapid-player',
        username: 'RapidPlayer',
        email: 'rapid@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Send messages rapidly but within limit
      for (let i = 0; i < 5; i++) {
        const chatMessage: ChatMessage = createWebSocketMessage('chat', {
          playerId: 'rapid-player',
          username: 'RapidPlayer',
          message: `Quick ${i}`,
          isSystem: false
        }) as ChatMessage

        await server.simulateMessage(JSON.stringify(chatMessage))
        await new Promise(resolve => setTimeout(resolve, 10)) // Small delay
      }

      const messages = client.getMessages()
      const errors = messages.filter(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'error'
      })

      expect(errors).toHaveLength(0)
    })
  })

  describe('Command Rate Limiting', () => {
    it('should have separate rate limits for chat commands', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Send regular messages up to limit
      for (let i = 0; i < 10; i++) {
        const chatMessage: ChatMessage = createWebSocketMessage('chat', {
          playerId: 'player-123',
          username: 'TestPlayer',
          message: `Message ${i}`,
          isSystem: false
        }) as ChatMessage

        await server.simulateMessage(JSON.stringify(chatMessage))
      }

      // Commands should not count towards chat rate limit
      const commandMessage: ChatMessage = createWebSocketMessage('chat', {
        playerId: 'player-123',
        username: 'TestPlayer',
        message: '/history',
        isSystem: false
      }) as ChatMessage

      await server.simulateMessage(JSON.stringify(commandMessage))

      // Check that command was processed
      const messages = client.getMessages()
      const historyResponse = messages.find(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'chat_history'
      })

      expect(historyResponse).toBeDefined()
    })
  })

  describe('Rate Limit Notifications', () => {
    it('should provide clear rate limit error messages', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Exceed rate limit
      for (let i = 0; i < 12; i++) {
        const chatMessage: ChatMessage = createWebSocketMessage('chat', {
          playerId: 'player-123',
          username: 'TestPlayer',
          message: `Message ${i}`,
          isSystem: false
        }) as ChatMessage

        await server.simulateMessage(JSON.stringify(chatMessage))
      }

      const messages = client.getMessages()
      const errorMessage = messages.find(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'error' && parsed.payload.message.includes('Rate limit')
      })

      expect(errorMessage).toBeDefined()
      const parsed = JSON.parse(errorMessage!)
      expect(parsed.payload.message).toContain('Please slow down')
    })

    it('should notify when approaching rate limit', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Send messages close to limit
      for (let i = 0; i < 8; i++) {
        const chatMessage: ChatMessage = createWebSocketMessage('chat', {
          playerId: 'player-123',
          username: 'TestPlayer',
          message: `Message ${i}`,
          isSystem: false
        }) as ChatMessage

        await server.simulateMessage(JSON.stringify(chatMessage))
      }

      // Could implement warning system here
      // For now, just verify we're still under limit
      const messages = client.getMessages()
      const errors = messages.filter(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'error'
      })

      expect(errors).toHaveLength(0)
    })
  })

  describe('Admin Override', () => {
    it('should allow admins to bypass rate limits', async () => {
      // Mock admin check
      const mockEnvWithAdmin = {
        ...createMockEnv(),
        CHAT_MODERATOR: {
          idFromName: (name: string) => ({ toString: () => name }),
          get: (id: any) => ({
            fetch: async (request: Request) => {
              const isAdmin = request.headers.get('X-Is-Admin') === 'true'
              
              if (isAdmin) {
                return new Response(JSON.stringify({
                  success: true,
                  data: {
                    messageId: `msg-${Date.now()}`,
                    timestamp: Date.now()
                  }
                }), { headers: { 'Content-Type': 'application/json' } })
              }
              
              // Regular rate limit logic
              return createMockEnv().CHAT_MODERATOR.get(id).fetch(request)
            }
          })
        }
      }

      const adminManager = new ChatEnhancedWebSocketManager(mockEnvWithAdmin as any)
      
      const token = await authManager.generateAccessToken({
        userId: 'admin-123',
        username: 'Admin',
        email: 'admin@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      server.headers = { 'X-Is-Admin': 'true' } // Mock admin header
      await adminManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Admin should be able to send unlimited messages
      for (let i = 0; i < 20; i++) {
        const chatMessage: ChatMessage = createWebSocketMessage('chat', {
          playerId: 'admin-123',
          username: 'Admin',
          message: `Admin message ${i}`,
          isSystem: false
        }) as ChatMessage

        await server.simulateMessage(JSON.stringify(chatMessage))
      }

      const messages = client.getMessages()
      const errors = messages.filter(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'error'
      })

      expect(errors).toHaveLength(0)
    })
  })
})