import { WebSocketManager } from './websocket'
import { SpectatorManager, SpectatorInfo } from './spectator-manager'
import { createWebSocketMessage, WebSocketMessage } from '@primo-poker/shared'
import { RandomUtils } from '@primo-poker/shared'
import { AuthenticationManager } from '@primo-poker/security'

export interface SpectatorConnection {
  ws: WebSocket
  spectatorId: string
  tableId: string
  username: string
  isAuthenticated: boolean
  lastActivity: Date
}

export class SpectatorWebSocketManager extends WebSocketManager {
  private spectatorManager: SpectatorManager
  private spectatorConnections = new Map<string, SpectatorConnection>()
  private tableSpectatorConnections = new Map<string, Set<string>>()
  
  private static readonly MAX_SPECTATORS_PER_TABLE = 50
  
  constructor(jwtSecret: string, authManager?: AuthenticationManager, spectatorManager?: SpectatorManager) {
    super(jwtSecret, authManager)
    this.spectatorManager = spectatorManager || new SpectatorManager()
  }

  async handleSpectatorConnection(ws: WebSocket, request: Request): Promise<void> {
    try {
      const url = new URL(request.url)
      const token = url.searchParams.get('token')
      const tableId = url.searchParams.get('tableId')
      const isSpectator = url.searchParams.get('spectator') === 'true'
      
      if (!token || !tableId || !isSpectator) {
        ws.close(1008, 'Missing required parameters')
        return
      }

      // Verify authentication
      const authResult = await this.authManager.verifyAccessToken(token)
      if (!authResult || !authResult.valid || !authResult.payload) {
        ws.close(1008, 'Invalid authentication token')
        return
      }

      // Check spectator limit
      const currentSpectatorCount = this.getSpectatorCount(tableId)
      if (currentSpectatorCount >= SpectatorWebSocketManager.MAX_SPECTATORS_PER_TABLE) {
        ws.close(1008, 'Table spectator limit reached')
        return
      }

    const connectionId = RandomUtils.generateUUID()
    const spectatorInfo: SpectatorInfo = {
      spectatorId: authResult.payload.userId,
      username: authResult.payload.username,
      joinedAt: Date.now(),
      isEducationalMode: false,
      preferredView: 'standard'
    }

    // Add spectator to manager
    const added = this.spectatorManager.addSpectator(tableId, spectatorInfo)
    if (!added) {
      ws.close(1008, 'Failed to add spectator')
      return
    }

    const connection: SpectatorConnection = {
      ws,
      spectatorId: authResult.payload.userId,
      tableId,
      username: authResult.payload.username,
      isAuthenticated: true,
      lastActivity: new Date()
    }

    // Store connection
    this.spectatorConnections.set(connectionId, connection)
    
    // Add to table spectator connections
    if (!this.tableSpectatorConnections.has(tableId)) {
      this.tableSpectatorConnections.set(tableId, new Set())
    }
    this.tableSpectatorConnections.get(tableId)!.add(connectionId)

    // Set up event handlers
    ws.addEventListener('message', (event) => {
      this.handleSpectatorMessage(connectionId, event.data as string)
    })

    ws.addEventListener('close', () => {
      this.handleSpectatorDisconnection(connectionId)
    })

    ws.addEventListener('error', (error) => {
      console.error('Spectator WebSocket error:', error)
      this.handleSpectatorDisconnection(connectionId)
    })

    // Send welcome message
    this.sendToSpectator(connectionId, createWebSocketMessage(
      'spectator_joined',
      {
        spectatorId: connection.spectatorId,
        tableId: connection.tableId,
        username: connection.username
      }
    ))

    // Broadcast spectator count update
    this.broadcastSpectatorCount(tableId)
    
    // Check if we've reached the limit and notify
    if (this.getSpectatorCount(tableId) >= SpectatorWebSocketManager.MAX_SPECTATORS_PER_TABLE) {
      this.broadcastSpectatorLimitReached(tableId)
    }
    } catch (error) {
      console.error('Error in handleSpectatorConnection:', error)
      ws.close(1008, 'Internal error')
    }
  }

