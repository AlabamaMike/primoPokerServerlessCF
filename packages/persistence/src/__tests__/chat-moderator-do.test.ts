/**
 * ChatModerator Durable Object Unit Tests
 */

import { ChatModeratorDurableObject } from '../chat-moderator-do'
import type { ChannelConfig } from '../chat-moderator-do'

// Mock Durable Object environment
class MockDurableObjectState {
  storage: Map<string, any> = new Map()
  websockets: Set<WebSocket> = new Set()

  async blockConcurrencyWhile(fn: () => Promise<void>): Promise<void> {
    await fn()
  }

  acceptWebSocket(ws: WebSocket): void {
    this.websockets.add(ws)
  }
}

class MockWebSocket {
  readyState: number = WebSocket.OPEN
  messages: string[] = []
  listeners: Map<string, Function[]> = new Map()
  
  send(data: string): void {
    this.messages.push(data)
  }
  
  close(): void {
    this.readyState = WebSocket.CLOSED
  }

  addEventListener(event: string, handler: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(handler)
  }

  async simulateMessage(data: string): Promise<void> {
    const handlers = this.listeners.get('message') || []
    for (const handler of handlers) {
      await handler({ data })
    }
  }
}

describe('ChatModeratorDurableObject', () => {
  let durableObject: ChatModeratorDurableObject
  let mockState: MockDurableObjectState
  let mockEnv: any

  beforeEach(() => {
    mockState = new MockDurableObjectState()
    mockEnv = {}
    durableObject = new ChatModeratorDurableObject(mockState as any, mockEnv)
  })

  describe('Message Sending', () => {
    it('should send a valid message', async () => {
      const request = new Request('http://localhost/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: 'channel-1',
          playerId: 'player-123',
          username: 'TestPlayer',
          message: 'Hello, world!'
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.messageId).toBeDefined()
      expect(result.data.timestamp).toBeDefined()
    })

    it('should reject message that is too long', async () => {
      const longMessage = 'a'.repeat(501) // Over 500 char limit

      const request = new Request('http://localhost/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: 'channel-1',
          playerId: 'player-123',
          username: 'TestPlayer',
          message: longMessage
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Message too long')
    })

    it('should reject message with banned words', async () => {
      const request = new Request('http://localhost/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: 'channel-1',
          playerId: 'player-123',
          username: 'TestPlayer',
          message: 'This is a scam message'
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Message contains prohibited content')
    })
  })

  describe('Message History', () => {
    beforeEach(async () => {
      // Send some test messages
      const messages = [
        { message: 'First message', playerId: 'player-1' },
        { message: 'Second message', playerId: 'player-2' },
        { message: 'Third message', playerId: 'player-1' }
      ]

      for (const msg of messages) {
        await durableObject.fetch(new Request('http://localhost/chat/send', {
          method: 'POST',
          body: JSON.stringify({
            channelId: 'channel-1',
            playerId: msg.playerId,
            username: `Player_${msg.playerId}`,
            message: msg.message
          })
        }))
      }
    })

    it('should return message history for a channel', async () => {
      const request = new Request('http://localhost/chat/history?channelId=channel-1')
      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.messages).toHaveLength(3)
      expect(result.data.messages[0].message).toBe('First message')
    })

    it('should filter history by player', async () => {
      const request = new Request('http://localhost/chat/history?channelId=channel-1&playerId=player-1')
      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.messages).toHaveLength(2)
      expect(result.data.messages.every((m: any) => m.playerId === 'player-1')).toBe(true)
    })

    it('should limit message history', async () => {
      const request = new Request('http://localhost/chat/history?channelId=channel-1&limit=2')
      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.messages).toHaveLength(2)
      // Should return the last 2 messages
      expect(result.data.messages[0].message).toBe('Second message')
      expect(result.data.messages[1].message).toBe('Third message')
    })
  })

  describe('Message Moderation', () => {
    it('should report a message', async () => {
      // First send a message
      const sendResponse = await durableObject.fetch(new Request('http://localhost/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: 'channel-1',
          playerId: 'player-123',
          username: 'TestPlayer',
          message: 'Normal message'
        })
      }))
      const sendResult = await sendResponse.json() as any
      const messageId = sendResult.data.messageId

      // Report the message
      const request = new Request('http://localhost/chat/report', {
        method: 'POST',
        body: JSON.stringify({
          messageId,
          reportedBy: 'player-456',
          reason: 'Inappropriate content'
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.reportId).toBe(messageId)
      expect(result.data.status).toBe('pending')
    })

    it('should delete a message', async () => {
      // Send a message
      const sendResponse = await durableObject.fetch(new Request('http://localhost/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: 'channel-1',
          playerId: 'player-123',
          username: 'TestPlayer',
          message: 'Delete me'
        })
      }))
      const sendResult = await sendResponse.json() as any
      const messageId = sendResult.data.messageId

      // Delete the message
      const request = new Request('http://localhost/chat/delete', {
        method: 'POST',
        body: JSON.stringify({
          messageId,
          channelId: 'channel-1',
          deletedBy: 'player-123',
          isAdmin: false
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)

      // Verify message is marked as deleted
      const historyResponse = await durableObject.fetch(
        new Request('http://localhost/chat/history?channelId=channel-1&includeDeleted=true')
      )
      const historyResult = await historyResponse.json() as any
      const deletedMessage = historyResult.data.messages.find((m: any) => m.id === messageId)
      
      expect(deletedMessage.deleted).toBe(true)
      expect(deletedMessage.deletedBy).toBe('player-123')
    })

    it('should not allow non-owner to delete message', async () => {
      // Send a message
      const sendResponse = await durableObject.fetch(new Request('http://localhost/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: 'channel-1',
          playerId: 'player-123',
          username: 'TestPlayer',
          message: 'My message'
        })
      }))
      const sendResult = await sendResponse.json() as any
      const messageId = sendResult.data.messageId

      // Try to delete as different player
      const request = new Request('http://localhost/chat/delete', {
        method: 'POST',
        body: JSON.stringify({
          messageId,
          channelId: 'channel-1',
          deletedBy: 'player-456',
          isAdmin: false
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(403)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Unauthorized to delete this message')
    })
  })

  describe('User Muting', () => {
    it('should mute a user', async () => {
      const request = new Request('http://localhost/chat/mute', {
        method: 'POST',
        body: JSON.stringify({
          playerId: 'player-123',
          username: 'TestPlayer',
          mutedBy: 'admin-1',
          reason: 'Spamming',
          duration: 300000 // 5 minutes
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.duration).toBe(300000)
      expect(result.data.mutedUntil).toBeGreaterThan(Date.now())
    })

    it('should reject messages from muted user', async () => {
      // Mute the user first
      await durableObject.fetch(new Request('http://localhost/chat/mute', {
        method: 'POST',
        body: JSON.stringify({
          playerId: 'player-123',
          username: 'TestPlayer',
          mutedBy: 'admin-1',
          reason: 'Test mute'
        })
      }))

      // Try to send message as muted user
      const request = new Request('http://localhost/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: 'channel-1',
          playerId: 'player-123',
          username: 'TestPlayer',
          message: 'This should be blocked'
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('You are muted')
    })

    it('should unmute a user', async () => {
      // Mute first
      await durableObject.fetch(new Request('http://localhost/chat/mute', {
        method: 'POST',
        body: JSON.stringify({
          playerId: 'player-123',
          username: 'TestPlayer',
          mutedBy: 'admin-1',
          reason: 'Test'
        })
      }))

      // Unmute
      const request = new Request('http://localhost/chat/unmute', {
        method: 'POST',
        body: JSON.stringify({
          playerId: 'player-123',
          unmutedBy: 'admin-1'
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)

      // Verify can send messages again
      const sendResponse = await durableObject.fetch(new Request('http://localhost/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: 'channel-1',
          playerId: 'player-123',
          username: 'TestPlayer',
          message: 'I can talk again!'
        })
      }))

      expect(sendResponse.status).toBe(200)
    })
  })

  describe('Channel Configuration', () => {
    it('should create channel configuration', async () => {
      const config: ChannelConfig = {
        channelId: 'channel-1',
        name: 'Test Channel',
        type: 'table',
        slowMode: 5,
        maxMessageLength: 200,
        allowedEmojis: true,
        allowedLinks: false,
        autoModeration: true
      }

      const request = new Request('http://localhost/chat/config', {
        method: 'POST',
        body: JSON.stringify(config)
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
    })

    it('should get channel configuration', async () => {
      // Create config first
      const config: ChannelConfig = {
        channelId: 'channel-1',
        name: 'Test Channel',
        type: 'table',
        slowMode: 5
      }

      await durableObject.fetch(new Request('http://localhost/chat/config', {
        method: 'POST',
        body: JSON.stringify(config)
      }))

      // Get config
      const request = new Request('http://localhost/chat/config?channelId=channel-1')
      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.config.name).toBe('Test Channel')
      expect(result.data.config.slowMode).toBe(5)
    })

    it('should enforce slow mode', async () => {
      // Configure channel with slow mode
      await durableObject.fetch(new Request('http://localhost/chat/config', {
        method: 'POST',
        body: JSON.stringify({
          channelId: 'channel-1',
          name: 'Slow Channel',
          type: 'table',
          slowMode: 5 // 5 seconds between messages
        })
      }))

      // Send first message
      await durableObject.fetch(new Request('http://localhost/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: 'channel-1',
          playerId: 'player-123',
          username: 'TestPlayer',
          message: 'First message'
        })
      }))

      // Try to send second message immediately
      const request = new Request('http://localhost/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: 'channel-1',
          playerId: 'player-123',
          username: 'TestPlayer',
          message: 'Too fast!'
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Slow mode active')
    })
  })

  describe('WebSocket Support', () => {
    it('should handle WebSocket upgrade', async () => {
      const mockWebSocketPair = {
        0: new MockWebSocket(),
        1: new MockWebSocket()
      }

      global.WebSocketPair = jest.fn().mockReturnValue(mockWebSocketPair)

      const request = new Request('http://localhost/ws', {
        headers: {
          'Upgrade': 'websocket',
          'X-Player-ID': 'player-123',
          'X-Username': 'TestPlayer'
        }
      })

      const response = await durableObject.fetch(request)

      expect(response.status).toBe(101)
      expect(response.webSocket).toBeDefined()
    })

    it('should handle WebSocket channel join', async () => {
      const mockWebSocket = new MockWebSocket()
      const mockWebSocketPair = {
        0: new MockWebSocket(),
        1: mockWebSocket
      }

      global.WebSocketPair = jest.fn().mockReturnValue(mockWebSocketPair)

      // Establish WebSocket connection
      await durableObject.fetch(new Request('http://localhost/ws', {
        headers: {
          'Upgrade': 'websocket',
          'X-Player-ID': 'player-123',
          'X-Username': 'TestPlayer'
        }
      }))

      // Simulate join channel message
      await durableObject.webSocketMessage(mockWebSocket as any, JSON.stringify({
        type: 'join_channel',
        payload: { channelId: 'channel-1' }
      }))

      // Check for join confirmation
      const messages = mockWebSocket.messages.map(m => JSON.parse(m))
      const joinMessage = messages.find(m => m.type === 'joined_channel')
      expect(joinMessage).toBeDefined()
      expect(joinMessage.payload.channelId).toBe('channel-1')
    })
  })

  describe('Statistics', () => {
    it('should return moderation statistics', async () => {
      // Generate some activity
      await durableObject.fetch(new Request('http://localhost/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: 'channel-1',
          playerId: 'player-123',
          username: 'TestPlayer',
          message: 'Hello'
        })
      }))

      await durableObject.fetch(new Request('http://localhost/chat/mute', {
        method: 'POST',
        body: JSON.stringify({
          playerId: 'player-456',
          username: 'BadPlayer',
          mutedBy: 'admin-1',
          reason: 'Spam'
        })
      }))

      const request = new Request('http://localhost/chat/stats')
      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.totalMessages).toBeGreaterThan(0)
      expect(result.data.mutedUsers).toBe(1)
      expect(result.data.activeChannels).toBe(1)
    })
  })

  describe('Health Check', () => {
    it('should return health status', async () => {
      const request = new Request('http://localhost/health')
      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.healthy).toBe(true)
      expect(result.instanceId).toBeDefined()
      expect(result.uptime).toBeGreaterThanOrEqual(0)
      expect(result.channelCount).toBe(0)
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid message format', async () => {
      const request = new Request('http://localhost/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          // Missing required fields
          message: 'Hello'
        })
      })

      const response = await durableObject.fetch(request)
      
      expect(response.status).toBe(500)
    })

    it('should handle reporting non-existent message', async () => {
      const request = new Request('http://localhost/chat/report', {
        method: 'POST',
        body: JSON.stringify({
          messageId: 'fake-message-id',
          reportedBy: 'player-123',
          reason: 'Test'
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200) // Still succeeds but stores report
      expect(result.success).toBe(true)
    })

    it('should handle unmuting non-muted user', async () => {
      const request = new Request('http://localhost/chat/unmute', {
        method: 'POST',
        body: JSON.stringify({
          playerId: 'not-muted-player',
          unmutedBy: 'admin-1'
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(404)
      expect(result.success).toBe(false)
      expect(result.error).toBe('User not muted')
    })
  })

  describe('Enhanced Rate Limiting', () => {
    beforeEach(() => {
      // Set custom rate limit environment variables for testing
      mockEnv.CHAT_RATE_LIMIT_MESSAGES = '5'
      mockEnv.CHAT_RATE_LIMIT_WINDOW = '30000' // 30 seconds
      durableObject = new ChatModeratorDurableObject(mockState as any, mockEnv)
    })

    it('should return rate limit metadata in response', async () => {
      // Send messages up to limit
      for (let i = 0; i < 5; i++) {
        await durableObject.fetch(new Request('http://localhost/chat/send', {
          method: 'POST',
          body: JSON.stringify({
            channelId: 'channel-1',
            playerId: 'player-123',
            username: 'TestPlayer',
            message: `Message ${i}`
          })
        }))
      }

      // Send one more to trigger rate limit
      const request = new Request('http://localhost/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: 'channel-1',
          playerId: 'player-123',
          username: 'TestPlayer',
          message: 'Over limit'
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(429)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Rate limit exceeded')
      expect(result.rateLimitInfo).toBeDefined()
      expect(result.rateLimitInfo.remaining).toBe(0)
      expect(result.rateLimitInfo.limit).toBe(5)
      expect(result.rateLimitInfo.resetAt).toBeGreaterThan(Date.now())
      expect(result.rateLimitInfo.retryAfter).toBeGreaterThan(0)
      expect(result.rateLimitInfo.retryAfter).toBeLessThanOrEqual(30)
    })

    it('should bypass rate limit for moderators', async () => {
      // Send more than rate limit allows as moderator
      for (let i = 0; i < 10; i++) {
        const request = new Request('http://localhost/chat/send', {
          method: 'POST',
          headers: {
            'X-Roles': 'moderator'
          },
          body: JSON.stringify({
            channelId: 'channel-1',
            playerId: 'mod-123',
            username: 'Moderator',
            message: `Moderator message ${i}`,
            roles: ['moderator']
          })
        })

        const response = await durableObject.fetch(request)
        const result = await response.json() as any

        expect(response.status).toBe(200)
        expect(result.success).toBe(true)
      }
    })

    it('should bypass rate limit for admins', async () => {
      // Send more than rate limit allows as admin
      for (let i = 0; i < 10; i++) {
        const request = new Request('http://localhost/chat/send', {
          method: 'POST',
          headers: {
            'X-Roles': 'admin'
          },
          body: JSON.stringify({
            channelId: 'channel-1',
            playerId: 'admin-123',
            username: 'Admin',
            message: `Admin message ${i}`,
            roles: ['admin']
          })
        })

        const response = await durableObject.fetch(request)
        const result = await response.json() as any

        expect(response.status).toBe(200)
        expect(result.success).toBe(true)
      }
    })

    it('should respect configured rate limits from environment', async () => {
      // Environment vars set to 5 messages per 30 seconds
      // Send 4 messages - should be fine
      for (let i = 0; i < 4; i++) {
        const response = await durableObject.fetch(new Request('http://localhost/chat/send', {
          method: 'POST',
          body: JSON.stringify({
            channelId: 'channel-1',
            playerId: 'player-456',
            username: 'TestPlayer2',
            message: `Message ${i}`
          })
        }))
        expect(response.status).toBe(200)
      }

      // 5th message should be fine
      const fifthResponse = await durableObject.fetch(new Request('http://localhost/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: 'channel-1',
          playerId: 'player-456',
          username: 'TestPlayer2',
          message: 'Message 5'
        })
      }))
      expect(fifthResponse.status).toBe(200)

      // 6th message should be rate limited
      const sixthResponse = await durableObject.fetch(new Request('http://localhost/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: 'channel-1',
          playerId: 'player-456',
          username: 'TestPlayer2',
          message: 'Message 6'
        })
      }))
      const result = await sixthResponse.json() as any
      expect(sixthResponse.status).toBe(429)
      expect(result.rateLimitInfo.limit).toBe(5)
    })

    it('should track rate limits per player', async () => {
      // Player 1 sends to limit
      for (let i = 0; i < 5; i++) {
        await durableObject.fetch(new Request('http://localhost/chat/send', {
          method: 'POST',
          body: JSON.stringify({
            channelId: 'channel-1',
            playerId: 'player-1',
            username: 'Player1',
            message: `P1 Message ${i}`
          })
        }))
      }

      // Player 1 is rate limited
      const p1Response = await durableObject.fetch(new Request('http://localhost/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: 'channel-1',
          playerId: 'player-1',
          username: 'Player1',
          message: 'P1 Over limit'
        })
      }))
      expect(p1Response.status).toBe(429)

      // But Player 2 can still send
      const p2Response = await durableObject.fetch(new Request('http://localhost/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: 'channel-1',
          playerId: 'player-2',
          username: 'Player2',
          message: 'P2 first message'
        })
      }))
      expect(p2Response.status).toBe(200)
    })

    it('should calculate correct retry after time', async () => {
      jest.useFakeTimers()
      const startTime = Date.now()
      jest.setSystemTime(startTime)

      // Send messages to hit rate limit
      for (let i = 0; i < 5; i++) {
        await durableObject.fetch(new Request('http://localhost/chat/send', {
          method: 'POST',
          body: JSON.stringify({
            channelId: 'channel-1',
            playerId: 'timer-player',
            username: 'TimerPlayer',
            message: `Message ${i}`
          })
        }))
      }

      // Try to send over limit
      const response = await durableObject.fetch(new Request('http://localhost/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: 'channel-1',
          playerId: 'timer-player',
          username: 'TimerPlayer',
          message: 'Over limit'
        })
      }))
      const result = await response.json() as any

      expect(result.rateLimitInfo.retryAfter).toBe(30) // Should match window (30 seconds)
      expect(result.rateLimitInfo.resetAt).toBe(startTime + 30000)

      jest.useRealTimers()
    })

    it('should allow messages after rate limit window expires', async () => {
      jest.useFakeTimers()

      // Fill rate limit
      for (let i = 0; i < 5; i++) {
        await durableObject.fetch(new Request('http://localhost/chat/send', {
          method: 'POST',
          body: JSON.stringify({
            channelId: 'channel-1',
            playerId: 'window-player',
            username: 'WindowPlayer',
            message: `Message ${i}`
          })
        }))
      }

      // Should be rate limited
      const limitedResponse = await durableObject.fetch(new Request('http://localhost/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: 'channel-1',
          playerId: 'window-player',
          username: 'WindowPlayer',
          message: 'Over limit'
        })
      }))
      expect(limitedResponse.status).toBe(429)

      // Advance time past window
      jest.advanceTimersByTime(31000) // 31 seconds

      // Should be able to send again
      const newResponse = await durableObject.fetch(new Request('http://localhost/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: 'channel-1',
          playerId: 'window-player',
          username: 'WindowPlayer',
          message: 'After window'
        })
      }))
      expect(newResponse.status).toBe(200)

      jest.useRealTimers()
    })
  })
})