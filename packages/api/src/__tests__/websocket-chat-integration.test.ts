/**
 * WebSocket Chat Integration Tests
 * 
 * Tests the integration between WebSocket manager and ChatModerator Durable Object
 * for real-time chat functionality.
 */

import { WebSocketManager } from '../websocket'
import { createWebSocketMessage, ChatMessage, WebSocketMessage } from '@primo-poker/shared'
import { AuthenticationManager } from '@primo-poker/security'
import { MockWebSocket, MockRequest, createMockWebSocketPair } from './websocket-test-utils'

// Mock ChatModerator Durable Object
class MockChatModeratorDurableObject {
  private messages: Map<string, any[]> = new Map()
  private connections: Map<string, WebSocket> = new Map()
  private rateLimits: Map<string, number[]> = new Map()

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    
    if (request.headers.get('Upgrade') === 'websocket') {
      // Handle WebSocket upgrade
      const playerId = request.headers.get('X-Player-ID') || 'test-player'
      const pair = createMockWebSocketPair()
      this.connections.set(playerId, pair.server)
      
      return new Response(null, {
        status: 101,
        webSocket: pair.client
      })
    }

    switch (url.pathname) {
      case '/chat/send':
        return this.handleSendMessage(request)
      case '/chat/history':
        return this.handleGetHistory(request)
      case '/chat/delete':
        return this.handleDeleteMessage(request)
      case '/chat/mute':
        return this.handleMuteUser(request)
      default:
        return new Response('Not Found', { status: 404 })
    }
  }

  private async handleSendMessage(request: Request): Promise<Response> {
    const body = await request.json() as any
    const { channelId, playerId, message } = body

    // Check rate limit
    const now = Date.now()
    const timestamps = this.rateLimits.get(playerId) || []
    const recentTimestamps = timestamps.filter(t => now - t < 60000) // 1 minute window
    
    if (recentTimestamps.length >= 10) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Rate limit exceeded. Please slow down.'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    recentTimestamps.push(now)
    this.rateLimits.set(playerId, recentTimestamps)

    // Store message
    const messageEntry = {
      id: `msg-${Date.now()}`,
      channelId,
      playerId,
      message,
      timestamp: now
    }

    const channelMessages = this.messages.get(channelId) || []
    channelMessages.push(messageEntry)
    this.messages.set(channelId, channelMessages)

    return new Response(JSON.stringify({
      success: true,
      data: {
        messageId: messageEntry.id,
        timestamp: messageEntry.timestamp
      }
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  private async handleGetHistory(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const channelId = url.searchParams.get('channelId')
    const limit = parseInt(url.searchParams.get('limit') || '50')

    const messages = this.messages.get(channelId!) || []
    const recentMessages = messages.slice(-limit)

    return new Response(JSON.stringify({
      success: true,
      data: {
        messages: recentMessages,
        count: recentMessages.length
      }
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  private async handleDeleteMessage(request: Request): Promise<Response> {
    const body = await request.json() as any
    const { messageId, channelId } = body

    const messages = this.messages.get(channelId) || []
    const messageIndex = messages.findIndex(m => m.id === messageId)
    
    if (messageIndex === -1) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Message not found'
      }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    }

    messages[messageIndex].deleted = true
    messages[messageIndex].deletedAt = Date.now()

    return new Response(JSON.stringify({
      success: true,
      data: { deleted: true }
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  private async handleMuteUser(request: Request): Promise<Response> {
    const body = await request.json() as any
    // Simple mute implementation for testing
    return new Response(JSON.stringify({
      success: true,
      data: {
        mutedUntil: Date.now() + 300000,
        duration: 300000
      }
    }), { headers: { 'Content-Type': 'application/json' } })
  }
}

// Extended WebSocketManager with chat support
class ChatEnabledWebSocketManager extends WebSocketManager {
  private chatModerator: MockChatModeratorDurableObject

  constructor(jwtSecret: string, chatModerator: MockChatModeratorDurableObject) {
    super(jwtSecret)
    this.chatModerator = chatModerator
  }

  async handleChatMessage(
    connectionId: string,
    message: ChatMessage
  ): Promise<void> {
    const connection = this.connections.get(connectionId)
    if (!connection) return

    try {
      // Forward to ChatModerator
      const response = await this.chatModerator.fetch(
        new Request('http://chat-moderator/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelId: `table-${connection.tableId}`,
            playerId: connection.playerId,
            username: connection.username,
            message: message.payload.message
          })
        })
      )

      if (!response.ok) {
        const error = await response.json() as any
        this.sendError(connectionId, error.error || 'Failed to send message')
        return
      }

      const result = await response.json() as any
      
      // Send confirmation to sender
      this.sendMessage(connectionId, createWebSocketMessage('chat_sent', {
        messageId: result.data.messageId,
        timestamp: result.data.timestamp
      }))

      // Broadcast to table
      const chatMessage: ChatMessage = createWebSocketMessage('chat', {
        playerId: connection.playerId,
        username: connection.username,
        message: message.payload.message,
        isSystem: false,
        messageId: result.data.messageId,
        timestamp: result.data.timestamp
      }) as ChatMessage

      this.broadcastToTable(connection.tableId, chatMessage)
    } catch (error) {
      this.sendError(connectionId, 'Failed to process chat message')
    }
  }

  // Make these methods accessible for testing
  public connections = new Map()
  protected sendError(connectionId: string, message: string): void {
    super.sendError(connectionId, message)
  }
  private sendMessage(connectionId: string, message: WebSocketMessage): void {
    const connection = this.connections.get(connectionId)
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) return
    connection.ws.send(JSON.stringify(message))
  }
  private broadcastToTable(tableId: string, message: WebSocketMessage): void {
    // Implementation inherited from parent
  }
}

describe('WebSocket Chat Integration', () => {
  let wsManager: ChatEnabledWebSocketManager
  let authManager: AuthenticationManager
  let chatModerator: MockChatModeratorDurableObject
  const jwtSecret = 'test-secret'

  beforeEach(() => {
    chatModerator = new MockChatModeratorDurableObject()
    wsManager = new ChatEnabledWebSocketManager(jwtSecret, chatModerator)
    authManager = new AuthenticationManager(jwtSecret)
  })

  describe('Chat Message Handling', () => {
    it('should send a chat message successfully', async () => {
      // Create authenticated connection
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      const request = new MockRequest(`ws://localhost?token=${token}&tableId=table-1`)
      
      await wsManager.handleConnection(server, request)

      // Send chat message
      const chatMessage: ChatMessage = createWebSocketMessage('chat', {
        playerId: 'player-123',
        username: 'TestPlayer',
        message: 'Hello, world!',
        isSystem: false
      }) as ChatMessage

      await server.simulateMessage(JSON.stringify(chatMessage))

      // Verify confirmation was sent
      const messages = client.getMessages()
      const confirmation = messages.find(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'chat_sent'
      })

      expect(confirmation).toBeDefined()
      const parsed = JSON.parse(confirmation!)
      expect(parsed.payload.messageId).toBeDefined()
      expect(parsed.payload.timestamp).toBeDefined()
    })

    it('should broadcast chat message to all table members', async () => {
      // Create two players at the same table
      const player1Token = await authManager.generateAccessToken({
        userId: 'player-1',
        username: 'Player1',
        email: 'player1@example.com'
      })

      const player2Token = await authManager.generateAccessToken({
        userId: 'player-2',
        username: 'Player2',
        email: 'player2@example.com'
      })

      const { client: client1, server: server1 } = createMockWebSocketPair()
      const { client: client2, server: server2 } = createMockWebSocketPair()

      await wsManager.handleConnection(server1, new MockRequest(`ws://localhost?token=${player1Token}&tableId=table-1`))
      await wsManager.handleConnection(server2, new MockRequest(`ws://localhost?token=${player2Token}&tableId=table-1`))

      // Player 1 sends a message
      const chatMessage: ChatMessage = createWebSocketMessage('chat', {
        playerId: 'player-1',
        username: 'Player1',
        message: 'Good game!',
        isSystem: false
      }) as ChatMessage

      await server1.simulateMessage(JSON.stringify(chatMessage))

      // Player 2 should receive the message
      const player2Messages = client2.getMessages()
      const receivedChat = player2Messages.find(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'chat' && parsed.payload.message === 'Good game!'
      })

      expect(receivedChat).toBeDefined()
      const parsed = JSON.parse(receivedChat!)
      expect(parsed.payload.playerId).toBe('player-1')
      expect(parsed.payload.username).toBe('Player1')
    })

    it('should handle rate limiting', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'spammer',
        username: 'Spammer',
        email: 'spam@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Send many messages quickly
      for (let i = 0; i < 12; i++) {
        const chatMessage: ChatMessage = createWebSocketMessage('chat', {
          playerId: 'spammer',
          username: 'Spammer',
          message: `Spam ${i}`,
          isSystem: false
        }) as ChatMessage

        await server.simulateMessage(JSON.stringify(chatMessage))
      }

      // Check for rate limit error
      const messages = client.getMessages()
      const errorMessage = messages.find(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'error' && parsed.payload.message.includes('Rate limit')
      })

      expect(errorMessage).toBeDefined()
    })

    it('should handle chat commands', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Send chat command
      const commandMessage: ChatMessage = createWebSocketMessage('chat', {
        playerId: 'player-123',
        username: 'TestPlayer',
        message: '/fold',
        isSystem: false
      }) as ChatMessage

      await server.simulateMessage(JSON.stringify(commandMessage))

      // Should process as both chat and command
      const messages = client.getMessages()
      expect(messages.length).toBeGreaterThan(0)
    })

    it('should retrieve chat history', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Send some messages first
      for (let i = 0; i < 5; i++) {
        const chatMessage: ChatMessage = createWebSocketMessage('chat', {
          playerId: 'player-123',
          username: 'TestPlayer',
          message: `Message ${i}`,
          isSystem: false
        }) as ChatMessage

        await server.simulateMessage(JSON.stringify(chatMessage))
      }

      // Request history
      const historyRequest = createWebSocketMessage('get_chat_history', {
        channelId: 'table-table-1',
        limit: 10
      })

      await server.simulateMessage(JSON.stringify(historyRequest))

      // Should receive history
      const messages = client.getMessages()
      const historyResponse = messages.find(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'chat_history'
      })

      expect(historyResponse).toBeDefined()
    })

    it('should handle message deletion', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Send a message
      const chatMessage: ChatMessage = createWebSocketMessage('chat', {
        playerId: 'player-123',
        username: 'TestPlayer',
        message: 'Delete this',
        isSystem: false
      }) as ChatMessage

      await server.simulateMessage(JSON.stringify(chatMessage))

      // Get the message ID from confirmation
      const messages = client.getMessages()
      const confirmation = messages.find(m => JSON.parse(m).type === 'chat_sent')
      const messageId = JSON.parse(confirmation!).payload.messageId

      // Delete the message
      const deleteRequest = createWebSocketMessage('delete_chat_message', {
        messageId,
        channelId: 'table-table-1'
      })

      await server.simulateMessage(JSON.stringify(deleteRequest))

      // Should receive deletion confirmation
      const deleteConfirmation = messages.find(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'chat_message_deleted'
      })

      expect(deleteConfirmation).toBeDefined()
    })

    it('should handle system messages', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Simulate system message (e.g., player joined)
      wsManager.broadcastSystemMessage('table-1', 'Player2 joined the table')

      // Should receive system message
      const messages = client.getMessages()
      const systemMessage = messages.find(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'chat' && parsed.payload.isSystem === true
      })

      expect(systemMessage).toBeDefined()
      const parsed = JSON.parse(systemMessage!)
      expect(parsed.payload.message).toBe('Player2 joined the table')
    })

    it('should handle mute functionality', async () => {
      const adminToken = await authManager.generateAccessToken({
        userId: 'admin-1',
        username: 'Admin',
        email: 'admin@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${adminToken}&tableId=table-1`))

      // Mute a player
      const muteRequest = createWebSocketMessage('mute_player', {
        playerId: 'player-123',
        duration: 300000, // 5 minutes
        reason: 'Spamming'
      })

      await server.simulateMessage(JSON.stringify(muteRequest))

      // Should receive mute confirmation
      const messages = client.getMessages()
      const muteConfirmation = messages.find(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'player_muted'
      })

      expect(muteConfirmation).toBeDefined()
    })

    it('should sanitize chat messages', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Send message with potentially harmful content
      const chatMessage: ChatMessage = createWebSocketMessage('chat', {
        playerId: 'player-123',
        username: 'TestPlayer',
        message: '<script>alert("xss")</script>Hello',
        isSystem: false
      }) as ChatMessage

      await server.simulateMessage(JSON.stringify(chatMessage))

      // Message should be sanitized in broadcast
      const messages = client.getMessages()
      const broadcastMessage = messages.find(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'chat' && parsed.payload.message
      })

      expect(broadcastMessage).toBeDefined()
      const parsed = JSON.parse(broadcastMessage!)
      expect(parsed.payload.message).not.toContain('<script>')
    })

    it('should handle connection cleanup on disconnect', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Close connection
      server.close()

      // Verify cleanup
      expect(wsManager.getActiveConnections()).toBe(0)
    })
  })

  describe('Chat History and Pagination', () => {
    it('should paginate chat history', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Send many messages
      for (let i = 0; i < 25; i++) {
        const chatMessage: ChatMessage = createWebSocketMessage('chat', {
          playerId: 'player-123',
          username: 'TestPlayer',
          message: `Message ${i}`,
          isSystem: false
        }) as ChatMessage

        await server.simulateMessage(JSON.stringify(chatMessage))
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      // Request paginated history
      const historyRequest = createWebSocketMessage('get_chat_history', {
        channelId: 'table-table-1',
        limit: 10,
        offset: 10
      })

      await server.simulateMessage(JSON.stringify(historyRequest))

      const messages = client.getMessages()
      const historyResponse = messages.find(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'chat_history'
      })

      expect(historyResponse).toBeDefined()
      const parsed = JSON.parse(historyResponse!)
      expect(parsed.payload.messages.length).toBeLessThanOrEqual(10)
    })

    it('should filter chat history by time range', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      const startTime = Date.now()

      // Send messages
      for (let i = 0; i < 5; i++) {
        const chatMessage: ChatMessage = createWebSocketMessage('chat', {
          playerId: 'player-123',
          username: 'TestPlayer',
          message: `Message ${i}`,
          isSystem: false
        }) as ChatMessage

        await server.simulateMessage(JSON.stringify(chatMessage))
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      const endTime = Date.now()

      // Request history with time filter
      const historyRequest = createWebSocketMessage('get_chat_history', {
        channelId: 'table-table-1',
        startTime,
        endTime
      })

      await server.simulateMessage(JSON.stringify(historyRequest))

      const messages = client.getMessages()
      const historyResponse = messages.find(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'chat_history'
      })

      expect(historyResponse).toBeDefined()
    })
  })

  describe('Message Delivery Confirmation', () => {
    it('should confirm message delivery', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Send message with delivery confirmation request
      const chatMessage: ChatMessage = createWebSocketMessage('chat', {
        playerId: 'player-123',
        username: 'TestPlayer',
        message: 'Confirm this',
        isSystem: false,
        requestConfirmation: true
      }) as ChatMessage

      await server.simulateMessage(JSON.stringify(chatMessage))

      // Should receive delivery confirmation
      const messages = client.getMessages()
      const deliveryConfirmation = messages.find(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'chat_delivered'
      })

      expect(deliveryConfirmation).toBeDefined()
    })

    it('should handle delivery failure', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Simulate message that will fail (e.g., too long)
      const longMessage = 'a'.repeat(1000)
      const chatMessage: ChatMessage = createWebSocketMessage('chat', {
        playerId: 'player-123',
        username: 'TestPlayer',
        message: longMessage,
        isSystem: false,
        requestConfirmation: true
      }) as ChatMessage

      await server.simulateMessage(JSON.stringify(chatMessage))

      // Should receive delivery failure
      const messages = client.getMessages()
      const deliveryFailure = messages.find(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'error' || parsed.type === 'chat_delivery_failed'
      })

      expect(deliveryFailure).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    it('should handle malformed chat messages', async () => {
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await wsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Send malformed message
      await server.simulateMessage('invalid json')

      // Should receive error
      const messages = client.getMessages()
      const errorMessage = messages.find(m => {
        try {
          const parsed = JSON.parse(m)
          return parsed.type === 'error'
        } catch {
          return false
        }
      })

      expect(errorMessage).toBeDefined()
    })

    it('should handle chat moderator unavailability', async () => {
      // Create a failing chat moderator
      const failingModerator = {
        fetch: async () => new Response('Service Unavailable', { status: 503 })
      }
      
      const failingWsManager = new ChatEnabledWebSocketManager(jwtSecret, failingModerator as any)
      
      const token = await authManager.generateAccessToken({
        userId: 'player-123',
        username: 'TestPlayer',
        email: 'test@example.com'
      })

      const { client, server } = createMockWebSocketPair()
      await failingWsManager.handleConnection(server, new MockRequest(`ws://localhost?token=${token}&tableId=table-1`))

      // Try to send message
      const chatMessage: ChatMessage = createWebSocketMessage('chat', {
        playerId: 'player-123',
        username: 'TestPlayer',
        message: 'This should fail',
        isSystem: false
      }) as ChatMessage

      await server.simulateMessage(JSON.stringify(chatMessage))

      // Should receive error
      const messages = client.getMessages()
      const errorMessage = messages.find(m => {
        const parsed = JSON.parse(m)
        return parsed.type === 'error'
      })

      expect(errorMessage).toBeDefined()
    })
  })
})