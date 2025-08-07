/**
 * ChatModerator Durable Object - Phase 2
 * 
 * Manages chat moderation, filtering, rate limiting, and message history.
 * Provides real-time chat capabilities with content moderation.
 */

import { 
  createWebSocketMessage,
  WebSocketMessage,
  ChatMessage
} from '@primo-poker/shared'
import { logger } from '@primo-poker/core'
import { MetricsCollector, DurableObjectHealthMetric } from './monitoring/metrics'

export interface ChatModeratorState {
  messages: Map<string, ChatHistoryEntry[]> // channelId -> messages
  mutedUsers: Map<string, MutedUser>
  bannedWords: Set<string>
  warningCounts: Map<string, number> // playerId -> warning count
  reportedMessages: Map<string, ReportedMessage>
  channelConfigs: Map<string, ChannelConfig>
  createdAt: number
  lastUpdated: number
  totalMessages: number
  moderationStats: ModerationStats
}

export interface ChatHistoryEntry {
  id: string
  channelId: string
  playerId: string
  username: string
  message: string
  timestamp: number
  edited?: boolean
  editedAt?: number
  deleted?: boolean
  deletedAt?: number
  deletedBy?: string
  flagged?: boolean
  flagReason?: string
}

export interface MutedUser {
  playerId: string
  username: string
  mutedBy: string
  mutedAt: number
  mutedUntil: number
  reason: string
  channelId?: string // Optional - if not set, muted globally
}

export interface ReportedMessage {
  messageId: string
  reportedBy: string
  reportedAt: number
  reason: string
  status: 'pending' | 'reviewed' | 'actioned'
  reviewedBy?: string
  reviewedAt?: number
  action?: string
}

export interface ChannelConfig {
  channelId: string
  name: string
  type: 'table' | 'lobby' | 'tournament' | 'private'
  slowMode?: number // Seconds between messages
  memberOnly?: boolean
  maxMessageLength?: number
  allowedEmojis?: boolean
  allowedLinks?: boolean
  autoModeration?: boolean
}

export interface ModerationStats {
  messagesModerated: number
  warningsIssued: number
  usersMuted: number
  messagesDeleted: number
  reportsReceived: number
  falsePositives: number
}

export interface ChatWebSocketConnection {
  websocket: WebSocket
  playerId: string
  username: string
  channels: Set<string>
  connectedAt: number
  lastActivity: number
  isAdmin: boolean
}

export interface MessageFilter {
  channelId?: string
  playerId?: string
  startTime?: number
  endTime?: number
  includeDeleted?: boolean
  limit?: number
}

export class ChatModeratorDurableObject {
  private state: ChatModeratorState
  private durableObjectState: DurableObjectState
  private env: any
  private initialized: boolean = false
  private connections: Map<string, ChatWebSocketConnection> = new Map()
  private rateLimiter: Map<string, number[]> = new Map() // playerId -> timestamps
  private metrics?: MetricsCollector

  // Constants
  private static readonly MAX_MESSAGE_LENGTH = 500
  private static readonly MAX_MESSAGES_PER_CHANNEL = 1000
  private static readonly RATE_LIMIT_MESSAGES = 10
  private static readonly RATE_LIMIT_WINDOW = 60000 // 1 minute
  private static readonly WARNING_THRESHOLD = 3
  private static readonly MUTE_DURATION_FIRST = 5 * 60 * 1000 // 5 minutes
  private static readonly MUTE_DURATION_REPEAT = 30 * 60 * 1000 // 30 minutes
  private static readonly CLEANUP_INTERVAL = 60 * 60 * 1000 // 1 hour
  private static readonly MESSAGE_RETENTION = 24 * 60 * 60 * 1000 // 24 hours

  // Default banned words (would be configurable in production)
  private static readonly DEFAULT_BANNED_WORDS = new Set([
    'spam', 'scam', 'phishing', 'hack', 'cheat'
  ])

