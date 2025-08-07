/**
 * Spectator WebSocket Manager
 * 
 * Handles WebSocket connections for spectators with separate channel,
 * delayed updates, and spectator-specific features.
 */

// We'll define the interfaces we need directly to avoid circular dependencies
interface GameClient {
  playerId: string
  username: string
  tableId: string
  isSpectator: boolean
  connection: WebSocket
  lastPing: number
  lastPong: number
  messageQueue: any[]
  stateVersion: number
  isConnected: boolean
  reconnectAttempts: number
  connectionId: string
}
import { SpectatorManager, SpectatorInfo, SpectatorUpdate } from './spectator-manager'
import { GameState, GamePlayer, WebSocketMessage, createWebSocketMessage } from '@primo-poker/shared'

// Simple console logger for now
const logger = {
  info: (...args: any[]) => console.log('[INFO]', ...args),
  warn: (...args: any[]) => console.warn('[WARN]', ...args),
  error: (...args: any[]) => console.error('[ERROR]', ...args)
}

export interface SpectatorClient extends GameClient {
  spectatorInfo: SpectatorInfo
}

export interface SpectatorMessage extends WebSocketMessage {
  type: 'SPECTATOR_JOIN' | 'SPECTATOR_LEAVE' | 'GAME_UPDATE_DELAYED' | 'SPECTATOR_COUNT' | 'SPECTATOR_PREFERENCES'
}

export class SpectatorWebSocketManager {
  private spectatorManager: SpectatorManager
  private spectatorClients: Map<string, SpectatorClient> = new Map()
  
  constructor() {
    this.spectatorManager = new SpectatorManager()
    
    // Set up broadcast callback
    this.spectatorManager.onBroadcast = (tableId, update) => {
      this.broadcastToSpectators(tableId, update)
    }
  }

  /**
   * Handle spectator connection
   */
  async handleSpectatorConnection(
    request: Request,
    spectatorId: string,
    username: string,
    tableId: string
  ): Promise<Response> {
    try {
      // Verify authentication
      const authHeader = request.headers.get('Authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response('Unauthorized', { status: 401 })
      }

      // Create WebSocket pair
      const pair = new WebSocketPair()
      const client = pair[0]
      const server = pair[1]

      // Create spectator info
      const spectatorInfo: SpectatorInfo = {
        spectatorId,
        username,
        joinedAt: Date.now(),
        isEducationalMode: false,
        preferredView: 'standard'
      }

      // Try to add spectator (may fail if table is full)
      const added = this.spectatorManager.addSpectator(tableId, spectatorInfo)
      if (!added) {
        return new Response('Table spectator limit reached', { status: 403 })
      }

      // Create spectator client
      const spectatorClient: SpectatorClient = {
        playerId: spectatorId,
        username,
        tableId,
        isSpectator: true,
        connection: server,
        lastPing: Date.now(),
        lastPong: Date.now(),
        messageQueue: [],
        stateVersion: 0,
        isConnected: true,
        reconnectAttempts: 0,
        connectionId: this.generateConnectionId(),
        spectatorInfo
      }

      // Register spectator client
      this.spectatorClients.set(spectatorId, spectatorClient)
      
      // Set up WebSocket handlers
      this.setupSpectatorWebSocketHandlers(spectatorClient)
      
      // Send initial messages
      this.sendSpectatorJoinConfirmation(spectatorClient)
      this.sendSpectatorCount(tableId)
      
      logger.info(`Spectator ${username} connected to table ${tableId}`)

      return new Response(null, {
        status: 101,
        webSocket: client
      })
    } catch (error) {
      logger.error('Error handling spectator connection:', error)
      return new Response('Internal server error', { status: 500 })
    }
  }

  /**
   * Set up WebSocket event handlers for spectator
   */
  private setupSpectatorWebSocketHandlers(client: SpectatorClient): void {
    const ws = client.connection

    ws.addEventListener('message', async (event) => {
      try {
        const message = JSON.parse(event.data as string) as SpectatorMessage
        await this.handleSpectatorMessage(client, message)
      } catch (error) {
        logger.error('Error handling spectator message:', error)
      }
    })

    ws.addEventListener('close', () => {
      this.handleSpectatorDisconnect(client)
    })

    ws.addEventListener('error', (error) => {
      logger.error('Spectator WebSocket error:', error)
      this.handleSpectatorDisconnect(client)
    })
  }

