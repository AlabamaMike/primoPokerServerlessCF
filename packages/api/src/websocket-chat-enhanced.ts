/**
 * Enhanced WebSocket Manager with Chat Integration
 * 
 * Extends the base WebSocket manager to integrate with ChatModerator Durable Object
 * for real-time chat functionality with persistence and moderation.
 */

import {
  WebSocketMessage,
  ChatMessage,
  createWebSocketMessage,
  ValidationUtils,
} from '@primo-poker/shared'
import { WebSocketManager, WebSocketConnection } from './websocket'
import { ChatPersistenceRepository, ChatHistoryParams } from './repositories/chat-repository'
import { DurableObjectNamespace, D1Database } from '@cloudflare/workers-types'

export interface ChatWebSocketEnv {
  CHAT_MODERATOR: DurableObjectNamespace
  DB: D1Database
  JWT_SECRET: string
}

interface ExtendedWebSocketConnection extends WebSocketConnection {
  roles?: string[]
}

interface ExtendedChatMessage extends ChatMessage {
  payload: ChatMessage['payload'] & {
    requestConfirmation?: boolean
    messageId?: string
    timestamp?: number
  }
}

export interface ChatHistoryRequest {
  channelId: string
  limit?: number
  offset?: number
  startTime?: number
  endTime?: number
}

export interface ChatCommand {
  command: string
  args: string[]
}

export class ChatEnhancedWebSocketManager extends WebSocketManager {
  private chatModerator: DurableObjectNamespace
  private chatRepository: ChatPersistenceRepository
  private messageQueue = new Map<string, QueuedMessage[]>()
  private deliveryConfirmations = new Map<string, DeliveryConfirmation>()

  constructor(env: ChatWebSocketEnv) {
    super(env.JWT_SECRET)
    this.chatModerator = env.CHAT_MODERATOR
    this.chatRepository = new ChatPersistenceRepository(env.DB)
  }

  /**
   * Get connection information by connection ID
   */
  private getConnectionInfo(connectionId: string): ExtendedWebSocketConnection | undefined {
    // This method would need to be added to the parent class or connections made protected
    // For now, we'll use a workaround by accessing via reflection
    const connection = (this as any).connections.get(connectionId) as ExtendedWebSocketConnection
    return connection
  }

  /**
   * Check if connection has admin privileges
   */
  private isAdmin(connection: ExtendedWebSocketConnection): boolean {
    return connection.roles?.includes('admin') || false
  }

  /**
   * Wrapper for parent's private sendMessage method
   */
  protected sendMessage(connectionId: string, message: WebSocketMessage): void {
    (this as any).sendMessage(connectionId, message)
  }

  /**
   * Wrapper for parent's private broadcastToTable method
   */
  protected broadcastToTable(tableId: string, message: WebSocketMessage, excludeConnectionId?: string): void {
    (this as any).broadcastToTable(tableId, message, excludeConnectionId)
  }

  /**
   * Wrapper for parent's private handlePlayerAction method
   */
  private async handlePlayerAction(connectionId: string, message: any): Promise<void> {
    await (this as any).handlePlayerAction(connectionId, message)
  }

  /**
   * Handle chat-specific messages
   */
  async handleChatSpecificMessage(connectionId: string, messageData: string): Promise<void> {
    const connection = this.connections.get(connectionId)
    if (!connection) return

    try {
      const message: WebSocketMessage = JSON.parse(messageData)
      if (connection) {
        connection.lastActivity = new Date()
      }

      switch (message.type) {
        case 'chat':
          await this.handleEnhancedChatMessage(connectionId, message as ExtendedChatMessage)
          break
        case 'get_chat_history':
          await this.handleGetChatHistory(connectionId, message.payload as ChatHistoryRequest)
          break
        case 'delete_chat_message':
          await this.handleDeleteChatMessage(connectionId, message.payload as { messageId: string; channelId: string })
          break
        case 'mute_player':
          await this.handleMutePlayer(connectionId, message.payload as { playerId: string; reason: string; duration?: number })
          break
        case 'report_message':
          await this.handleReportMessage(connectionId, message.payload as { messageId: string; reason: string })
          break
        default:
          // Unknown message type
          this.sendError(connectionId, 'Unknown message type')
      }
    } catch (error) {
      this.sendError(connectionId, 'Invalid message format')
    }
  }