  constructor(state: DurableObjectState, env: any) {
    this.durableObjectState = state
    this.env = env
    
    // Initialize state
    this.state = {
      messages: new Map(),
      mutedUsers: new Map(),
      bannedWords: new Set(ChatModeratorDurableObject.DEFAULT_BANNED_WORDS),
      warningCounts: new Map(),
      reportedMessages: new Map(),
      channelConfigs: new Map(),
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      totalMessages: 0,
      moderationStats: {
        messagesModerated: 0,
        warningsIssued: 0,
        usersMuted: 0,
        messagesDeleted: 0,
        reportsReceived: 0,
        falsePositives: 0
      }
    }

    // Initialize metrics if available
    if (env.DB && env.KV) {
      this.metrics = new MetricsCollector(env.DB, env.KV)
    }

    // Start cleanup interval
    this.startCleanupInterval()
  }

  /**
   * Handle HTTP requests
   */
  async fetch(request: Request): Promise<Response> {
    const startTime = Date.now()
    
    try {
      await this.initializeState()
      
      const url = new URL(request.url)
      const path = url.pathname

      // Handle WebSocket upgrade
      if (request.headers.get('Upgrade') === 'websocket') {
        return this.handleWebSocketUpgrade(request)
      }

      // REST API endpoints
      let response: Response
      switch (path) {
        case '/chat/send':
          response = await this.handleSendMessage(request)
          break
        case '/chat/history':
          response = await this.handleGetHistory(request)
          break
        case '/chat/report':
          response = await this.handleReportMessage(request)
          break
        case '/chat/delete':
          response = await this.handleDeleteMessage(request)
          break
        case '/chat/mute':
          response = await this.handleMuteUser(request)
          break
        case '/chat/unmute':
          response = await this.handleUnmuteUser(request)
          break
        case '/chat/config':
          response = await this.handleChannelConfig(request)
          break
        case '/chat/stats':
          response = await this.handleGetStats(request)
          break
        case '/health':
          response = await this.handleHealthCheck(request)
          break
        default:
          response = new Response('Not Found', { status: 404 })
      }

      // Record metrics
      if (this.metrics) {
        const responseTime = Date.now() - startTime
        await this.metrics.recordResponseTime(responseTime, path)
      }

      return response
    } catch (error) {
      logger.error('ChatModerator error:', error as Error)
      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  /**
   * Initialize state from storage
   */
  private async initializeState(): Promise<void> {
    if (this.initialized) return

    try {
      const savedState = await this.durableObjectState.storage.get('chatState') as ChatModeratorState | undefined
      if (savedState) {
        this.state = {
          ...savedState,
          messages: new Map(Object.entries(savedState.messages || {})),
          mutedUsers: new Map(Object.entries(savedState.mutedUsers || {})),
          bannedWords: new Set(savedState.bannedWords || ChatModeratorDurableObject.DEFAULT_BANNED_WORDS),
          warningCounts: new Map(Object.entries(savedState.warningCounts || {})),
          reportedMessages: new Map(Object.entries(savedState.reportedMessages || {})),
          channelConfigs: new Map(Object.entries(savedState.channelConfigs || {}))
        }
        logger.info('Loaded saved chat state', { 
          channelCount: this.state.messages.size,
          totalMessages: this.state.totalMessages 
        })
      }
    } catch (error) {
      logger.error('Failed to load saved chat state:', error as Error)
    }

    this.initialized = true
  }

  /**
   * Save state to storage
   */
  private async saveState(): Promise<void> {
    try {
      const stateToSave = {
        ...this.state,
        messages: Object.fromEntries(this.state.messages),
        mutedUsers: Object.fromEntries(this.state.mutedUsers),
        bannedWords: Array.from(this.state.bannedWords),
        warningCounts: Object.fromEntries(this.state.warningCounts),
        reportedMessages: Object.fromEntries(this.state.reportedMessages),
        channelConfigs: Object.fromEntries(this.state.channelConfigs),
        lastUpdated: Date.now()
      }

      await this.durableObjectState.storage.put('chatState', stateToSave)
    } catch (error) {
      logger.error('Failed to save chat state:', error as Error)
    }
  }

  /**
   * Handle WebSocket upgrade
   */
  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    try {
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket]

      // Accept the WebSocket
      this.durableObjectState.acceptWebSocket(server)

      // Extract user info
      const playerId = request.headers.get('X-Player-ID') || crypto.randomUUID()
      const username = request.headers.get('X-Username') || `User_${playerId.substring(0, 8)}`
      const isAdmin = request.headers.get('X-Is-Admin') === 'true'

      // Store connection
      const connection: ChatWebSocketConnection = {
        websocket: server,
        playerId,
        username,
        channels: new Set(),
        connectedAt: Date.now(),
        lastActivity: Date.now(),
        isAdmin
      }
      this.connections.set(playerId, connection)

      // Send welcome message
      this.sendMessage(server, createWebSocketMessage('chat_connected', {
        playerId,
        username,
        timestamp: Date.now()
      }))

      logger.info('Chat WebSocket connected', { playerId, username })

      return new Response(null, {
        status: 101,
        webSocket: client,
      })
    } catch (error) {
      logger.error('WebSocket upgrade error:', error as Error)
      return new Response('WebSocket upgrade failed', { status: 500 })
    }
  }

