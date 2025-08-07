/**
 * Enhanced WebSocket Manager for Phase 3B.3
 * 
 * Provides real-time game synchronization, message queuing, and connection management
 * for live multiplayer poker experience.
 */

import { GamePhase, PlayerStatus, GameState, WebSocketMessage, createWebSocketMessage } from '@primo-poker/shared'
import { logger } from '@primo-poker/core'

// Enhanced message types for real-time gameplay
export interface GameMessage extends WebSocketMessage {
  type: 'action' | 'state_update' | 'player_update' | 'chat' | 'animation' | 'system' | 'ping' | 'pong'
  tableId: string
  priority: 'high' | 'medium' | 'low'
  playerId?: string
}

export interface GameClient {
  playerId: string
  username: string
  tableId: string
  isSpectator: boolean
  connection: WebSocket
  lastPing: number
  lastPong: number
  messageQueue: GameMessage[]
  stateVersion: number
  isConnected: boolean
  reconnectAttempts: number
  connectionId: string
}

export interface StateUpdate {
  version: number
  delta: Partial<GameState>
  fullState?: GameState
  timestamp: number
}

export interface ActionPrediction {
  actionId: string
  playerId: string
  action: any
  timestamp: number
  isOptimistic: boolean
}

export class WebSocketManager {
  private clients: Map<string, GameClient> = new Map()
  private tableClients: Map<string, Set<string>> = new Map()
  private messageSequence: number = 0
  private heartbeatInterval: number = 30000 // 30 seconds
  private connectionTimeout: number = 60000 // 60 seconds
  private maxReconnectAttempts: number = 5
  private messageHistory: Map<string, GameMessage[]> = new Map()

  constructor() {
    this.startHeartbeat()
    this.startCleanupTimer()
  }

  /**
   * Register a new client connection
   */
  addClient(
    playerId: string,
    username: string,
    tableId: string,
    connection: WebSocket,
    isSpectator: boolean = false
  ): GameClient {
    const connectionId = this.generateConnectionId()
    
    const client: GameClient = {
      playerId,
      username,
      tableId,
      isSpectator,
      connection,
      lastPing: Date.now(),
      lastPong: Date.now(),
      messageQueue: [],
      stateVersion: 0,
      isConnected: true,
      reconnectAttempts: 0,
      connectionId
    }

    // Setup WebSocket event handlers
    this.setupWebSocketHandlers(client)

    // Register client
    this.clients.set(playerId, client)
    
    // Add to table client list
    if (!this.tableClients.has(tableId)) {
      this.tableClients.set(tableId, new Set())
    }
    this.tableClients.get(tableId)!.add(playerId)

    logger.info('Client connected', {
      username,
      playerId,
      tableId,
      isSpectator,
      connectionId: client.connectionId
    })
    
    return client
  }

  /**
   * Remove client connection
   */
  removeClient(playerId: string): void {
    const client = this.clients.get(playerId)
    if (!client) return

    // Remove from table clients
    const tableClients = this.tableClients.get(client.tableId)
    if (tableClients) {
      tableClients.delete(playerId)
      if (tableClients.size === 0) {
        this.tableClients.delete(client.tableId)
      }
    }

    // Close connection if still open
    if (client.connection.readyState === WebSocket.OPEN) {
      client.connection.close()
    }

    // Remove client
    this.clients.delete(playerId)
    
    logger.info('Client disconnected', {
      username: client.username,
      playerId,
      tableId: client.tableId
    })
  }

  /**
   * Broadcast message to all clients at a table
   */
  broadcastToTable(tableId: string, message: GameMessage, excludePlayerId?: string): void {
    const tableClientIds = this.tableClients.get(tableId)
    if (!tableClientIds) return

    message.sequenceId = this.getNextSequenceId()
    message.timestamp = Date.now()

    // Add to message history
    this.addToMessageHistory(tableId, message)

    const broadcastPromises: Promise<void>[] = []

    for (const clientId of tableClientIds) {
      if (excludePlayerId && clientId === excludePlayerId) continue
      
      const client = this.clients.get(clientId)
      if (client && client.isConnected) {
        broadcastPromises.push(this.sendToClient(client, message))
      }
    }

    // Wait for all broadcasts to complete
    Promise.allSettled(broadcastPromises).then(results => {
      const failures = results.filter(result => result.status === 'rejected')
      if (failures.length > 0) {
        logger.warn('Failed to broadcast to some clients', {
          failureCount: failures.length,
          tableId,
          messageType: message.type
        })
      }
    })
  }