  /**
   * Handle incoming chat messages with enhancements
   */
  private async handleEnhancedChatMessage(connectionId: string, message: ExtendedChatMessage): Promise<void> {
    // Get connection info via a method we'll add
    const connectionInfo = this.getConnectionInfo(connectionId)
    if (!connectionInfo) return

    try {
      // Parse for commands
      if (message.payload.message.startsWith('/')) {
        await this.handleChatCommand(connectionId, message)
        return
      }

      // Sanitize the message content
      const sanitizedMessage = ValidationUtils.sanitizeChatMessage(message.payload.message)
      if (!sanitizedMessage.trim()) {
        this.sendError(connectionId, 'Empty message')
        return
      }

      // Get or create ChatModerator instance for the table
      const chatModeratorId = this.chatModerator.idFromName(`table-${connectionInfo.tableId}`)
      const chatModeratorStub = this.chatModerator.get(chatModeratorId)

      // Forward message to ChatModerator
      const response = await chatModeratorStub.fetch(
        'https://chat-moderator/chat/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Player-ID': connectionInfo.playerId,
            'X-Username': connectionInfo.username,
          },
          body: JSON.stringify({
            channelId: `table-${connectionInfo.tableId}`,
            playerId: connectionInfo.playerId,
            username: connectionInfo.username,
            message: sanitizedMessage,
          }),
        }
      )

      if (!response.ok) {
        const error = await response.json() as any
        this.sendError(connectionId, error.error || 'Failed to send message')
        return
      }

      const result = await response.json() as any
      const messageId = result.data.messageId
      const timestamp = result.data.timestamp

      // Store in message queue for reliability
      this.queueMessage(connectionId, {
        id: messageId,
        message,
        timestamp,
        attempts: 0,
      })

      // Persist to D1
      await this.chatRepository.saveMessage({
        id: messageId,
        playerId: connectionInfo.playerId,
        tableId: connectionInfo.tableId,
        message: sanitizedMessage,
        messageType: 'chat',
      })

      // Send delivery confirmation if requested
      if (message.payload.requestConfirmation) {
        this.sendDeliveryConfirmation(connectionId, messageId, 'sent')
      }

      // Broadcast to all table members
      const broadcastMessage: ChatMessage = createWebSocketMessage('chat', {
        ...message.payload,
        messageId,
        timestamp,
      }) as ChatMessage

      this.broadcastToTable(connectionInfo.tableId, broadcastMessage)

      // Remove from queue after successful broadcast
      this.dequeueMessage(connectionId, messageId)