  /**
   * Handle WebSocket messages
   */
  async webSocketMessage(websocket: WebSocket, message: string): Promise<void> {
    try {
      const data = JSON.parse(message)
      const { type, payload } = data

      // Find connection
      const connection = this.findConnection(websocket)
      if (!connection) {
        logger.warn('WebSocket message from unknown connection')
        return
      }

      // Update activity
      connection.lastActivity = Date.now()

      switch (type) {
        case 'join_channel':
          await this.handleJoinChannel(connection, payload.channelId)
          break

        case 'leave_channel':
          await this.handleLeaveChannel(connection, payload.channelId)
          break

        case 'send_message':
          await this.handleWebSocketMessage(connection, payload)
          break

        case 'edit_message':
          await this.handleEditMessage(connection, payload)
          break

        case 'get_history':
          await this.sendChannelHistory(connection, payload.channelId, payload.limit)
          break

        case 'heartbeat':
          this.sendMessage(websocket, createWebSocketMessage('heartbeat_ack', { timestamp: Date.now() }))
          break

        default:
          logger.warn(`Unknown WebSocket message type: ${type}`)
      }
    } catch (error) {
      logger.error('Error processing WebSocket message:', error as Error)
      this.sendError(websocket, 'Failed to process message')
    }
  }

  /**
   * Handle WebSocket close
   */
  async webSocketClose(websocket: WebSocket, code: number, reason: string): Promise<void> {
    const connection = this.findConnection(websocket)
    if (connection) {
      // Notify channels that user left
      for (const channelId of connection.channels) {
        await this.broadcastToChannel(channelId, createWebSocketMessage('user_left_chat', {
          channelId,
          playerId: connection.playerId,
          username: connection.username,
          timestamp: Date.now()
        }), connection.playerId)
      }

      this.connections.delete(connection.playerId)
      logger.info('Chat WebSocket disconnected', { 
        playerId: connection.playerId, 
        code, 
        reason 
      })
    }
  }