  /**
   * Send message to specific player
   */
  async sendToPlayer(playerId: string, message: GameMessage): Promise<boolean> {
    const client = this.clients.get(playerId)
    if (!client || !client.isConnected) {
      return false
    }

    message.sequenceId = this.getNextSequenceId()
    message.timestamp = Date.now()

    try {
      await this.sendToClient(client, message)
      return true
    } catch (error) {
      logger.error('Failed to send message to player', error, {
        playerId,
        messageType: message.type,
        tableId: message.tableId
      })
      return false
    }
  }

  /**
   * Handle client reconnection
   */
  async handleReconnection(
    playerId: string,
    username: string,
    tableId: string,
    connection: WebSocket,
    lastStateVersion: number
  ): Promise<GameClient | null> {
    const existingClient = this.clients.get(playerId)
    
    if (existingClient && existingClient.tableId === tableId) {
      // Update existing client with new connection
      existingClient.connection = connection
      existingClient.isConnected = true
      existingClient.reconnectAttempts = 0
      existingClient.lastPing = Date.now()
      existingClient.lastPong = Date.now()
      
      this.setupWebSocketHandlers(existingClient)
      
      // Send missed messages
      await this.sendMissedMessages(existingClient, lastStateVersion)
      
      logger.info('Client reconnected', {
        username,
        playerId,
        tableId,
        reconnectAttempts: existingClient.reconnectAttempts
      })
      return existingClient
    } else {
      // Create new client connection
      return this.addClient(playerId, username, tableId, connection, false)
    }
  }

  /**
   * Get client by player ID
   */
  getClient(playerId: string): GameClient | undefined {
    return this.clients.get(playerId)
  }

  /**
   * Get all clients for a table
   */
  getTableClients(tableId: string): GameClient[] {
    const clientIds = this.tableClients.get(tableId)
    if (!clientIds) return []

    return Array.from(clientIds)
      .map(id => this.clients.get(id))
      .filter((client): client is GameClient => client !== undefined)
  }

  /**
   * Get connected client count for table
   */
  getTableClientCount(tableId: string): { players: number, spectators: number } {
    const clients = this.getTableClients(tableId)
    
    return {
      players: clients.filter(c => !c.isSpectator && c.isConnected).length,
      spectators: clients.filter(c => c.isSpectator && c.isConnected).length
    }
  }