      // Send final delivery confirmation
      if (message.payload.requestConfirmation) {
        this.sendDeliveryConfirmation(connectionId, messageId, 'delivered')
      }
    } catch (error) {
      console.error('Chat message error:', error)
      this.sendError(connectionId, 'Failed to process chat message')
    }
  }

  /**
   * Handle chat commands (e.g., /fold, /mute, etc.)
   */
  private async handleChatCommand(connectionId: string, message: ExtendedChatMessage): Promise<void> {
    const connectionInfo = this.getConnectionInfo(connectionId)
    if (!connectionInfo) return

    const commandText = message.payload.message.substring(1).trim()
    const [command, ...args] = commandText.split(' ')

    switch (command?.toLowerCase()) {
      case 'fold':
      case 'check':
      case 'call':
      case 'raise':
      case 'allin':
        // Forward as player action
        await this.handlePlayerAction(connectionId, {
          type: 'player_action',
          payload: {
            playerId: connectionInfo.playerId,
            action: command?.toLowerCase() as any,
            amount: args[0] ? parseFloat(args[0]) : undefined,
          },
        } as any)
        break

      case 'help':
        this.sendSystemMessage(connectionId, 
          'Available commands: /fold, /check, /call, /raise [amount], /allin, /history, /mute [player], /report [messageId]'
        )
        break

      case 'history':
        await this.handleGetChatHistory(connectionId, {
          channelId: `table-${connectionInfo.tableId}`,
          limit: 20,
        })
        break

      case 'mute':
        if (args.length === 0) {
          this.sendSystemMessage(connectionId, 'Usage: /mute [player]')
          return
        }
        await this.handleMutePlayer(connectionId, { 
          playerId: args[0] || '',
          reason: args.slice(1).join(' ') || 'No reason provided',
        })
        break

      case 'report':
        if (args.length === 0) {
          this.sendSystemMessage(connectionId, 'Usage: /report [messageId] [reason]')
          return
        }
        await this.handleReportMessage(connectionId, {
          messageId: args[0] || '',
          reason: args.slice(1).join(' ') || 'No reason provided',
        })
        break

      default:
        this.sendSystemMessage(connectionId, `Unknown command: /${command || ''}`)
    }
  }

  /**
   * Handle chat history request
   */
  private async handleGetChatHistory(
    connectionId: string,
    request: ChatHistoryRequest
  ): Promise<void> {
    const connectionInfo = this.getConnectionInfo(connectionId)
    if (!connectionInfo) return

    try {
      // Get history from D1
      const params: ChatHistoryParams = {
        tableId: connectionInfo.tableId,
        limit: request.limit || 50
      }
      if (request.offset !== undefined) params.offset = request.offset
      if (request.startTime !== undefined) params.startTime = request.startTime
      if (request.endTime !== undefined) params.endTime = request.endTime
      
      const messages = await this.chatRepository.getMessageHistory(params)

      // Send history to requester
      this.sendMessage(connectionId, createWebSocketMessage('chat_history', {
        channelId: request.channelId,
        messages: messages.map(m => ({
          id: m.id,
          playerId: m.player_id,
          username: (m as any).username || 'Unknown',
          message: m.message,
          timestamp: m.created_at,
          isSystem: m.message_type === 'system',
          isModerated: m.is_moderated,
        })),
        hasMore: messages.length === (request.limit || 50),
      }))
    } catch (error) {
      this.sendError(connectionId, 'Failed to retrieve chat history')
    }
  }

  /**
   * Handle message deletion
   */
  private async handleDeleteChatMessage(
    connectionId: string,
    payload: { messageId: string; channelId: string }
  ): Promise<void> {
    const connectionInfo = this.getConnectionInfo(connectionId)
    if (!connectionInfo) return

    try {
      const chatModeratorId = this.chatModerator.idFromName(payload.channelId)
      const chatModeratorStub = this.chatModerator.get(chatModeratorId)

      const response = await chatModeratorStub.fetch(
        'https://chat-moderator/chat/delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Player-ID': connectionInfo.playerId,
          },
          body: JSON.stringify({
            messageId: payload.messageId,
            channelId: payload.channelId,
            deletedBy: connectionInfo.playerId,
            isAdmin: this.isAdmin(connectionInfo),
          }),
        }
      )

      if (!response.ok) {
        const error = await response.json() as any
        this.sendError(connectionId, error.error || 'Failed to delete message')
        return
      }

      // Broadcast deletion to all table members
      this.broadcastToTable(connectionInfo.tableId, createWebSocketMessage('chat_message_deleted', {
        messageId: payload.messageId,
        deletedBy: connectionInfo.playerId,
        timestamp: Date.now(),
      }))

      // Send confirmation to deleter
      this.sendMessage(connectionId, createWebSocketMessage('chat_message_deleted', {
        messageId: payload.messageId,
        success: true,
      }))
    } catch (error) {
      this.sendError(connectionId, 'Failed to delete message')
    }
  }

  /**
   * Handle player mute request
   */
  private async handleMutePlayer(
    connectionId: string,
    payload: { playerId: string; reason: string; duration?: number }
  ): Promise<void> {
    const connectionInfo = this.getConnectionInfo(connectionId)
    if (!connectionInfo) return

    // Check if user has permission to mute (admin only)
    if (!this.isAdmin(connectionInfo)) {
      this.sendError(connectionId, 'Insufficient permissions to mute players')
      return
    }

    try {
      const chatModeratorId = this.chatModerator.idFromName(`table-${connectionInfo.tableId}`)
      const chatModeratorStub = this.chatModerator.get(chatModeratorId)

      const response = await chatModeratorStub.fetch(
        'https://chat-moderator/chat/mute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Player-ID': connectionInfo.playerId,
          },
          body: JSON.stringify({
            playerId: payload.playerId,
            username: (() => {
              // Attempt to find the username from active connections
              const connections = Array.from((this as any).connections.values()) as WebSocketConnection[]
              const targetConnection = connections.find(
                (conn) => conn.playerId === payload.playerId
              )
              return targetConnection?.username || 'Unknown'
            })(),
            mutedBy: connectionInfo.playerId,
            duration: payload.duration,
            reason: payload.reason,
            channelId: `table-${connectionInfo.tableId}`,
          }),
        }
      )

      if (!response.ok) {
        const error = await response.json() as any
        this.sendError(connectionId, error.error || 'Failed to mute player')
        return
      }

      const result = await response.json() as any

      // Notify all table members
      this.broadcastToTable(connectionInfo.tableId, createWebSocketMessage('player_muted', {
        playerId: payload.playerId,
        mutedBy: connectionInfo.playerId,
        duration: result.data.duration,
        reason: payload.reason,
        mutedUntil: result.data.mutedUntil,
      }))
    } catch (error) {
      this.sendError(connectionId, 'Failed to mute player')
    }
  }

  /**
   * Handle message report
   */
  private async handleReportMessage(
    connectionId: string,
    payload: { messageId: string; reason: string }
  ): Promise<void> {
    const connectionInfo = this.getConnectionInfo(connectionId)
    if (!connectionInfo) return

    try {
      const chatModeratorId = this.chatModerator.idFromName(`table-${connectionInfo.tableId}`)
      const chatModeratorStub = this.chatModerator.get(chatModeratorId)

      const response = await chatModeratorStub.fetch(
        'https://chat-moderator/chat/report', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messageId: payload.messageId,
            reportedBy: connectionInfo.playerId,
            reason: payload.reason,
          }),
        }
      )

      if (!response.ok) {
        const error = await response.json() as any
        this.sendError(connectionId, error.error || 'Failed to report message')
        return
      }

      // Send confirmation to reporter
      this.sendMessage(connectionId, createWebSocketMessage('message_reported', {
        messageId: payload.messageId,
        success: true,
      }))
    } catch (error) {
      this.sendError(connectionId, 'Failed to report message')
    }
  }

  /**
   * Send system message to a specific connection
   */
  private sendSystemMessage(connectionId: string, message: string): void {
    const systemMessage: ChatMessage = createWebSocketMessage('chat', {
      playerId: 'system',
      username: 'System',
      message,
      isSystem: true,
      timestamp: Date.now(),
    }) as ChatMessage

    this.sendMessage(connectionId, systemMessage)
  }

  /**
   * Send delivery confirmation
   */
  private sendDeliveryConfirmation(
    connectionId: string,
    messageId: string,
    status: 'sent' | 'delivered' | 'failed'
  ): void {
    this.sendMessage(connectionId, createWebSocketMessage('chat_delivered', {
      messageId,
      status,
      timestamp: Date.now(),
    }))
  }

  /**
   * Queue message for reliability
   */
  private queueMessage(connectionId: string, message: QueuedMessage): void {
    const queue = this.messageQueue.get(connectionId) || []
    queue.push(message)
    this.messageQueue.set(connectionId, queue)
  }

  /**
   * Remove message from queue
   */
  private dequeueMessage(connectionId: string, messageId: string): void {
    const queue = this.messageQueue.get(connectionId)
    if (!queue) return

    const filtered = queue.filter(m => m.id !== messageId)
    if (filtered.length > 0) {
      this.messageQueue.set(connectionId, filtered)
    } else {
      this.messageQueue.delete(connectionId)
    }
  }

  /**
   * Retry failed messages
   */
  private async retryFailedMessages(connectionId: string): Promise<void> {
    const queue = this.messageQueue.get(connectionId)
    if (!queue) return

    for (const queuedMessage of queue) {
      if (queuedMessage.attempts < 3) {
        queuedMessage.attempts++
        // Retry logic here
      } else {
        // Mark as failed
        this.sendDeliveryConfirmation(connectionId, queuedMessage.id, 'failed')
        this.dequeueMessage(connectionId, queuedMessage.id)
      }
    }
  }

  /**
   * Clean up on disconnection
   */
  private handleEnhancedDisconnection(connectionId: string): void {
    // Clean up message queue
    this.messageQueue.delete(connectionId)
    this.deliveryConfirmations.delete(connectionId)
    
    // Call parent cleanup
    const parentHandleDisconnection = (this as any).handleDisconnection
    if (typeof parentHandleDisconnection === 'function') {
      parentHandleDisconnection.call(this, connectionId)
    }
  }

  /**
   * Get chat statistics
   */
  public async getChatStats(tableId?: string): Promise<any> {
    return this.chatRepository.getMessageStats(tableId)
  }
}

interface QueuedMessage {
  id: string
  message: ChatMessage
  timestamp: number
  attempts: number
}

interface DeliveryConfirmation {
  messageId: string
  status: 'pending' | 'sent' | 'delivered' | 'failed'
  timestamp: number
}