  /**
   * Handle spectator messages
   */
  private async handleSpectatorMessage(
    client: SpectatorClient,
    message: SpectatorMessage
  ): Promise<void> {
    switch (message.type) {
      case 'SPECTATOR_PREFERENCES':
        this.handleSpectatorPreferences(client, message.payload as any)
        break
        
      case 'SPECTATOR_LEAVE':
        this.handleSpectatorLeave(client)
        break
        
      default:
        logger.warn(`Unknown spectator message type: ${message.type}`)
    }
  }

  /**
   * Handle spectator preferences update
   */
  private handleSpectatorPreferences(
    client: SpectatorClient,
    preferences: Partial<SpectatorInfo>
  ): void {
    const updated = this.spectatorManager.updateSpectatorPreferences(
      client.spectatorInfo.spectatorId,
      preferences
    )
    
    if (updated) {
      // Update local client info
      Object.assign(client.spectatorInfo, preferences)
      
      // Send confirmation
      const message = createWebSocketMessage('SPECTATOR_PREFERENCES', {
        success: true,
        preferences
      })
      this.sendToClient(client, message)
    }
  }

  /**
   * Handle spectator leave
   */
  private handleSpectatorLeave(client: SpectatorClient): void {
    this.handleSpectatorDisconnect(client)
  }

  /**
   * Handle spectator disconnect
   */
  private handleSpectatorDisconnect(client: SpectatorClient): void {
    const { spectatorId, tableId, username } = client
    
    // Remove from spectator manager
    this.spectatorManager.removeSpectator(tableId, spectatorId)
    
    // Remove from client map
    this.spectatorClients.delete(spectatorId)
    
    // Update spectator count
    this.sendSpectatorCount(tableId)
    
    logger.info(`Spectator ${username} disconnected from table ${tableId}`)
  }

  /**
   * Send spectator join confirmation
   */
  private sendSpectatorJoinConfirmation(client: SpectatorClient): void {
    const message = createWebSocketMessage('SPECTATOR_JOIN', {
      success: true,
      tableId: client.tableId,
      spectatorId: client.spectatorInfo.spectatorId,
      spectatorCount: this.spectatorManager.getSpectatorCount(client.tableId)
    })
    
    this.sendToClient(client, message)
  }

  /**
   * Send spectator count update to all spectators
   */
  private sendSpectatorCount(tableId: string): void {
    const count = this.spectatorManager.getSpectatorCount(tableId)
    const message = createWebSocketMessage('SPECTATOR_COUNT', {
      tableId,
      count
    })
    
    // Send to all spectators of this table
    this.spectatorClients.forEach(client => {
      if (client.tableId === tableId) {
        this.sendToClient(client, message)
      }
    })
  }

  /**
   * Queue game state update for spectators
   */
  queueGameStateUpdate(
    tableId: string,
    gameState: GameState,
    players: GamePlayer[]
  ): void {
    const update: SpectatorUpdate = {
      gameState,
      players,
      timestamp: Date.now()
    }
    
    this.spectatorManager.queueSpectatorUpdate(tableId, update)
  }

  /**
   * Broadcast update to spectators (called by SpectatorManager after delay)
   */
  private broadcastToSpectators(tableId: string, update: SpectatorUpdate): void {
    const spectators = Array.from(this.spectatorClients.values())
      .filter(client => client.tableId === tableId)
    
    spectators.forEach(client => {
      // Generate spectator-specific view
      const spectatorView = this.spectatorManager.generateSpectatorView(
        tableId,
        update.gameState,
        update.players,
        client.spectatorInfo.spectatorId
      )
      
      // Create delayed update message
      const message = createWebSocketMessage('GAME_UPDATE_DELAYED', spectatorView)
      
      this.sendToClient(client, message)
    })
  }

  /**
   * Send message to spectator client
   */
  private sendToClient(client: SpectatorClient, message: WebSocketMessage): void {
    try {
      if (client.connection.readyState === WebSocket.OPEN) {
        client.connection.send(JSON.stringify(message))
      }
    } catch (error) {
      logger.error(`Error sending to spectator ${client.username}:`, error)
    }
  }

  /**
   * Generate connection ID
   */
  private generateConnectionId(): string {
    return `spec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get spectator statistics
   */
  getSpectatorStats() {
    return this.spectatorManager.getSpectatorStats()
  }
}