  /**
   * Setup WebSocket event handlers for client
   */
  private setupWebSocketHandlers(client: GameClient): void {
    const { connection, playerId } = client

    connection.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        this.handleClientMessage(client, message)
      } catch (error) {
        logger.error('Error parsing WebSocket message', error, {
          playerId,
          rawData: event.data
        })
      }
    }

    connection.onclose = () => {
      client.isConnected = false
      logger.info('WebSocket connection closed', {
        username: client.username,
        playerId,
        tableId: client.tableId
      })
      
      // Don't immediately remove - allow for reconnection
      setTimeout(() => {
        if (!client.isConnected) {
          this.removeClient(playerId)
        }
      }, this.connectionTimeout)
    }

    connection.onerror = (error) => {
      logger.error('WebSocket connection error', error, {
        playerId,
        username: client.username,
        tableId: client.tableId
      })
      client.isConnected = false
    }

    connection.onopen = () => {
      client.isConnected = true
      client.lastPing = Date.now()
      client.lastPong = Date.now()
    }
  }

  /**
   * Handle incoming message from client
   */
  private handleClientMessage(client: GameClient, message: any): void {
    client.lastPong = Date.now()

    switch (message.type) {
      case 'ping':
        this.sendToClient(client, {
          ...createWebSocketMessage('system', { type: 'pong', timestamp: Date.now() }),
          tableId: client.tableId,
          sequenceId: this.getNextSequenceId(),
          priority: 'high'
        } as GameMessage)
        break

      case 'ack':
        // Handle message acknowledgment
        this.handleMessageAck(client, message.sequenceId)
        break

      case 'state_request':
        // Handle state synchronization request
        this.handleStateRequest(client, message.lastStateVersion)
        break

      default:
        // Forward game messages (will be handled by GameTable DO)
        logger.debug('Received game message', {
          messageType: message.type,
          username: client.username,
          playerId: client.playerId,
          tableId: client.tableId
        })
        break
    }
  }

  /**
   * Send message to specific client
   */
  private async sendToClient(client: GameClient, message: GameMessage): Promise<void> {
    if (!client.isConnected || client.connection.readyState !== WebSocket.OPEN) {
      throw new Error(`Client ${client.playerId} is not connected`)
    }

    return new Promise((resolve, reject) => {
      try {
        const messageData = JSON.stringify(message)
        client.connection.send(messageData)
        
        // Add to client's message queue for potential resend
        if (message.requiresAck) {
          client.messageQueue.push(message)
        }
        
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Send missed messages to reconnecting client
   */
  private async sendMissedMessages(client: GameClient, lastStateVersion: number): Promise<void> {
    const tableHistory = this.messageHistory.get(client.tableId)
    if (!tableHistory) return

    const missedMessages = tableHistory.filter(msg => 
      msg.sequenceId !== undefined && msg.sequenceId > lastStateVersion && 
      msg.type !== 'ping' && 
      msg.type !== 'pong'
    )

    for (let i = 0; i < missedMessages.length; i++) {
      const message = missedMessages[i];
      if (!message) continue;
      try {
        await this.sendToClient(client, message)
      } catch (error) {
        logger.error('Failed to send missed message', error, {
          playerId: client.playerId,
          messageIndex: i,
          totalMissed: missedMessages.length
        })
      }
    }

    logger.info('Missed messages sent', {
      count: missedMessages.length,
      username: client.username,
      playerId: client.playerId
    })
  }

  /**
   * Handle message acknowledgment
   */
  private handleMessageAck(client: GameClient, sequenceId: number): void {
    client.messageQueue = client.messageQueue.filter(msg => msg.sequenceId !== sequenceId)
  }

  /**
   * Handle state synchronization request
   */
  private handleStateRequest(client: GameClient, lastStateVersion: number): void {
    // This would typically trigger a full state update from the GameTable DO
    logger.info('State sync requested', {
      username: client.username,
      playerId: client.playerId,
      lastStateVersion
    })
  }

  /**
   * Add message to table history
   */
  private addToMessageHistory(tableId: string, message: GameMessage): void {
    if (!this.messageHistory.has(tableId)) {
      this.messageHistory.set(tableId, [])
    }

    const history = this.messageHistory.get(tableId)!
    history.push(message)

    // Keep only last 100 messages per table
    if (history.length > 100) {
      history.splice(0, history.length - 100)
    }
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get next message sequence ID
   */
  private getNextSequenceId(): number {
    return ++this.messageSequence
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    setInterval(() => {
      const now = Date.now()
      
      for (const [playerId, client] of this.clients) {
        if (!client.isConnected) continue

        // Check if client is responsive
        if (now - client.lastPong > this.connectionTimeout) {
          logger.warn('Client connection timed out', {
            username: client.username,
            playerId,
            lastPong: client.lastPong,
            timeout: this.connectionTimeout
          })
          client.isConnected = false
          this.removeClient(playerId)
          continue
        }

        // Send ping if needed
        if (now - client.lastPing > this.heartbeatInterval) {
          this.sendToClient(client, {
            ...createWebSocketMessage('system', { type: 'ping', timestamp: now }),
            tableId: client.tableId,
            sequenceId: this.getNextSequenceId(),
            priority: 'high'
          } as GameMessage).catch(error => {
            logger.error('Failed to send ping', error, {
              playerId
            })
          })
          
          client.lastPing = now
        }
      }
    }, this.heartbeatInterval / 2)
  }

  /**
   * Start periodic cleanup
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      // Clean up old message history
      for (const [tableId, history] of this.messageHistory) {
        const cutoff = Date.now() - (60 * 60 * 1000) // 1 hour ago
        const validMessages = history.filter(msg => msg.timestamp > cutoff)
        
        if (validMessages.length !== history.length) {
          this.messageHistory.set(tableId, validMessages)
        }
      }

      // Clean up empty table client sets
      for (const [tableId, clientSet] of this.tableClients) {
        if (clientSet.size === 0) {
          this.tableClients.delete(tableId)
          this.messageHistory.delete(tableId)
        }
      }
    }, 5 * 60 * 1000) // Every 5 minutes
  }
}
