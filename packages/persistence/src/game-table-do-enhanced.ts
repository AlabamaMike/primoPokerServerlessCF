/**
 * Enhanced GameTable Durable Object with Error Recovery
 * 
 * This enhanced version includes comprehensive error recovery mechanisms,
 * circuit breakers, and retry policies for robust multiplayer poker gameplay.
 */

import { 
  Player, 
  TableConfig, 
  GameState, 
  GamePhase, 
  PlayerAction, 
  PlayerStatus,
  Card,
  WebSocketMessage,
  createWebSocketMessage,
  GameRuleError
} from '@primo-poker/shared'
import { 
  PokerGame, 
  BettingEngine,
  BettingAction, 
  DeckManager, 
  StateSynchronizer,
  StateSnapshot,
  ConflictResolutionStrategy,
  GameError,
  ErrorRecoveryManager,
  OperationContext
} from '@primo-poker/core'

export interface PlayerConnection {
  websocket: WebSocket
  playerId: string
  username: string
  isConnected: boolean
  lastHeartbeat: number
  reconnectAttempts: number
  gracePeriodExpiry?: number
}

export interface SpectatorInfo {
  id: string
  username: string
  joinedAt: number
}

export interface SeatReservation {
  playerId: string
  username: string
  seatIndex: number
  reservedAt: number
  expiresAt: number
}

export interface GameTablePlayer extends Player {
  isFolded: boolean
  currentBet: number
  hasActed: boolean
  chips: number
  holeCards: Card[]
  isAllIn?: boolean
  disconnectedAt?: number
  autoFoldScheduled?: boolean
}

export interface GameTableState {
  tableId: string
  config: TableConfig
  players: Map<string, GameTablePlayer>
  connections: Map<string, PlayerConnection>
  gameState: GameState | null
  game: GameState | null
  spectators: Map<string, SpectatorInfo>
  seatReservations: Map<number, SeatReservation>
  createdAt: number
  lastActivity: number
  handNumber: number
  buttonPosition: number
  buttonPlayerId: string | null
  stateCheckpoint?: StateSnapshot // For recovery
}

export class EnhancedGameTableDurableObject {
  private state: GameTableState
  private heartbeatInterval: number | null = null
  private deck: Card[] = []
  private bettingEngine: BettingEngine
  private deckManager: DeckManager
  private durableObjectState: DurableObjectState
  private env: any
  private initialized: boolean = false
  private stateSynchronizer: StateSynchronizer
  private currentStateVersion: number = 0
  private errorRecovery: ErrorRecoveryManager
  private gracePeriodTimers: Map<string, number> = new Map()

  // Constants
  private static readonly MIN_PLAYERS_FOR_GAME = 2
  private static readonly GRACE_PERIOD_MS = 30000 // 30 seconds
  private static readonly AUTO_SAVE_INTERVAL = 5000 // 5 seconds

  constructor(state: DurableObjectState, env: any) {
    this.durableObjectState = state
    this.env = env
    
    // Initialize error recovery
    this.errorRecovery = new ErrorRecoveryManager()
    this.configureErrorRecovery()
    
    // Initialize with default state
    this.state = {
      tableId: '',
      config: {} as TableConfig,
      players: new Map(),
      connections: new Map(),
      gameState: null,
      game: null,
      spectators: new Map(),
      seatReservations: new Map(),
      createdAt: Date.now(),
      lastActivity: Date.now(),
      handNumber: 0,
      buttonPosition: 0,
      buttonPlayerId: null,
    }

    // Initialize game components
    this.bettingEngine = new BettingEngine()
    this.deckManager = new DeckManager()
    this.stateSynchronizer = new StateSynchronizer({
      maxHistorySize: 100,
    })

    // Set up auto-save
    this.setupAutoSave()
  }

  private configureErrorRecovery(): void {
    // Configure retry policies for different operations
    this.errorRecovery.configureRetryPolicy('state-persistence', {
      maxAttempts: 5,
      backoffStrategy: 'exponential',
      initialDelay: 100,
      maxDelay: 5000,
      jitter: true,
    })

    this.errorRecovery.configureRetryPolicy('broadcast', {
      maxAttempts: 3,
      backoffStrategy: 'exponential',
      initialDelay: 50,
      maxDelay: 1000,
      jitter: false,
    })

    this.errorRecovery.configureRetryPolicy('game-action', {
      maxAttempts: 2,
      backoffStrategy: 'fixed',
      initialDelay: 100,
      maxDelay: 100,
      jitter: false,
    })
  }