  private async handleSpectatorMessage(connectionId: string, messageData: string): Promise<void> {
    const connection = this.spectatorConnections.get(connectionId)
    if (!connection) return

    try {
      const message: WebSocketMessage = JSON.parse(messageData)
      connection.lastActivity = new Date()

      switch (message.type) {
        case 'spectator_leave':
          await this.handleSpectatorLeave(connectionId)
          break
        case 'ping':
          this.sendToSpectator(connectionId, createWebSocketMessage('pong', {}))
          break
        default:
          // Spectators can only send limited message types
          this.sendSpectatorError(connectionId, 'Invalid message type for spectator')
      }
    } catch (error) {
      this.sendSpectatorError(connectionId, 'Invalid message format')
    }
  }

  private async handleSpectatorLeave(connectionId: string): Promise<void> {
    const connection = this.spectatorConnections.get(connectionId)
    if (!connection) return

    // Remove spectator
    this.spectatorManager.removeSpectator(connection.tableId, connection.spectatorId)
    
    // Close connection
    connection.ws.close(1000, 'Spectator left')
    
    // Clean up will happen in handleSpectatorDisconnection
  }

  private handleSpectatorDisconnection(connectionId: string): void {
    const connection = this.spectatorConnections.get(connectionId)
    if (!connection) return

    // Remove from spectator manager
    this.spectatorManager.removeSpectator(connection.tableId, connection.spectatorId)

    // Remove from connections
    this.spectatorConnections.delete(connectionId)

    // Remove from table connections
    const tableConnections = this.tableSpectatorConnections.get(connection.tableId)
    if (tableConnections) {
      tableConnections.delete(connectionId)
      if (tableConnections.size === 0) {
        this.tableSpectatorConnections.delete(connection.tableId)
      }
    }

    // Broadcast updated spectator count
    this.broadcastSpectatorCount(connection.tableId)
  }

  private sendToSpectator(connectionId: string, message: WebSocketMessage): void {
    const connection = this.spectatorConnections.get(connectionId)
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) return

    try {
      connection.ws.send(JSON.stringify(message))
    } catch (error) {
      console.error('Failed to send message to spectator:', error)
      this.handleSpectatorDisconnection(connectionId)
    }
  }

  private sendSpectatorError(connectionId: string, message: string): void {
    this.sendToSpectator(connectionId, createWebSocketMessage('error', { message }))
  }

  private broadcastSpectatorCount(tableId: string): void {
    const count = this.spectatorManager.getSpectatorCount(tableId)
    const message = createWebSocketMessage('spectator_count', { 
      tableId,
      count 
    })

    // Send to all spectators at this table
    const connectionIds = this.tableSpectatorConnections.get(tableId)
    if (connectionIds) {
      for (const connectionId of connectionIds) {
        this.sendToSpectator(connectionId, message)
      }
    }

    // Also send to all players at this table (using parent class method)
    this.broadcastToTable(tableId, message)
  }

  private broadcastSpectatorLimitReached(tableId: string): void {
    const message = createWebSocketMessage('spectator_limit_reached', { 
      tableId,
      limit: SpectatorWebSocketManager.MAX_SPECTATORS_PER_TABLE
    })

    // Send to all spectators at this table
    const connectionIds = this.tableSpectatorConnections.get(tableId)
    if (connectionIds) {
      for (const connectionId of connectionIds) {
        this.sendToSpectator(connectionId, message)
      }
    }

    // Also send to all players at this table
    this.broadcastToTable(tableId, message)
  }

  broadcastToSpectators(tableId: string, message: WebSocketMessage, delay: number = 500): void {
    // Schedule delayed broadcast
    setTimeout(() => {
      const connectionIds = this.tableSpectatorConnections.get(tableId)
      if (!connectionIds) return

      for (const connectionId of connectionIds) {
        this.sendToSpectator(connectionId, message)
      }
    }, delay)
  }

  getSpectatorCount(tableId: string): number {
    return this.spectatorManager.getSpectatorCount(tableId)
  }

  // Override parent broadcastToTable to exclude certain messages from parent class
  protected broadcastToTable(tableId: string, message: WebSocketMessage, excludeConnectionId?: string): void {
    // Call parent implementation
    super.broadcastToTable(tableId, message, excludeConnectionId)
  }
}