  /**
   * Handle sending a message via REST
   */
  private async handleSendMessage(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const body = await request.json() as {
      channelId: string
      playerId: string
      username: string
      message: string
    }

    const result = await this.processMessage(body)

    if (!result.success) {
      return new Response(JSON.stringify({
        success: false,
        error: result.error
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        messageId: result.messageId,
        timestamp: result.timestamp
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Handle getting message history
   */
  private async handleGetHistory(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const channelId = url.searchParams.get('channelId')
    const playerId = url.searchParams.get('playerId')
    const startTimeStr = url.searchParams.get('startTime')
    const endTimeStr = url.searchParams.get('endTime')
    
    const filter: MessageFilter = {
      ...(channelId && { channelId }),
      ...(playerId && { playerId }),
      ...(startTimeStr && { startTime: parseInt(startTimeStr) }),
      ...(endTimeStr && { endTime: parseInt(endTimeStr) }),
      includeDeleted: url.searchParams.get('includeDeleted') === 'true',
      limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : 50
    }

    const messages = this.getFilteredMessages(filter)

    return new Response(JSON.stringify({
      success: true,
      data: {
        messages,
        count: messages.length
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Handle reporting a message
   */
  private async handleReportMessage(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const body = await request.json() as {
      messageId: string
      reportedBy: string
      reason: string
    }

    const report: ReportedMessage = {
      messageId: body.messageId,
      reportedBy: body.reportedBy,
      reportedAt: Date.now(),
      reason: body.reason,
      status: 'pending'
    }

    this.state.reportedMessages.set(body.messageId, report)
    this.state.moderationStats.reportsReceived++

    await this.saveState()

    // Auto-action for severe reports
    if (body.reason.toLowerCase().includes('threat') || 
        body.reason.toLowerCase().includes('harassment')) {
      await this.autoModerateReportedMessage(body.messageId)
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        reportId: body.messageId,
        status: report.status
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Handle deleting a message
   */
  private async handleDeleteMessage(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const body = await request.json() as {
      messageId: string
      channelId: string
      deletedBy: string
      isAdmin: boolean
    }

    // Find the message
    const messages = this.state.messages.get(body.channelId)
    if (!messages) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Channel not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const message = messages.find(m => m.id === body.messageId)
    if (!message) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Message not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Check permissions
    if (!body.isAdmin && message.playerId !== body.deletedBy) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Unauthorized to delete this message'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Mark as deleted
    message.deleted = true
    message.deletedAt = Date.now()
    message.deletedBy = body.deletedBy

    this.state.moderationStats.messagesDeleted++
    await this.saveState()

    // Broadcast deletion
    await this.broadcastToChannel(body.channelId, createWebSocketMessage('message_deleted', {
      channelId: body.channelId,
      messageId: body.messageId,
      deletedBy: body.deletedBy,
      timestamp: Date.now()
    }))

    return new Response(JSON.stringify({
      success: true,
      data: {
        deleted: true
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Handle muting a user
   */
  private async handleMuteUser(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const body = await request.json() as {
      playerId: string
      username: string
      mutedBy: string
      duration?: number
      reason: string
      channelId?: string
    }

    const duration = body.duration || (
      this.state.mutedUsers.has(body.playerId) ? 
        ChatModeratorDurableObject.MUTE_DURATION_REPEAT : 
        ChatModeratorDurableObject.MUTE_DURATION_FIRST
    )

    const mutedUser: MutedUser = {
      playerId: body.playerId,
      username: body.username,
      mutedBy: body.mutedBy,
      mutedAt: Date.now(),
      mutedUntil: Date.now() + duration,
      reason: body.reason,
      ...(body.channelId && { channelId: body.channelId })
    }

    this.state.mutedUsers.set(body.playerId, mutedUser)
    this.state.moderationStats.usersMuted++

    await this.saveState()

    // Notify the muted user
    const connection = this.connections.get(body.playerId)
    if (connection) {
      this.sendMessage(connection.websocket, createWebSocketMessage('user_muted', {
        duration,
        reason: body.reason,
        channelId: body.channelId,
        mutedUntil: mutedUser.mutedUntil
      }))
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        mutedUntil: mutedUser.mutedUntil,
        duration
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Handle unmuting a user
   */
  private async handleUnmuteUser(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const body = await request.json() as {
      playerId: string
      unmutedBy: string
    }

    const mutedUser = this.state.mutedUsers.get(body.playerId)
    if (!mutedUser) {
      return new Response(JSON.stringify({
        success: false,
        error: 'User not muted'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    this.state.mutedUsers.delete(body.playerId)
    await this.saveState()

    // Notify the user
    const connection = this.connections.get(body.playerId)
    if (connection) {
      this.sendMessage(connection.websocket, createWebSocketMessage('user_unmuted', {
        unmutedBy: body.unmutedBy,
        timestamp: Date.now()
      }))
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        unmuted: true
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Handle channel configuration
   */
  private async handleChannelConfig(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      const url = new URL(request.url)
      const channelId = url.searchParams.get('channelId')
      
      if (!channelId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Channel ID required'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const config = this.state.channelConfigs.get(channelId)
      
      return new Response(JSON.stringify({
        success: true,
        data: { config }
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (request.method === 'POST') {
      const config = await request.json() as ChannelConfig
      
      this.state.channelConfigs.set(config.channelId, config)
      await this.saveState()

      return new Response(JSON.stringify({
        success: true,
        data: { updated: true }
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response('Method Not Allowed', { status: 405 })
  }

  /**
   * Get moderation statistics
   */
  private async handleGetStats(request: Request): Promise<Response> {
    const stats = {
      ...this.state.moderationStats,
      totalMessages: this.state.totalMessages,
      activeChannels: this.state.messages.size,
      mutedUsers: this.state.mutedUsers.size,
      pendingReports: Array.from(this.state.reportedMessages.values())
        .filter(r => r.status === 'pending').length,
      activeConnections: this.connections.size
    }

    return new Response(JSON.stringify({
      success: true,
      data: stats
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Health check endpoint
   */
  private async handleHealthCheck(request: Request): Promise<Response> {
    const startTime = Date.now()

    const healthInfo = {
      healthy: true,
      instanceId: this.durableObjectState.id.toString(),
      uptime: Date.now() - this.state.createdAt,
      timestamp: new Date().toISOString(),
      channelCount: this.state.messages.size,
      totalMessages: this.state.totalMessages,
      activeConnections: this.connections.size,
      mutedUsers: this.state.mutedUsers.size,
      pendingReports: Array.from(this.state.reportedMessages.values())
        .filter(r => r.status === 'pending').length,
      memoryUsage: (globalThis as any).performance?.memory ? {
        used: (globalThis as any).performance.memory.usedJSHeapSize,
        total: (globalThis as any).performance.memory.totalJSHeapSize,
        limit: (globalThis as any).performance.memory.jsHeapSizeLimit,
        usagePercent: ((globalThis as any).performance.memory.usedJSHeapSize / (globalThis as any).performance.memory.jsHeapSizeLimit) * 100,
      } : undefined
    }

    // Record health metric
    if (this.metrics) {
      const metric: DurableObjectHealthMetric = {
        objectName: 'ChatModerator',
        instanceId: this.durableObjectState.id.toString(),
        healthy: true,
        responseTime: Date.now() - startTime,
        timestamp: Date.now()
      }
      await this.metrics.recordDurableObjectHealth(metric)
    }

    return new Response(JSON.stringify(healthInfo), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Handle user joining a channel
   */
  private async handleJoinChannel(connection: ChatWebSocketConnection, channelId: string): Promise<void> {
    connection.channels.add(channelId)

    // Create channel if it doesn't exist
    if (!this.state.messages.has(channelId)) {
      this.state.messages.set(channelId, [])
    }

    // Send join confirmation
    this.sendMessage(connection.websocket, createWebSocketMessage('joined_channel', {
      channelId,
      playerId: connection.playerId,
      username: connection.username,
      timestamp: Date.now()
    }))

    // Send recent history
    await this.sendChannelHistory(connection, channelId, 20)

    // Broadcast to others in channel
    await this.broadcastToChannel(channelId, createWebSocketMessage('user_joined_chat', {
      channelId,
      playerId: connection.playerId,
      username: connection.username,
      timestamp: Date.now()
    }), connection.playerId)
  }

  /**
   * Handle user leaving a channel
   */
  private async handleLeaveChannel(connection: ChatWebSocketConnection, channelId: string): Promise<void> {
    connection.channels.delete(channelId)

    // Send leave confirmation
    this.sendMessage(connection.websocket, createWebSocketMessage('left_channel', {
      channelId,
      playerId: connection.playerId,
      username: connection.username,
      timestamp: Date.now()
    }))

    // Broadcast to others in channel
    await this.broadcastToChannel(channelId, createWebSocketMessage('user_left_chat', {
      channelId,
      playerId: connection.playerId,
      username: connection.username,
      timestamp: Date.now()
    }), connection.playerId)
  }

  /**
   * Handle WebSocket message send
   */
  private async handleWebSocketMessage(connection: ChatWebSocketConnection, payload: any): Promise<void> {
    const result = await this.processMessage({
      channelId: payload.channelId,
      playerId: connection.playerId,
      username: connection.username,
      message: payload.message
    })

    if (!result.success) {
      this.sendError(connection.websocket, result.error!)
    }
  }

  /**
   * Handle message editing
   */
  private async handleEditMessage(connection: ChatWebSocketConnection, payload: any): Promise<void> {
    const { messageId, channelId, newMessage } = payload

    const messages = this.state.messages.get(channelId)
    if (!messages) {
      this.sendError(connection.websocket, 'Channel not found')
      return
    }

    const message = messages.find(m => m.id === messageId)
    if (!message) {
      this.sendError(connection.websocket, 'Message not found')
      return
    }

    if (message.playerId !== connection.playerId) {
      this.sendError(connection.websocket, 'Unauthorized to edit this message')
      return
    }

    if (message.deleted) {
      this.sendError(connection.websocket, 'Cannot edit deleted message')
      return
    }

    // Apply same moderation to edited message
    const moderated = await this.moderateMessage(newMessage, connection.playerId)
    if (!moderated.allowed) {
      this.sendError(connection.websocket, moderated.reason!)
      return
    }

    // Update message
    message.message = moderated.filtered!
    message.edited = true
    message.editedAt = Date.now()

    await this.saveState()

    // Broadcast edit
    await this.broadcastToChannel(channelId, createWebSocketMessage('message_edited', {
      channelId,
      messageId,
      newMessage: message.message,
      editedAt: message.editedAt,
      editedBy: connection.playerId
    }))
  }

  /**
   * Process a new message
   */
  private async processMessage(data: {
    channelId: string
    playerId: string
    username: string
    message: string
  }): Promise<{ success: boolean; error?: string; messageId?: string; timestamp?: number }> {
    // Check if user is muted
    if (this.isUserMuted(data.playerId, data.channelId)) {
      return { success: false, error: 'You are muted' }
    }

    // Check rate limit
    if (!this.checkRateLimit(data.playerId)) {
      return { success: false, error: 'Rate limit exceeded. Please slow down.' }
    }

    // Validate message length
    if (data.message.length > ChatModeratorDurableObject.MAX_MESSAGE_LENGTH) {
      return { success: false, error: 'Message too long' }
    }

    // Get channel config
    const config = this.state.channelConfigs.get(data.channelId)
    
    // Check slow mode
    if (config?.slowMode) {
      const lastMessage = this.getLastMessageTime(data.playerId, data.channelId)
      if (lastMessage && Date.now() - lastMessage < config.slowMode * 1000) {
        return { 
          success: false, 
          error: `Slow mode active. Please wait ${config.slowMode} seconds between messages.` 
        }
      }
    }

    // Moderate message
    const moderated = await this.moderateMessage(data.message, data.playerId, config)
    if (!moderated.allowed) {
      return { success: false, error: moderated.reason || 'Message not allowed' }
    }

    // Create message entry
    const messageEntry: ChatHistoryEntry = {
      id: crypto.randomUUID(),
      channelId: data.channelId,
      playerId: data.playerId,
      username: data.username,
      message: moderated.filtered!,
      timestamp: Date.now(),
      ...(moderated.flagged && { flagged: moderated.flagged })
    }

    // Add to channel messages
    let messages = this.state.messages.get(data.channelId)
    if (!messages) {
      messages = []
      this.state.messages.set(data.channelId, messages)
    }
    
    messages.push(messageEntry)
    this.state.totalMessages++

    // Trim old messages
    if (messages.length > ChatModeratorDurableObject.MAX_MESSAGES_PER_CHANNEL) {
      messages.splice(0, messages.length - ChatModeratorDurableObject.MAX_MESSAGES_PER_CHANNEL)
    }

    await this.saveState()

    // Broadcast to channel
    const chatMessage = createWebSocketMessage('chat', {
      playerId: data.playerId,
      username: data.username,
      message: messageEntry.message,
      isSystem: false
    }) as ChatMessage

    await this.broadcastToChannel(data.channelId, chatMessage)

    return {
      success: true,
      messageId: messageEntry.id,
      timestamp: messageEntry.timestamp
    }
  }

  /**
   * Moderate a message
   */
  private async moderateMessage(
    message: string, 
    playerId: string,
    config?: ChannelConfig
  ): Promise<{ allowed: boolean; reason?: string; filtered?: string; flagged?: boolean }> {
    let filtered = message
    let flagged = false

    // Check for banned words
    const lowerMessage = message.toLowerCase()
    for (const banned of this.state.bannedWords) {
      if (lowerMessage.includes(banned)) {
        this.state.moderationStats.messagesModerated++
        
        // Issue warning
        const warnings = (this.state.warningCounts.get(playerId) || 0) + 1
        this.state.warningCounts.set(playerId, warnings)
        this.state.moderationStats.warningsIssued++

        if (warnings >= ChatModeratorDurableObject.WARNING_THRESHOLD) {
          // Auto-mute after too many warnings
          await this.muteUser(playerId, 'system', 'Too many violations', undefined)
        }

        return { 
          allowed: false, 
          reason: 'Message contains prohibited content' 
        }
      }
    }

    // Check channel-specific rules
    if (config?.autoModeration !== false) {
      // Filter spam patterns
      const spamPatterns = [
        /(.)\1{4,}/g, // Repeated characters
        /\b(?:https?:\/\/|www\.)\S+/gi, // URLs (if not allowed)
        /\b[A-Z]{5,}\b/g, // All caps words
      ]

      for (const pattern of spamPatterns) {
        if (pattern.test(message)) {
          if (config?.allowedLinks === false && /https?:\/\/|www\./i.test(message)) {
            return { allowed: false, reason: 'Links are not allowed in this channel' }
          }
          
          filtered = message.replace(pattern, '***')
          flagged = true
          this.state.moderationStats.messagesModerated++
        }
      }
    }

    return { allowed: true, filtered, flagged }
  }

  /**
   * Check if user is muted
   */
  private isUserMuted(playerId: string, channelId?: string): boolean {
    const muted = this.state.mutedUsers.get(playerId)
    if (!muted) return false

    // Check if mute has expired
    if (Date.now() > muted.mutedUntil) {
      this.state.mutedUsers.delete(playerId)
      return false
    }

    // Check if mute applies to this channel
    if (muted.channelId && muted.channelId !== channelId) {
      return false
    }

    return true
  }

  /**
   * Check rate limit
   */
  private checkRateLimit(playerId: string): boolean {
    const now = Date.now()
    let timestamps = this.rateLimiter.get(playerId) || []
    
    // Remove old timestamps
    timestamps = timestamps.filter(t => now - t < ChatModeratorDurableObject.RATE_LIMIT_WINDOW)
    
    if (timestamps.length >= ChatModeratorDurableObject.RATE_LIMIT_MESSAGES) {
      return false
    }

    timestamps.push(now)
    this.rateLimiter.set(playerId, timestamps)
    
    return true
  }

  /**
   * Get last message time for a player in a channel
   */
  private getLastMessageTime(playerId: string, channelId: string): number | null {
    const messages = this.state.messages.get(channelId)
    if (!messages) return null

    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]
      if (message && message.playerId === playerId && !message.deleted) {
        return message.timestamp
      }
    }

    return null
  }

  /**
   * Send channel history to a connection
   */
  private async sendChannelHistory(connection: ChatWebSocketConnection, channelId: string, limit: number = 50): Promise<void> {
    const messages = this.state.messages.get(channelId) || []
    const recent = messages
      .filter(m => !m.deleted || connection.isAdmin)
      .slice(-limit)

    this.sendMessage(connection.websocket, createWebSocketMessage('channel_history', {
      channelId,
      messages: recent,
      timestamp: Date.now()
    }))
  }

  /**
   * Get filtered messages
   */
  private getFilteredMessages(filter: MessageFilter): ChatHistoryEntry[] {
    let messages: ChatHistoryEntry[] = []

    if (filter.channelId) {
      messages = this.state.messages.get(filter.channelId) || []
    } else {
      // Get all messages
      for (const channelMessages of this.state.messages.values()) {
        messages.push(...channelMessages)
      }
    }

    // Apply filters
    if (filter.playerId) {
      messages = messages.filter(m => m.playerId === filter.playerId)
    }

    if (!filter.includeDeleted) {
      messages = messages.filter(m => !m.deleted)
    }

    if (filter.startTime) {
      messages = messages.filter(m => m.timestamp >= filter.startTime!)
    }

    if (filter.endTime) {
      messages = messages.filter(m => m.timestamp <= filter.endTime!)
    }

    // Sort by timestamp
    messages.sort((a, b) => a.timestamp - b.timestamp)

    // Apply limit
    if (filter.limit && messages.length > filter.limit) {
      messages = messages.slice(-filter.limit)
    }

    return messages
  }

  /**
   * Auto-moderate reported message
   */
  private async autoModerateReportedMessage(messageId: string): Promise<void> {
    // Find the message across all channels
    for (const [channelId, messages] of this.state.messages) {
      const message = messages.find(m => m.id === messageId)
      if (message) {
        // Delete the message
        message.deleted = true
        message.deletedAt = Date.now()
        message.deletedBy = 'system'

        // Mute the user
        await this.muteUser(
          message.playerId, 
          'system', 
          'Automated action due to severe report',
          channelId
        )

        // Update report
        const report = this.state.reportedMessages.get(messageId)
        if (report) {
          report.status = 'actioned'
          report.reviewedBy = 'system'
          report.reviewedAt = Date.now()
          report.action = 'deleted_and_muted'
        }

        this.state.moderationStats.messagesDeleted++
        
        // Broadcast deletion
        await this.broadcastToChannel(channelId, createWebSocketMessage('message_deleted', {
          channelId,
          messageId,
          deletedBy: 'system',
          reason: 'Automated moderation',
          timestamp: Date.now()
        }))

        break
      }
    }
  }

  /**
   * Mute a user
   */
  private async muteUser(playerId: string, mutedBy: string, reason: string, channelId?: string): Promise<void> {
    const duration = this.state.mutedUsers.has(playerId) ? 
      ChatModeratorDurableObject.MUTE_DURATION_REPEAT : 
      ChatModeratorDurableObject.MUTE_DURATION_FIRST

    const mutedUser: MutedUser = {
      playerId,
      username: this.connections.get(playerId)?.username || 'Unknown',
      mutedBy,
      mutedAt: Date.now(),
      mutedUntil: Date.now() + duration,
      reason,
      ...(channelId && { channelId })
    }

    this.state.mutedUsers.set(playerId, mutedUser)
    this.state.moderationStats.usersMuted++

    // Notify the user if connected
    const connection = this.connections.get(playerId)
    if (connection) {
      this.sendMessage(connection.websocket, createWebSocketMessage('user_muted', {
        duration,
        reason,
        channelId,
        mutedUntil: mutedUser.mutedUntil
      }))
    }
  }

  /**
   * Broadcast message to channel members
   */
  private async broadcastToChannel(channelId: string, message: WebSocketMessage, excludePlayerId?: string): Promise<void> {
    const messageStr = JSON.stringify(message)

    for (const [playerId, connection] of this.connections) {
      if (playerId === excludePlayerId) continue
      if (!connection.channels.has(channelId)) continue

      try {
        connection.websocket.send(messageStr)
      } catch (error) {
        logger.error(`Failed to send to ${playerId}:`, error as Error)
      }
    }
  }

  /**
   * Find connection by WebSocket
   */
  private findConnection(websocket: WebSocket): ChatWebSocketConnection | undefined {
    for (const connection of this.connections.values()) {
      if (connection.websocket === websocket) {
        return connection
      }
    }
    return undefined
  }

  /**
   * Send message to WebSocket
   */
  private sendMessage(websocket: WebSocket, message: WebSocketMessage): void {
    try {
      websocket.send(JSON.stringify(message))
    } catch (error) {
      logger.error('Failed to send WebSocket message:', error as Error)
    }
  }

  /**
   * Send error message to WebSocket
   */
  private sendError(websocket: WebSocket, error: string): void {
    this.sendMessage(websocket, createWebSocketMessage('error', { error, timestamp: Date.now() }))
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      this.performCleanup()
    }, ChatModeratorDurableObject.CLEANUP_INTERVAL)
  }

  /**
   * Perform cleanup tasks
   */
  private async performCleanup(): Promise<void> {
    const now = Date.now()
    let stateChanged = false

    // Clean up old messages
    for (const [channelId, messages] of this.state.messages) {
      const filtered = messages.filter(m => 
        now - m.timestamp < ChatModeratorDurableObject.MESSAGE_RETENTION || 
        m.flagged || 
        this.state.reportedMessages.has(m.id)
      )
      
      if (filtered.length !== messages.length) {
        this.state.messages.set(channelId, filtered)
        stateChanged = true
      }
    }

    // Clean up expired mutes
    for (const [playerId, muted] of this.state.mutedUsers) {
      if (now > muted.mutedUntil) {
        this.state.mutedUsers.delete(playerId)
        stateChanged = true
      }
    }

    // Clean up old reports
    for (const [messageId, report] of this.state.reportedMessages) {
      if (report.status !== 'pending' && now - report.reportedAt > 7 * 24 * 60 * 60 * 1000) {
        this.state.reportedMessages.delete(messageId)
        stateChanged = true
      }
    }

    // Clean up disconnected connections
    for (const [playerId, connection] of this.connections) {
      if (now - connection.lastActivity > 5 * 60 * 1000) { // 5 minutes
        this.connections.delete(playerId)
      }
    }

    if (stateChanged) {
      await this.saveState()
    }
  }
}