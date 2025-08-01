/**
 * Enhanced WebSocket Manager for Phase 3B.3
 * 
 * Provides real-time game synchronization, message queuing, and connection management
 * for live multiplayer poker experience.
 */

import { GamePhase, PlayerStatus, GameState } from '@primo-poker/shared'

// Enhanced message types for real-time gameplay
export interface GameMessage {
  type: 'action' | 'state_update' | 'player_update' | 'chat' | 'animation' | 'system' | 'ping' | 'pong'
  tableId: string
  timestamp: number
  data: any
  priority: 'high' | 'medium' | 'low'
  sequenceId: number
  playerId?: string
  requiresAck?: boolean
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

    console.log(`Client ${username} (${playerId}) connected to table ${tableId} as ${isSpectator ? 'spectator' : 'player'}`)
    
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
    
    console.log(`Client ${client.username} (${playerId}) disconnected from table ${client.tableId}`)
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
        console.warn(`Failed to broadcast to ${failures.length} clients at table ${tableId}`)
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
      console.error(`Failed to send message to player ${playerId}:`, error)
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
      
      console.log(`Client ${username} (${playerId}) reconnected to table ${tableId}`)
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
        console.error(`Error parsing message from client ${playerId}:`, error)
      }
    }

    connection.onclose = () => {
      client.isConnected = false
      console.log(`Client ${client.username} (${playerId}) connection closed`)
      
      // Don't immediately remove - allow for reconnection
      setTimeout(() => {
        if (!client.isConnected) {
          this.removeClient(playerId)
        }
      }, this.connectionTimeout)
    }

    connection.onerror = (error) => {
      console.error(`WebSocket error for client ${playerId}:`, error)
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
          type: 'system', 
          tableId: client.tableId,
          timestamp: Date.now(),
          sequenceId: this.getNextSequenceId(),
          priority: 'high',
          data: { type: 'pong', timestamp: Date.now() }
        })
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
        console.log(`Received ${message.type} from ${client.username} (${client.playerId})`)
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
      msg.sequenceId > lastStateVersion && 
      msg.type !== 'ping' && 
      msg.type !== 'pong'
    )

    for (const message of missedMessages) {
      try {
        await this.sendToClient(client, message)
      } catch (error) {
        console.error(`Failed to send missed message to ${client.playerId}:`, error)
      }
    }

    console.log(`Sent ${missedMessages.length} missed messages to ${client.username}`)
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
    console.log(`State sync requested by ${client.username} from version ${lastStateVersion}`)
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
          console.warn(`Client ${client.username} (${playerId}) timed out`)
          client.isConnected = false
          this.removeClient(playerId)
          continue
        }

        // Send ping if needed
        if (now - client.lastPing > this.heartbeatInterval) {
          this.sendToClient(client, {
            type: 'system',
            tableId: client.tableId,
            timestamp: now,
            sequenceId: this.getNextSequenceId(),
            priority: 'high',
            data: { type: 'ping', timestamp: now }
          }).catch(error => {
            console.error(`Failed to send ping to ${playerId}:`, error)
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