  private setupAutoSave(): void {
    setInterval(async () => {
      if (this.state.gameState) {
        await this.saveStateWithRecovery()
      }
    }, EnhancedGameTableDurableObject.AUTO_SAVE_INTERVAL)
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    
    // Handle WebSocket upgrade with error recovery
    if (request.headers.get('Upgrade') === 'websocket') {
      const context: OperationContext = {
        operationName: 'websocket-upgrade',
        resourceType: 'websocket',
        critical: false,
      }

      try {
        return await this.errorRecovery.executeWithRecovery(
          () => this.handleWebSocketUpgrade(request),
          context
        )
      } catch (error) {
        return new Response('Failed to establish WebSocket connection', { status: 500 })
      }
    }

    // Handle HTTP requests with error recovery
    const context: OperationContext = {
      operationName: 'http-request',
      resourceType: 'api',
      critical: false,
    }

    try {
      return await this.errorRecovery.executeWithRecovery(
        () => this.handleHttpRequest(request),
        context
      )
    } catch (error) {
      return new Response('Internal server error', { status: 500 })
    }
  }

  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    
    await this.handleWebSocketConnection(server, request)
    
    return new Response(null, {
      status: 101,
      webSocket: client,
    } as any)
  }

  private async handleWebSocketConnection(ws: WebSocket, request: Request): Promise<void> {
    ws.accept()
    
    const url = new URL(request.url)
    const playerId = url.searchParams.get('playerId')
    const username = url.searchParams.get('username')
    
    if (!playerId || !username) {
      ws.close(1008, 'Missing required parameters')
      return
    }

    // Check for existing connection (reconnection scenario)
    const existingConnection = this.state.connections.get(playerId)
    if (existingConnection) {
      await this.handleReconnection(playerId, ws, username)
      return
    }

    // New connection
    const connection: PlayerConnection = {
      websocket: ws,
      playerId,
      username,
      isConnected: true,
      lastHeartbeat: Date.now(),
      reconnectAttempts: 0,
    }
    
    this.state.connections.set(playerId, connection)
    
    // Cancel any grace period
    this.cancelGracePeriod(playerId)
    
    // Set up message handler with error recovery
    ws.addEventListener('message', async (event) => {
      const context: OperationContext = {
        operationName: 'websocket-message',
        resourceType: 'websocket',
        resourceId: playerId,
        critical: false,
      }

      try {
        await this.errorRecovery.executeWithRecovery(
          () => this.handleMessage(playerId, event.data as string),
          context
        )
      } catch (error) {
        console.error('Failed to handle message:', error)
        this.sendError(playerId, 'Failed to process message')
      }
    })
    
    ws.addEventListener('close', () => {
      this.handleDisconnection(playerId)
    })
    
    ws.addEventListener('error', (error) => {
      console.error('WebSocket error:', error)
      this.handleDisconnection(playerId)
    })
    
    // Send welcome message
    await this.sendWithRecovery(playerId, createWebSocketMessage('connected', { 
      playerId,
      tableId: this.state.tableId,
    }))
  }

  private async handleReconnection(playerId: string, ws: WebSocket, username: string): Promise<void> {
    const connection = this.state.connections.get(playerId)!
    const player = this.state.players.get(playerId)
    
    // Update connection
    connection.websocket = ws
    connection.isConnected = true
    connection.lastHeartbeat = Date.now()
    connection.reconnectAttempts++
    
    // Cancel grace period
    this.cancelGracePeriod(playerId)
    
    // Clear auto-fold if scheduled
    if (player && player.autoFoldScheduled) {
      player.autoFoldScheduled = false
      delete player.disconnectedAt
    }
    
    // Send reconnection data
    await this.sendWithRecovery(playerId, createWebSocketMessage('reconnected', {
      playerId,
      tableId: this.state.tableId,
      gameState: this.state.gameState,
      missedActions: [], // Would fetch from state synchronizer
    }))
    
    // Notify other players
    await this.broadcastWithRecovery(
      createWebSocketMessage('player_reconnected', {
        playerId,
        username,
      }),
      playerId
    )
  }

  private handleDisconnection(playerId: string): void {
    const connection = this.state.connections.get(playerId)
    const player = this.state.players.get(playerId)
    
    if (!connection) return
    
    connection.isConnected = false
    
    if (player && this.state.gameState && player.status === PlayerStatus.ACTIVE) {
      // Player is in active game - start grace period
      player.disconnectedAt = Date.now()
      
      const gameError: GameError = {
        errorType: 'player-disconnected',
        playerId,
        gameId: this.state.tableId,
        context: {
          inHand: !player.isFolded,
          hasBet: player.currentBet > 0,
          gamePhase: this.state.gameState.phase,
        },
      }
      
      const action = this.errorRecovery.handleGameError(gameError)
      
      if (action.action === 'grace-period') {
        this.startGracePeriod(playerId)
      } else if (action.action === 'auto-fold') {
        this.autoFoldPlayer(playerId)
      }
    }
    
    // Notify other players
    this.broadcastWithRecovery(
      createWebSocketMessage('player_disconnected', {
        playerId,
        username: connection.username,
        gracePeriod: player && player.status === PlayerStatus.ACTIVE,
      })
    )
  }

  private startGracePeriod(playerId: string): void {
    const timer = setTimeout(() => {
      const player = this.state.players.get(playerId)
      if (player && player.disconnectedAt && !player.autoFoldScheduled) {
        this.autoFoldPlayer(playerId)
      }
    }, EnhancedGameTableDurableObject.GRACE_PERIOD_MS)
    
    this.gracePeriodTimers.set(playerId, timer)
  }

  private cancelGracePeriod(playerId: string): void {
    const timer = this.gracePeriodTimers.get(playerId)
    if (timer) {
      clearTimeout(timer)
      this.gracePeriodTimers.delete(playerId)
    }
  }

  private async autoFoldPlayer(playerId: string): Promise<void> {
    const player = this.state.players.get(playerId)
    if (!player || player.isFolded) return
    
    player.autoFoldScheduled = true
    
    // Create fold action
    const foldAction: BettingAction = {
      playerId,
      type: 'fold',
      amount: 0,
      timestamp: Date.now(),
    }
    
    await this.handlePlayerActionWithRecovery(playerId, foldAction)
    
    // Notify table
    await this.broadcastWithRecovery(
      createWebSocketMessage('system_message', {
        message: `${player.username} folded due to disconnection`,
      })
    )
  }

  private async handleMessage(playerId: string, data: string): Promise<void> {
    const message: WebSocketMessage = JSON.parse(data)
    
    switch (message.type) {
      case 'player_action':
        await this.handlePlayerActionWithRecovery(playerId, message.payload as BettingAction)
        break
      case 'heartbeat':
        this.handleHeartbeat(playerId)
        break
      case 'request_state':
        await this.sendGameState(playerId)
        break
      default:
        throw new Error(`Unknown message type: ${message.type}`)
    }
  }

  private async handlePlayerActionWithRecovery(playerId: string, action: BettingAction): Promise<void> {
    const context: OperationContext = {
      operationName: 'player-action',
      resourceType: 'game-action',
      resourceId: playerId,
      critical: true,
    }

    await this.errorRecovery.executeWithRecovery(
      async () => {
        // Validate and process action
        if (!this.state.gameState) {
          throw new GameRuleError('No active game')
        }

        const player = this.state.players.get(playerId)
        if (!player) {
          throw new GameRuleError('Player not at table')
        }

        // Process action through betting engine - convert to GamePlayer format
        const gamePlayers = new Map<string, any>()
        this.state.players.forEach((player, id) => {
          gamePlayers.set(id, {
            ...player,
            isAllIn: player.isAllIn || false
          })
        })
        
        const result = this.bettingEngine.processAction(
          action,
          gamePlayers,
          this.state.gameState.pot || 0
        )

        // Update game state - convert GamePlayer to GameTablePlayer
        const updatedTablePlayers = new Map<string, GameTablePlayer>()
        result.updatedPlayers.forEach((player, id) => {
          const existingPlayer = this.state.players.get(id)
          if (existingPlayer) {
            // Update existing player with new data from GamePlayer
            updatedTablePlayers.set(id, {
              ...existingPlayer,
              ...player,
              holeCards: existingPlayer.holeCards // Preserve hole cards
            })
          }
        })
        this.state.players = updatedTablePlayers
        
        if (this.state.gameState) {
          this.state.gameState.pot = result.newPot
        }
        this.currentStateVersion++

        // Save state checkpoint
        await this.saveStateWithRecovery()

        // Broadcast update
        await this.broadcastGameUpdate()
      },
      context
    )
  }

  private async saveStateWithRecovery(): Promise<void> {
    const context: OperationContext = {
      operationName: 'save-state',
      resourceType: 'state-persistence',
      critical: true,
    }

    await this.errorRecovery.executeWithRecovery(
      async () => {
        // Create state snapshot
        const playerStates = new Map<string, any>()
        this.state.players.forEach((player, id) => {
          playerStates.set(id, {
            id,
            username: player.username,
            chips: player.chips,
            currentBet: player.currentBet,
            hasActed: player.hasActed,
            isFolded: player.isFolded,
            position: player.position,
          })
        })
        
        const snapshot: StateSnapshot = {
          version: this.currentStateVersion,
          timestamp: Date.now(),
          gameState: this.state.gameState!,
          playerStates,
          hash: '', // Would calculate actual hash
        }

        this.state.stateCheckpoint = snapshot

        // Persist to durable storage
        await this.durableObjectState.storage.put('state', JSON.stringify(this.state))
        await this.durableObjectState.storage.put('snapshot', JSON.stringify(snapshot))
      },
      context
    )
  }

  private async broadcastWithRecovery(
    message: WebSocketMessage,
    excludePlayerId?: string
  ): Promise<void> {
    const context: OperationContext = {
      operationName: 'broadcast',
      resourceType: 'broadcast',
      critical: false,
    }

    await this.errorRecovery.executeWithRecovery(
      async () => {
        const promises: Promise<void>[] = []

        for (const [playerId, connection] of this.state.connections) {
          if (excludePlayerId && playerId === excludePlayerId) continue
          if (!connection.isConnected) continue

          promises.push(
            this.sendWithRecovery(playerId, message).catch(error => {
              console.error(`Failed to send to ${playerId}:`, error)
            })
          )
        }

        await Promise.allSettled(promises)
      },
      context
    )
  }

  private async sendWithRecovery(playerId: string, message: WebSocketMessage): Promise<void> {
    const connection = this.state.connections.get(playerId)
    if (!connection || !connection.isConnected) {
      throw new Error('Connection not available')
    }

    try {
      connection.websocket.send(JSON.stringify(message))
    } catch (error) {
      // Handle send failure
      this.handleDisconnection(playerId)
      throw error
    }
  }

  private async broadcastGameUpdate(): Promise<void> {
    if (!this.state.gameState) return

    const updateMessage = createWebSocketMessage('game_update', {
      gameState: this.state.gameState,
      version: this.currentStateVersion,
    })

    await this.broadcastWithRecovery(updateMessage)
  }

  private sendError(playerId: string, error: string): void {
    this.sendWithRecovery(
      playerId,
      createWebSocketMessage('error', { message: error })
    ).catch(err => {
      console.error('Failed to send error message:', err)
    })
  }

  private handleHeartbeat(playerId: string): void {
    const connection = this.state.connections.get(playerId)
    if (connection) {
      connection.lastHeartbeat = Date.now()
    }
  }

  private async sendGameState(playerId: string): Promise<void> {
    await this.sendWithRecovery(playerId, createWebSocketMessage('game_state', {
      gameState: this.state.gameState,
      players: Array.from(this.state.players.values()),
      version: this.currentStateVersion,
    }))
  }

  private async handleHttpRequest(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    switch (path) {
      case '/status':
        return new Response(JSON.stringify({
          tableId: this.state.tableId,
          playerCount: this.state.players.size,
          connectionCount: this.state.connections.size,
          gameActive: this.state.gameState !== null,
          metrics: this.errorRecovery.getMetrics(),
        }), {
          headers: { 'Content-Type': 'application/json' },
        })

      case '/recovery-status':
        return new Response(JSON.stringify({
          circuitBreakers: this.errorRecovery.getCircuitBreakerStatus(),
          metrics: this.errorRecovery.getMetrics(),
          gracePeriods: Array.from(this.gracePeriodTimers.keys()),
        }), {
          headers: { 'Content-Type': 'application/json' },
        })

      default:
        return new Response('Not found', { status: 404 })
    }
  }

  // Handle state conflicts during recovery
  async handleStateConflict(conflict: any): Promise<void> {
    const resolution = this.errorRecovery.handleStateConflict({
      conflictType: 'state-mismatch',
      localState: this.state.gameState,
      remoteState: conflict.remoteState || conflict,
      field: 'gameState',
    })

    if (resolution.strategy === 'manual-intervention') {
      // Log for admin review
      console.error('State conflict requires manual intervention:', conflict)
      // Could notify admins here
    } else if (resolution.resolvedState) {
      this.state.gameState = resolution.resolvedState as GameState
      await this.saveStateWithRecovery()
      await this.broadcastGameUpdate()
    }
  }
}