/**
 * GameTable Durable Object - Server-Authoritative Multiplayer Poker Table
 * 
 * This Durable Object manages the complete game state for a single poker table,
 * ensuring all game logic is server-side and secure.
 */

import { 
  Player, 
  TableConfig, 
  GameState, 
  GamePhase, 
  PlayerAction, 
  PlayerStatus,
  Card,
  Suit,
  Rank,
  WebSocketMessage,
  createWebSocketMessage
} from '@primo-poker/shared'
import { PokerGame, BettingEngine, DeckManager } from '@primo-poker/core'

export interface PlayerConnection {
  websocket: WebSocket
  playerId: string
  username: string
  isConnected: boolean
  lastHeartbeat: number
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
  // Additional runtime properties for table management
  isFolded: boolean
  currentBet: number
  hasActed: boolean
  chips: number // Runtime chip count separate from persistent chipCount
  holeCards: Card[] // Player's hole cards
}

export interface GameTableState {
  tableId: string
  config: TableConfig
  players: Map<string, GameTablePlayer>
  connections: Map<string, PlayerConnection>
  gameState: GameState | null
  game: GameState | null  // Current active game state (same as gameState for compatibility)
  spectators: Map<string, SpectatorInfo>
  seatReservations: Map<number, SeatReservation>
  createdAt: number
  lastActivity: number
  handNumber: number
  buttonPosition: number  // Track button position for proper rotation
}

// Using WebSocketMessage from shared types

export class GameTableDurableObject {
  private state: GameTableState
  private heartbeatInterval: number | null = null
  private deck: Card[] = []
  private bettingEngine: BettingEngine
  private deckManager: DeckManager
  private durableObjectState: DurableObjectState
  private env: any
  private initialized: boolean = false

  constructor(state: DurableObjectState, env: any) {
    this.durableObjectState = state
    this.env = env
    
    // Initialize with default state
    this.state = {
      tableId: crypto.randomUUID(),
      config: {
        id: crypto.randomUUID(),
        name: 'Poker Table',
        gameType: 'texas_holdem' as any,
        bettingStructure: 'no_limit' as any,
        gameFormat: 'cash' as any,
        maxPlayers: 9,
        minBuyIn: 1000,
        maxBuyIn: 10000,
        smallBlind: 10,
        bigBlind: 20,
        ante: 0,
        timeBank: 30,
        isPrivate: false
      },
      players: new Map(),
      connections: new Map(),
      gameState: null,
      game: null,
      spectators: new Map(),
      seatReservations: new Map(),
      createdAt: Date.now(),
      lastActivity: Date.now(),
      handNumber: 0,
      buttonPosition: -1  // -1 means no button position set yet
    }

    // Initialize game engines
    this.bettingEngine = new BettingEngine()
    this.deckManager = new DeckManager()

    // Load saved state on first request
    this.initialized = false

    // Start heartbeat monitoring
    this.startHeartbeatMonitoring()
  }

  /**
   * Save state to storage with proper serialization
   */
  private async saveState(): Promise<void> {
    console.log('💾 saveState() - Starting state serialization...')
    
    try {
      const stateToSave = {
        ...this.state,
        players: Array.from(this.state.players.entries()),
        connections: [], // Don't persist connections
        spectators: Array.from(this.state.spectators.entries()),
        seatReservations: Array.from(this.state.seatReservations.entries())
      }
      
      console.log('🔄 State serialized successfully. Size check:')
      console.log('  - Players:', stateToSave.players.length)
      console.log('  - Spectators:', stateToSave.spectators.length)
      console.log('  - Seat reservations:', stateToSave.seatReservations.length)
      console.log('  - Config exists:', !!stateToSave.config)
      console.log('  - Table ID:', stateToSave.tableId)
      
      console.log('🔐 Calling durableObjectState.storage.put...')
      await this.durableObjectState.storage.put('tableState', stateToSave)
      console.log('✅ storage.put completed successfully')
      
    } catch (error: any) {
      console.error('❌ CRITICAL ERROR in saveState:', error)
      console.error('🔍 Save error name:', error?.name)
      console.error('🔍 Save error message:', error?.message)
      console.error('🔍 Save error stack:', error?.stack)
      console.error('🔧 durableObjectState exists:', !!this.durableObjectState)
      console.error('🔧 durableObjectState.storage exists:', !!this.durableObjectState?.storage)
      
      throw error
    }
  }

  /**
   * Initialize state from storage if not already done
   */
  private async initializeState(): Promise<void> {
    if (this.initialized) return
    
    try {
      const savedState = await this.durableObjectState.storage.get('tableState') as GameTableState | undefined
      if (savedState) {
        // Restore saved state
        this.state = {
          ...savedState,
          players: new Map(savedState.players),
          connections: new Map(), // Connections are not persisted
          spectators: new Map(savedState.spectators || []),
          seatReservations: new Map(savedState.seatReservations || [])
        }
        console.log('Loaded saved table state:', this.state.tableId, 'Config:', this.state.config)
      }
    } catch (error) {
      console.error('Failed to load saved state:', error)
    }
    
    this.initialized = true
  }

  /**
   * Handle HTTP requests to the Durable Object
   */
  async fetch(request: Request): Promise<Response> {
    // Initialize state from storage on first request
    await this.initializeState()
    
    const url = new URL(request.url)
    const path = url.pathname

    // Debug logging
    console.log('GameTableDO fetch - URL:', request.url, 'Path:', path, 'Method:', request.method)

    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      try {
        const pair = new WebSocketPair()
        const [client, server] = Object.values(pair) as [WebSocket, WebSocket]
        
        // Accept the WebSocket connection
        this.durableObjectState.acceptWebSocket(server)
        
        // Extract player info from headers
        const playerId = request.headers.get('X-Player-ID')
        const username = request.headers.get('X-Username')
        const tableId = request.headers.get('X-Table-ID')
        
        console.log('[DO WS] WebSocket connection:', { playerId, username, tableId })
        
        if (playerId && username) {
          // Verify player has joined table via API
          if (!this.state.players.has(playerId) && !this.state.spectators.has(playerId)) {
            server.close(1008, 'Must join table before connecting WebSocket')
            return new Response('Must join table first', { status: 403 })
          }
          
          // Store connection info
          const connection: PlayerConnection = {
            websocket: server,
            playerId,
            username,
            isConnected: true,
            lastHeartbeat: Date.now()
          }
          this.state.connections.set(playerId, connection)
          
          // Send initial connection success message
          server.send(JSON.stringify(this.buildMessage('connection_established', {
            playerId,
            tableId: this.state.tableId,
            message: 'Connected to game table'
          })))
          
          // Send current table state
          const tableState = await this.getTableStateForClient()
          this.sendMessage(server, this.buildMessage('table_state_update', {
            tableId: this.state.tableId,
            players: this.getPlayersDTO(playerId),
            spectatorCount: this.state.spectators.size,
            gameState: this.getCurrentGameState(),
            timestamp: Date.now()
          }))
        } else {
          console.error('[DO WS] Missing player info in WebSocket upgrade')
        }
        
        return new Response(null, {
          status: 101,
          webSocket: client,
        })
      } catch (error) {
        console.error('[DO WS] WebSocket upgrade error:', error)
        return new Response('WebSocket upgrade failed', { status: 500 })
      }
    }

    // Handle REST API endpoints
    console.log('GameTableDO - Switching on path:', JSON.stringify(path))
    switch (path) {
      case '/create':
        console.log('GameTableDO - Matched /create case')
        return this.handleCreateTable(request)
      case '/join':
        console.log('GameTableDO - Matched /join case')
        return this.handleJoinTableREST(request)
      case '/leave':
        console.log('GameTableDO - Matched /leave case')
        return this.handleLeaveTableREST(request)
      case '/state':
        console.log('GameTableDO - Matched /state case')
        return this.handleGetTableState(request)
      case '/action':
        console.log('GameTableDO - Matched /action case')
        return this.handlePlayerActionREST(request)
      default:
        console.log('GameTableDO - No match, returning 404. Path was:', JSON.stringify(path))
        return new Response('Not found', { status: 404 })
    }
  }

  /**
   * Handle table creation via REST
   */
  private async handleCreateTable(request: Request): Promise<Response> {
    console.log('🚀 GameTableDO - handleCreateTable called at', new Date().toISOString())
    // Log headers for debugging
    const headerEntries: [string, string][] = [];
    request.headers.forEach((value, key) => {
      headerEntries.push([key, value]);
    });
    console.log('📝 Request headers:', Object.fromEntries(headerEntries))
    
    try {
      console.log('📖 Parsing request body...')
      const body = await request.json() as { config: TableConfig }
      const creatorId = request.headers.get('X-Creator-ID')
      const creatorUsername = request.headers.get('X-Creator-Username')
      
      console.log('✅ Successfully parsed body:', JSON.stringify(body, null, 2))
      console.log('👤 Creator ID:', creatorId)
      console.log('👤 Creator Username:', creatorUsername)
      console.log('🔧 Current state before update:', JSON.stringify({
        tableId: this.state.tableId,
        initialized: this.initialized,
        playersCount: this.state.players.size,
        connectionsCount: this.state.connections.size
      }, null, 2))

      // Update table configuration
      console.log('🔄 Updating table configuration...')
      this.state.config = body.config
      this.state.tableId = body.config.id
      this.state.createdAt = Date.now()
      this.state.lastActivity = Date.now()
      
      console.log('💾 State updated, preparing to save...')
      console.log('🆔 Table ID:', this.state.tableId)
      console.log('⚙️ Config:', JSON.stringify(this.state.config, null, 2))

      // Save state using helper method
      console.log('🔐 Calling saveState()...')
      await this.saveState()
      console.log('✅ saveState() completed successfully')

      console.log('🎉 Preparing success response...')
      const successResponse = {
        success: true,
        tableId: this.state.tableId,
        config: this.state.config,
        createdBy: creatorUsername,
        createdAt: this.state.createdAt
      }
      
      console.log('📤 Success response:', JSON.stringify(successResponse, null, 2))
      
      return new Response(JSON.stringify(successResponse), {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error: any) {
      console.error('❌ CRITICAL ERROR in handleCreateTable:', error)
      console.error('🔍 Error name:', error?.name)
      console.error('🔍 Error message:', error?.message)  
      console.error('🔍 Error stack:', error?.stack)
      console.error('🔍 Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)))
      console.error('🔧 State at time of error:', JSON.stringify({
        tableId: this.state?.tableId,
        initialized: this.initialized,
        hasConfig: !!this.state?.config,
        playersSize: this.state?.players?.size,
        connectionsSize: this.state?.connections?.size
      }))
      
      const errorResponse = {
        success: false,
        error: 'Failed to create table',
        details: error?.message || 'Unknown error',
        timestamp: new Date().toISOString(),
        errorType: error?.name || 'UnknownError'
      }
      
      console.error('📤 Error response:', JSON.stringify(errorResponse, null, 2))
      
      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  /**
   * Handle player join via REST
   */
  private async handleJoinTableREST(request: Request): Promise<Response> {
    try {
      const body = await request.json() as { playerId: string; buyIn: number; password?: string }
      const playerId = request.headers.get('X-Player-ID') || body.playerId
      const username = request.headers.get('X-Username') || `Player_${playerId.substring(0, 8)}`

      // Validate join conditions
      if (this.state.players.size >= this.state.config.maxPlayers) {
        return new Response(JSON.stringify({
          success: false,
          error: { message: 'Table is full' }
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      if (this.state.players.has(playerId)) {
        return new Response(JSON.stringify({
          success: false,
          error: { message: 'Player already at table' }
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      // Validate buy-in
      if (body.buyIn < this.state.config.minBuyIn || body.buyIn > this.state.config.maxBuyIn) {
        return new Response(JSON.stringify({
          success: false,
          error: { message: `Buy-in must be between ${this.state.config.minBuyIn} and ${this.state.config.maxBuyIn}` }
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      // Add player to table
      const player: GameTablePlayer = {
        id: playerId,
        username,
        email: '',
        chipCount: body.buyIn,
        chips: body.buyIn,
        status: PlayerStatus.ACTIVE,
        isDealer: false,
        timeBank: this.state.config.timeBank,
        position: {
          seat: this.findNextAvailableSeat(),
          isButton: false,
          isSmallBlind: false,
          isBigBlind: false
        },
        isFolded: false,
        currentBet: 0,
        hasActed: false,
        holeCards: []
      }

      this.state.players.set(playerId, player)
      this.state.lastActivity = Date.now()

      // Save state using helper method
      await this.saveState()

      // Broadcast to all connected players
      await this.broadcastTableState()

      // Start game if we have enough players
      if (this.state.players.size >= 2 && !this.state.game) {
        console.log('Starting new game - players:', this.state.players.size, 'game:', this.state.game)
        // In Durable Objects, we should await the game start directly
        await this.startNewGame()
        console.log('Game started - game state:', this.state.game)
        
        // Broadcast the game start immediately
        await this.broadcastTableState()
        
        // Update the response to include game state
        return new Response(JSON.stringify({
          success: true,
          tableId: this.state.tableId,
          position: player.position,
          chipCount: player.chips,
          gameStarted: true,
          gameState: this.state.game
        }), {
          headers: { 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({
        success: true,
        tableId: this.state.tableId,
        position: player.position,
        chipCount: player.chips
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error('Join table error:', error)
      return new Response(JSON.stringify({
        success: false,
        error: { message: 'Failed to join table' }
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  /**
   * Handle player leave via REST
   */
  private async handleLeaveTableREST(request: Request): Promise<Response> {
    try {
      const playerId = request.headers.get('X-Player-ID')
      if (!playerId || !this.state.players.has(playerId)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Player not at table'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      await this.removePlayerFromTable(playerId)

      return new Response(JSON.stringify({
        success: true,
        message: 'Left table successfully'
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to leave table'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  /**
   * Handle get table state
   */
  private async handleGetTableState(request: Request): Promise<Response> {
    return new Response(JSON.stringify({
      tableId: this.state.tableId,
      config: this.state.config,
      players: this.getPlayersDTO(),
      gameState: this.state.gameState,
      playerCount: this.state.players.size,
      isActive: this.state.game !== null,
      lastActivity: this.state.lastActivity,
      pot: this.state.game?.pot || 0,
      activePlayerId: this.state.game?.activePlayerId,
      phase: this.state.game?.phase
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Handle player action via REST
   */
  private async handlePlayerActionREST(request: Request): Promise<Response> {
    try {
      const body = await request.json() as { playerId: string; action: string; amount?: number }
      const playerId = request.headers.get('X-Player-ID') || body.playerId

      // Process action (simplified for now)
      // In a real implementation, this would use the PokerGame class
      await this.handlePlayerAction(null as any, body)

      return new Response(JSON.stringify({
        success: true,
        action: body.action,
        amount: body.amount
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to process action'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  /**
   * Handle WebSocket connection to the table
   */
  async webSocketMessage(websocket: WebSocket, message: string): Promise<void> {
    try {
      const data = JSON.parse(message)
      const { type, payload } = data

      console.log(`[DO WS] GameTable received message: ${type}`, payload)
      
      // Check for reconnection
      if (payload?.playerId) {
        const existingConnection = this.state.connections.get(payload.playerId)
        if (existingConnection && !existingConnection.isConnected) {
          // Player is reconnecting
          existingConnection.websocket = websocket
          existingConnection.isConnected = true
          existingConnection.lastHeartbeat = Date.now()
          
          // Update player status if they were disconnected
          const player = this.state.players.get(payload.playerId)
          if (player && player.status === PlayerStatus.DISCONNECTED) {
            player.status = PlayerStatus.ACTIVE
            
            // Broadcast reconnection
            await this.broadcastPlayerStateTransition(payload.playerId, {
              from: 'disconnected',
              to: 'player',
              reason: 'reconnected'
            })
          }
          
          // Send state sync on reconnection
          await this.handleStateSync(websocket, payload)
        }
      }

      switch (type) {
        case 'join_table':
          await this.handleJoinTable(websocket, payload)
          break
          
        case 'leave_table':
          await this.handleLeaveTable(websocket, payload)
          break
          
        case 'player_action':
          await this.handlePlayerAction(websocket, payload)
          break
          
        case 'spectate_table':
          await this.handleSpectateTable(websocket, payload)
          break
          
        case 'leave_spectator':
          await this.handleLeaveSpectator(websocket, payload)
          break
          
        case 'reserve_seat':
          await this.handleReserveSeat(websocket, payload)
          break
          
        case 'stand_up':
          await this.handleStandUp(websocket, payload)
          break
          
        case 'heartbeat':
          await this.handleHeartbeat(websocket, payload)
          break
          
        case 'chat_message':
          await this.handleChatMessage(websocket, payload)
          break
          
        case 'request_state_sync':
          await this.handleStateSync(websocket, payload)
          break
          
        default:
          console.warn(`Unknown message type: ${type}`)
          this.sendError(websocket, `Unknown message type: ${type}`)
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error)
      this.sendError(websocket, 'Failed to process message')
    }
  }

  /**
   * Handle WebSocket connection close
   */
  async webSocketClose(websocket: WebSocket, code: number, reason: string): Promise<void> {
    console.log(`WebSocket closed: code=${code}, reason=${reason}`)
    
    // Find and remove the connection
    for (const [playerId, connection] of this.state.connections) {
      if (connection.websocket === websocket) {
        connection.isConnected = false
        
        // Check if this is a spectator
        if (this.state.spectators.has(playerId)) {
          // Remove spectator immediately
          this.state.spectators.delete(playerId)
          this.state.connections.delete(playerId)
          
          // Broadcast spectator count update
          await this.broadcastMessage(this.buildMessage('spectator_count_update', {
              count: this.state.spectators.size,
              spectators: Array.from(this.state.spectators.values())
            }))
        } else if (this.state.players.has(playerId)) {
          // Mark player as disconnected
          const player = this.state.players.get(playerId)
          if (player) {
            player.status = PlayerStatus.DISCONNECTED
          }
          
          // Broadcast player disconnection
          await this.broadcastPlayerStateTransition(playerId, {
            from: 'player',
            to: 'disconnected',
            reason: 'websocket_closed',
            details: { code, reason }
          })
          
          // Give player 30 seconds to reconnect before removing from game
          setTimeout(async () => {
            const currentConnection = this.state.connections.get(playerId)
            if (!currentConnection || !currentConnection.isConnected) {
              // Player didn't reconnect, remove them
              await this.removePlayerFromTable(playerId)
              
              // Broadcast final state transition
              await this.broadcastPlayerStateTransition(playerId, {
                from: 'disconnected',
                to: 'spectator',
                reason: 'timeout',
                details: { timeoutDuration: 30000 }
              })
            }
          }, 30000)
        }
        
        break
      }
    }
    
    await this.broadcastTableState()
  }

  /**
   * Handle player joining the table
   */
  private async handleJoinTable(websocket: WebSocket, payload: any): Promise<void> {
    const { playerId, username, chipCount, seatIndex } = payload

    // Validate player can join
    if (this.state.players.size >= this.state.config.maxPlayers) {
      this.sendError(websocket, 'Table is full')
      return
    }

    if (this.state.players.has(playerId)) {
      this.sendError(websocket, 'Player already at table')
      return
    }

    // Determine seat - use requested seat if valid, otherwise find next available
    let assignedSeat = seatIndex
    
    // If seat was specified, validate it
    if (assignedSeat !== undefined && assignedSeat !== null) {
      // Check if seat is occupied
      const seatOccupied = Array.from(this.state.players.values()).some(
        p => p.position?.seat === assignedSeat
      )
      
      if (seatOccupied) {
        this.sendError(websocket, 'Requested seat is already occupied')
        return
      }
      
      // Clear any reservation for this seat if it belongs to this player
      const reservation = this.state.seatReservations.get(assignedSeat)
      if (reservation && reservation.playerId === playerId) {
        this.state.seatReservations.delete(assignedSeat)
      }
    } else {
      // No seat specified, find next available
      assignedSeat = this.findNextAvailableSeat()
    }
    
    // Remove player from spectators if they were spectating
    if (this.state.spectators.has(playerId)) {
      this.state.spectators.delete(playerId)
    }
    
    // Add player to table
    const player: GameTablePlayer = {
      id: playerId,
      username,
      email: '', // Not needed for table play
      chipCount: chipCount || this.state.config.minBuyIn,
      chips: chipCount || this.state.config.minBuyIn, // Runtime chips
      status: PlayerStatus.ACTIVE,
      isDealer: false,
      timeBank: this.state.config.timeBank,
      position: {
        seat: assignedSeat,
        isButton: false,
        isSmallBlind: false,
        isBigBlind: false
      },
      isFolded: false,
      currentBet: 0,
      hasActed: false,
      holeCards: [] // Will be dealt when game starts
    }

    this.state.players.set(playerId, player)
    
    // Add connection
    const connection: PlayerConnection = {
      websocket,
      playerId,
      username,
      isConnected: true,
      lastHeartbeat: Date.now()
    }
    
    this.state.connections.set(playerId, connection)
    this.state.lastActivity = Date.now()

    console.log(`Player ${username} joined table. Players: ${this.state.players.size}`)

    // Send join confirmation
    this.sendMessage(websocket, this.buildMessage('join_table_success', {
        tableId: this.state.tableId,
        position: player.position,
        chipCount: player.chips
      }))
    
    // Send wallet balance update
    this.sendMessage(websocket, this.buildMessage('wallet_balance_update', {
      playerId,
      changeAmount: -chipCount,
      changeType: 'buy_in',
      tableId: this.state.tableId,
      description: `Bought in for ${chipCount} chips`
    }))
    
    // Broadcast seat availability update
    await this.broadcastMessage(this.buildMessage('seat_availability_update', {
        seatIndex,
        available: false,
        reserved: false,
        playerId,
        username
      }))
    
    // Broadcast player state transition
    await this.broadcastPlayerStateTransition(playerId, {
      from: 'spectator',
      to: 'player',
      reason: 'joined_table',
      details: { seatIndex, chipCount }
    })

    // Start game if we have enough players and no game in progress
    if (this.state.players.size >= 2 && !this.state.game) {
      await this.startNewGame()
    }

    await this.broadcastTableState()
  }

  /**
   * Handle player leaving the table
   */
  private async handleLeaveTable(websocket: WebSocket, payload: any): Promise<void> {
    const { playerId } = payload
    
    if (!this.state.players.has(playerId)) {
      this.sendError(websocket, 'Player not at table')
      return
    }

    await this.removePlayerFromTable(playerId)
    
    this.sendMessage(websocket, this.buildMessage('leave_table_success', { tableId: this.state.tableId }))
  }

  /**
   * Handle player action (fold, check, call, bet, raise)
   */
  private async handlePlayerAction(websocket: WebSocket, payload: any): Promise<void> {
    const { action, amount } = payload
    
    // Get playerId from WebSocket connection
    const playerId = this.getPlayerIdFromWebSocket(websocket)
    
    if (!playerId) {
      this.sendError(websocket, 'WebSocket not associated with player')
      return
    }

    if (!this.state.game) {
      this.sendError(websocket, 'No game in progress')
      return
    }

    // Check both connections AND players map
    if (!this.state.players.has(playerId)) {
      this.sendError(websocket, 'Player not seated at table')
      return
    }
    
    const player = this.state.players.get(playerId)
    if (!player || player.status !== 'active') {
      this.sendError(websocket, 'Player not active in game')
      return
    }

    try {
      // Validate and process action through game engine
      const actionResult = await this.processPlayerAction(playerId, action, amount)
      
      if (!actionResult.success) {
        this.sendError(websocket, actionResult.error || 'Invalid action')
        return
      }

      // Send action confirmation to acting player
      this.sendMessage(websocket, this.buildMessage('action_success', {
          action,
          amount,
          newChipCount: this.state.players.get(playerId)?.chips
        }))

      // Broadcast action to all players
      await this.broadcastPlayerAction(playerId, action, amount)

      // Check if hand is complete
      if (this.state.game.phase === GamePhase.SHOWDOWN) {
        await this.handleShowdown()
      } else if (this.state.game.phase === GamePhase.FINISHED) {
        await this.startNewGame()
      }

      await this.broadcastTableState()
      
    } catch (error) {
      console.error('Error processing player action:', error)
      this.sendError(websocket, 'Failed to process action')
    }
  }

  /**
   * Handle spectator joining to watch the table
   */
  private async handleSpectateTable(websocket: WebSocket, payload: any): Promise<void> {
    const { playerId, username } = payload

    // Add to spectators map with info
    this.state.spectators.set(playerId, {
      id: playerId,
      username,
      joinedAt: Date.now()
    })
    
    // Also track connection for WebSocket management
    const connection: PlayerConnection = {
      websocket,
      playerId,
      username,
      isConnected: true,
      lastHeartbeat: Date.now()
    }
    
    this.state.connections.set(playerId, connection)

    // Send success with current table state
    this.sendMessage(websocket, this.buildMessage('spectator_joined', {
        tableId: this.state.tableId,
        tableState: await this.getTableStateForClient(),
        spectatorCount: this.state.spectators.size
      }))
    
    // Send seat availability to new spectator
    await this.broadcastSeatAvailability()

    // Broadcast spectator count update to all
    await this.broadcastMessage(this.buildMessage('spectator_count_update', {
        count: this.state.spectators.size,
        spectators: Array.from(this.state.spectators.values())
      }))
  }

  /**
   * Handle spectator leaving the table
   */
  private async handleLeaveSpectator(websocket: WebSocket, payload: any): Promise<void> {
    const { playerId } = payload
    
    // Remove from spectators
    this.state.spectators.delete(playerId)
    this.state.connections.delete(playerId)
    
    // Notify spectator they've left
    this.sendMessage(websocket, this.buildMessage('left_table', { tableId: this.state.tableId }))
    
    // Broadcast updated spectator count
    await this.broadcastMessage(this.buildMessage('spectator_count_update', {
        count: this.state.spectators.size,
        spectators: Array.from(this.state.spectators.values())
      }))
  }

  /**
   * Handle seat reservation request
   */
  private async handleReserveSeat(websocket: WebSocket, payload: any): Promise<void> {
    const { playerId, username, seatIndex } = payload
    
    // Check if seat is already occupied
    const seatOccupied = Array.from(this.state.players.values()).some(
      player => player.position?.seat === seatIndex
    )
    
    if (seatOccupied) {
      return this.sendMessage(websocket, this.buildMessage('seat_unavailable', {
          seatIndex,
          reason: 'Seat is already occupied'
        }))
    }
    
    // Check if seat is already reserved
    const existingReservation = this.state.seatReservations.get(seatIndex)
    if (existingReservation && existingReservation.expiresAt > Date.now()) {
      return this.sendMessage(websocket, this.buildMessage('seat_unavailable', {
          seatIndex,
          reason: 'Seat is reserved by another player'
        }))
    }
    
    // Remove any existing reservations by this player
    for (const [seat, reservation] of this.state.seatReservations.entries()) {
      if (reservation.playerId === playerId) {
        this.state.seatReservations.delete(seat)
      }
    }
    
    // Create new reservation
    const reservation: SeatReservation = {
      playerId,
      username,
      seatIndex,
      reservedAt: Date.now(),
      expiresAt: Date.now() + 60000 // 60 second reservation
    }
    
    this.state.seatReservations.set(seatIndex, reservation)
    
    // Send confirmation to player
    this.sendMessage(websocket, this.buildMessage('seat_reserved', {
        seatIndex,
        reservation,
        expiresIn: 60
      }))
    
    // Broadcast reservation to all
    await this.broadcastMessage(this.buildMessage('seat_reservation_update', {
        seatIndex,
        reserved: true,
        playerId,
        expiresAt: reservation.expiresAt
      }))
    
    // Set timer to expire reservation
    setTimeout(() => {
      const currentReservation = this.state.seatReservations.get(seatIndex)
      if (currentReservation && currentReservation.playerId === playerId) {
        this.state.seatReservations.delete(seatIndex)
        
        // Broadcast expiration
        this.broadcastMessage(this.buildMessage('seat_reservation_expired', { seatIndex }))
      }
    }, 60000)
  }

  /**
   * Broadcast player state transition
   */
  private async broadcastPlayerStateTransition(
    playerId: string,
    transition: {
      from: 'spectator' | 'player' | 'disconnected',
      to: 'spectator' | 'player' | 'disconnected',
      reason?: string,
      details?: any
    }
  ): Promise<void> {
    await this.broadcastMessage(this.buildMessage('player_state_transition', {
        playerId,
        transition,
        timestamp: Date.now()
      }))
  }

  /**
   * Broadcast seat availability for all seats
   */
  private async broadcastSeatAvailability(): Promise<void> {
    const seatStatus = []
    
    // Check all 9 seats
    for (let i = 0; i < 9; i++) {
      let available = true
      let reserved = false
      let playerId = undefined
      let username = undefined
      
      // Check if seat is occupied
      for (const [pid, player] of this.state.players) {
        if (player.position?.seat === i) {
          available = false
          playerId = pid
          username = player.username
          break
        }
      }
      
      // Check if seat is reserved
      const reservation = this.state.seatReservations.get(i)
      if (reservation && reservation.expiresAt > Date.now()) {
        reserved = true
        available = false
      }
      
      seatStatus.push({
        seatIndex: i,
        available,
        reserved,
        playerId,
        username
      })
    }
    
    await this.broadcastMessage(this.buildMessage('seat_availability_bulk', {
        seats: seatStatus
      }))
  }

  /**
   * Handle player standing up from table
   */
  private async handleStandUp(websocket: WebSocket, payload: any): Promise<void> {
    const { playerId } = payload
    const player = this.state.players.get(playerId)
    
    if (!player) {
      return this.sendError(websocket, 'Player not at table')
    }
    
    // Check if player is in active hand
    if (this.isPlayerInActiveHand(playerId)) {
      return this.sendError(websocket, 'Cannot stand up during active hand')
    }
    
    // Get player's current chips
    const chipCount = player.chips
    const seatIndex = player.position?.seat
    
    // Remove player from table
    this.state.players.delete(playerId)
    
    // Add back as spectator
    this.state.spectators.set(playerId, {
      id: playerId,
      username: player.username,
      joinedAt: Date.now()
    })
    
    // Send confirmation with chip count
    this.sendMessage(websocket, this.buildMessage('stand_up_success', {
        chipCount,
        returnedToBankroll: true,
        seatIndex
      }))
    
    // Send wallet balance update
    this.sendMessage(websocket, this.buildMessage('wallet_balance_update', {
      playerId,
      changeAmount: chipCount,
      changeType: 'cash_out',
      tableId: this.state.tableId,
      description: `Cashed out ${chipCount} chips from table`
    }))
    
    // Broadcast table update
    await this.broadcastTableState()
    
    // Broadcast spectator update
    await this.broadcastMessage(this.buildMessage('player_stood_up', {
        playerId,
        username: player.username,
        seatIndex,
        chipCount
      }))
    
    // Broadcast seat availability update
    if (seatIndex !== undefined) {
      await this.broadcastMessage(this.buildMessage('seat_availability_update', {
          seatIndex,
          available: true,
          reserved: false
        }))
    }
    
    // Broadcast player state transition
    await this.broadcastPlayerStateTransition(playerId, {
      from: 'player',
      to: 'spectator',
      reason: 'stood_up',
      details: { chipCount, seatIndex }
    })
    
    // Update spectator count
    await this.broadcastMessage(this.buildMessage('spectator_count_update', {
        count: this.state.spectators.size,
        spectators: Array.from(this.state.spectators.values())
      }))
    
    console.log(`Player ${player.username} stood up from seat ${seatIndex} with ${chipCount} chips`)
  }

  /**
   * Helper to check if player is in active hand
   */
  private isPlayerInActiveHand(playerId: string): boolean {
    if (!this.state.game || this.state.game.phase === GamePhase.WAITING) {
      return false
    }
    
    const player = this.state.players.get(playerId)
    if (!player || player.isFolded) {
      return false
    }
    
    // Player is in active hand if game is running and they haven't folded
    return this.state.game.phase !== GamePhase.SHOWDOWN
  }

  /**
   * Handle heartbeat to keep connection alive
   */
  private async handleHeartbeat(websocket: WebSocket, payload: any): Promise<void> {
    const { playerId } = payload
    const connection = this.state.connections.get(playerId)
    
    if (connection) {
      connection.lastHeartbeat = Date.now()
      connection.isConnected = true
    }

    this.sendMessage(websocket, this.buildMessage('heartbeat_ack', { timestamp: Date.now() }))
  }

  /**
   * Handle state synchronization request
   */
  private async handleStateSync(websocket: WebSocket, payload: any): Promise<void> {
    const { playerId } = payload
    
    // Get connection to determine if player or spectator
    const connection = this.state.connections.get(playerId)
    if (!connection) {
      return this.sendError(websocket, 'Not connected to table')
    }
    
    // Send complete table state
    const tableState = await this.getTableStateForClient()
    
    this.sendMessage(websocket, this.buildMessage('state_sync_response', {
        tableState,
        isPlayer: this.state.players.has(playerId),
        isSpectator: this.state.spectators.has(playerId),
        playerData: this.state.players.get(playerId) || null,
        timestamp: Date.now()
      }))
    
    // Send seat availability
    await this.broadcastSeatAvailability()
    
    // Send current player's hole cards if they're a player and game is active
    if (this.state.players.has(playerId) && this.state.game && this.state.game.phase !== GamePhase.WAITING) {
      const player = this.state.players.get(playerId)
      if (player && player.holeCards) {
        this.sendMessage(websocket, this.buildMessage('hole_cards', {
            cards: player.holeCards
          }))
      }
    }
  }

  /**
   * Handle chat messages between players
   */
  private async handleChatMessage(websocket: WebSocket, payload: any): Promise<void> {
    const { playerId, message } = payload
    const player = this.state.players.get(playerId)
    
    if (!player) {
      this.sendError(websocket, 'Player not at table')
      return
    }

    // Basic message moderation (extend as needed)
    if (message.length > 200) {
      this.sendError(websocket, 'Message too long')
      return
    }

    // Broadcast chat message to all players
    await this.broadcastChatMessage(playerId, player.username, message)
  }

  /**
   * Process player action through game engine
   */
  private async processPlayerAction(playerId: string, action: string, amount?: number): Promise<{success: boolean, error?: string}> {
    if (!this.state.game) {
      return { success: false, error: 'No game in progress' }
    }

    const player = this.state.players.get(playerId)
    if (!player) {
      return { success: false, error: 'Player not found' }
    }

    // Validate it's the player's turn
    if (this.state.game.activePlayerId !== playerId) {
      return { success: false, error: 'Not your turn' }
    }

    // Process action based on type
    switch (action) {
      case 'fold':
        player.isFolded = true
        player.hasActed = true
        break
        
      case 'check':
        if (this.state.game.currentBet > player.currentBet) {
          return { success: false, error: 'Cannot check, must call or fold' }
        }
        player.hasActed = true
        break
        
      case 'call':
        const callAmount = this.state.game.currentBet - player.currentBet
        if (player.chips < callAmount) {
          return { success: false, error: 'Insufficient chips to call' }
        }
        player.chips -= callAmount
        player.currentBet = this.state.game.currentBet
        player.hasActed = true
        break
        
      case 'bet':
      case 'raise':
        if (!amount || amount <= 0) {
          return { success: false, error: 'Invalid bet amount' }
        }
        
        const totalBet = player.currentBet + amount
        if (totalBet <= this.state.game.currentBet) {
          return { success: false, error: 'Bet must be higher than current bet' }
        }
        
        if (player.chips < amount) {
          return { success: false, error: 'Insufficient chips' }
        }
        
        player.chips -= amount
        player.currentBet = totalBet
        this.state.game.currentBet = totalBet
        player.hasActed = true
        
        // Reset other players' hasActed flag for the raise
        for (const [id, p] of this.state.players) {
          if (id !== playerId && !p.isFolded) {
            p.hasActed = false
          }
        }
        break
        
      default:
        return { success: false, error: 'Unknown action' }
    }

    // Update pot in both game and gameState
    const newPot = this.calculatePot()
    if (this.state.game) {
      this.state.game.pot = newPot
    }
    if (this.state.gameState) {
      this.state.gameState.pot = newPot
    }

    // Advance to next player
    this.advanceToNextPlayer()
    
    return { success: true }
  }


  /**
   * Remove player from table
   */
  private async removePlayerFromTable(playerId: string): Promise<void> {
    this.state.players.delete(playerId)
    this.state.connections.delete(playerId)
    this.state.spectators.delete(playerId)
    
    // If game in progress and player was active, handle fold
    if (this.state.game && this.state.game.phase !== GamePhase.FINISHED) {
      const player = this.state.players.get(playerId)
      if (player && !player.isFolded) {
        player.isFolded = true
        this.advanceToNextPlayer()
      }
    }

    console.log(`Player ${playerId} removed from table. Players: ${this.state.players.size}`)
  }

  /**
   * Start a new poker game
   */
  private async startNewGame(): Promise<void> {
    if (this.state.players.size < 2) {
      console.log('Not enough players to start game')
      return
    }

    // Create new game state
    const playerArray = Array.from(this.state.players.values())
      .sort((a, b) => (a.position?.seat ?? 0) - (b.position?.seat ?? 0)) // Sort by seat position
    if (playerArray.length < 2) return
    
    // Determine dealer position
    let dealerIndex: number
    if (this.state.buttonPosition === -1) {
      // First game - randomly assign button
      dealerIndex = Math.floor(Math.random() * playerArray.length)
      this.state.buttonPosition = playerArray[dealerIndex]?.position?.seat ?? 0
    } else {
      // Find next active player clockwise from current button
      dealerIndex = this.findNextDealerIndex(playerArray)
      this.state.buttonPosition = playerArray[dealerIndex]?.position?.seat ?? 0
    }
    
    const dealer = playerArray[dealerIndex]!
    
    // In heads-up (2 players), dealer is small blind
    let smallBlindIndex: number
    let bigBlindIndex: number
    
    if (playerArray.length === 2) {
      smallBlindIndex = dealerIndex
      bigBlindIndex = (dealerIndex + 1) % playerArray.length
    } else {
      smallBlindIndex = (dealerIndex + 1) % playerArray.length
      bigBlindIndex = (dealerIndex + 2) % playerArray.length
    }
    
    const smallBlind = playerArray[smallBlindIndex]!
    const bigBlind = playerArray[bigBlindIndex]!
    
    this.state.game = {
      tableId: this.state.tableId,
      gameId: crypto.randomUUID(),
      phase: GamePhase.PRE_FLOP,
      pot: 0,
      sidePots: [],
      communityCards: [],
      currentBet: this.state.config.bigBlind,
      minRaise: this.state.config.bigBlind,
      activePlayerId: playerArray.length === 2 ? smallBlind.id : bigBlind.id, // In heads-up, dealer/SB acts first pre-flop
      dealerId: dealer.id,
      smallBlindId: smallBlind.id,
      bigBlindId: bigBlind.id,
      handNumber: ++this.state.handNumber,
      timestamp: new Date()
    }
    
    // Keep gameState in sync
    this.state.gameState = this.state.game

    // Reset player states
    for (const player of this.state.players.values()) {
      player.isFolded = false
      player.currentBet = 0
      player.hasActed = false
    }

    // Create new deck and shuffle
    this.deckManager = new DeckManager()
    this.deck = [...this.deckManager.cards]
    
    // Deal hole cards to each player
    for (const player of this.state.players.values()) {
      player.holeCards = [
        this.deck.pop()!,
        this.deck.pop()!
      ]
    }
    
    // Post blinds
    smallBlind.currentBet = this.state.config.smallBlind
    smallBlind.chips -= this.state.config.smallBlind
    bigBlind.currentBet = this.state.config.bigBlind
    bigBlind.chips -= this.state.config.bigBlind
    this.state.game.pot = this.state.config.smallBlind + this.state.config.bigBlind
    
    console.log(`Started new game with ${this.state.players.size} players`)
    console.log(`Dealer: ${dealer.username}, SB: ${smallBlind.username}, BB: ${bigBlind.username}`)
    
    await this.broadcastMessage(this.buildMessage('game_started', {
      gameId: this.state.game.gameId,
      phase: this.state.game.phase,
      pot: this.state.game.pot,
      dealerId: dealer.id,
      smallBlindId: smallBlind.id,
      bigBlindId: bigBlind.id,
      activePlayerId: this.state.game.activePlayerId,
      players: this.getPlayersDTO().map(p => ({
        ...p,
        isDealer: p.id === dealer.id,
        isSmallBlind: p.id === smallBlind.id,
        isBigBlind: p.id === bigBlind.id
      }))
    }))
    
    // Send hole cards privately to each player
    for (const [playerId, connection] of this.state.connections.entries()) {
      const player = this.state.players.get(playerId)
      if (player && connection.isConnected) {
        this.sendMessage(connection.websocket, this.buildMessage('hole_cards', {
            cards: player.holeCards
          }))
      }
    }
  }

  /**
   * Advance to next active player
   */
  private advanceToNextPlayer(): void {
    if (!this.state.game) return

    const activePlayers = Array.from(this.state.players.values()).filter(p => !p.isFolded)
    
    if (activePlayers.length <= 1) {
      // Only one player left, end hand
      this.state.game.phase = GamePhase.FINISHED
      // Trigger new game start after a short delay
      setTimeout(async () => {
        if (this.state.game?.phase === GamePhase.FINISHED) {
          await this.startNewGame()
          await this.broadcastTableState()
        }
      }, 2000)
      return
    }

    // Check if betting round is complete
    const playersNeedingAction = activePlayers.filter(p => !p.hasActed || p.currentBet < this.state.game!.currentBet)
    
    if (playersNeedingAction.length === 0) {
      // Betting round complete, advance to next phase
      this.advanceGamePhase()
    } else {
      // Find next player who needs to act
      const currentPlayerId = this.state.game.activePlayerId
      const playerArray = Array.from(this.state.players.values())
      const currentIndex = playerArray.findIndex(p => p.id === currentPlayerId)
      
      if (currentIndex >= 0) {
        for (let i = 1; i < playerArray.length; i++) {
          const nextIndex = (currentIndex + i) % playerArray.length
          const nextPlayer = playerArray[nextIndex]
          if (nextPlayer && !nextPlayer.isFolded && (!nextPlayer.hasActed || nextPlayer.currentBet < this.state.game.currentBet)) {
            this.state.game.activePlayerId = nextPlayer.id
            break
          }
        }
      }
    }
  }

  /**
   * Advance game to next phase
   */
  private advanceGamePhase(): void {
    if (!this.state.game) return

    switch (this.state.game.phase) {
      case GamePhase.PRE_FLOP:
        this.state.game.phase = GamePhase.FLOP
        // Deal flop cards
        this.deck.pop() // Burn card
        this.state.game.communityCards = [
          this.deck.pop()!,
          this.deck.pop()!,
          this.deck.pop()!
        ]
        break
      case GamePhase.FLOP:
        this.state.game.phase = GamePhase.TURN
        // Deal turn card
        this.deck.pop() // Burn card
        this.state.game.communityCards.push(this.deck.pop()!)
        break
      case GamePhase.TURN:
        this.state.game.phase = GamePhase.RIVER
        // Deal river card
        this.deck.pop() // Burn card
        this.state.game.communityCards.push(this.deck.pop()!)
        break
      case GamePhase.RIVER:
        this.state.game.phase = GamePhase.SHOWDOWN
        break
      case GamePhase.SHOWDOWN:
        this.state.game.phase = GamePhase.FINISHED
        // Trigger new game start after a short delay
        setTimeout(async () => {
          if (this.state.game?.phase === GamePhase.FINISHED) {
            await this.startNewGame()
            await this.broadcastTableState()
          }
        }, 2000)
        break
    }

    // Reset player actions and bets for new betting round
    for (const player of this.state.players.values()) {
      if (!player.isFolded) {
        player.hasActed = false
        player.currentBet = 0  // Reset current bet for new betting round
      }
    }

    this.state.game.currentBet = 0
    
    // Set first player to act (left of dealer/button)
    const playerArray = Array.from(this.state.players.values()).filter(p => !p.isFolded)
    if (playerArray.length > 0) {
      const dealerIndex = playerArray.findIndex(p => p.id === this.state.game!.dealerId)
      const firstToActIndex = (dealerIndex + 1) % playerArray.length
      this.state.game.activePlayerId = playerArray[firstToActIndex]!.id
    }
  }

  /**
   * Handle showdown phase
   */
  private async handleShowdown(): Promise<void> {
    if (!this.state.game) return

    const activePlayers = Array.from(this.state.players.values()).filter(p => !p.isFolded)
    
    // Use existing hand evaluator to determine winners
    // This would integrate with our hand evaluation system
    
    console.log(`Showdown with ${activePlayers.length} players`)
    
    // For now, simulate winner determination
    // TODO: Integrate with actual hand evaluator
    
    this.state.game.phase = GamePhase.FINISHED
    
    // Trigger new game start after a short delay
    setTimeout(async () => {
      if (this.state.game?.phase === GamePhase.FINISHED) {
        await this.startNewGame()
        await this.broadcastTableState()
      }
    }, 2000)
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeatMonitoring(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now()
      const timeout = 30000 // 30 seconds
      
      for (const [playerId, connection] of this.state.connections) {
        if (now - connection.lastHeartbeat > timeout) {
          console.log(`Player ${playerId} timed out`)
          connection.isConnected = false
          this.removePlayerFromTable(playerId)
        }
      }
    }, 10000) // Check every 10 seconds
  }

  /**
   * Broadcast message to all connected players
   */
  private async broadcastMessage(message: any): Promise<void> {
    const messageStr = JSON.stringify(message)
    
    for (const connection of this.state.connections.values()) {
      if (connection.isConnected) {
        try {
          connection.websocket.send(messageStr)
        } catch (error) {
          console.error(`Failed to send message to ${connection.playerId}:`, error)
          connection.isConnected = false
        }
      }
    }
  }

  /**
   * Get table state for client consumption
   */
  private async getTableStateForClient(): Promise<any> {
    const gameState = this.state.game ? {
      phase: this.state.game.phase,
      currentPlayer: this.state.game.activePlayerId,
      currentBet: this.state.game.currentBet,
      pot: this.calculatePot(),
      communityCards: this.state.game.communityCards || []
    } : null

    return {
      tableId: this.state.tableId,
      config: this.state.config,
      players: this.getPlayersDTO(),
      spectatorCount: this.state.spectators.size,
      spectators: Array.from(this.state.spectators.values()),
      gameState,
      handNumber: this.state.handNumber
    }
  }

  /**
   * Broadcast current table state to all players
   */
  private async broadcastTableState(): Promise<void> {
    const gameState = this.state.game ? {
      phase: this.state.game.phase,
      currentPlayer: this.state.game.activePlayerId,
      currentBet: this.state.game.currentBet,
      pot: this.calculatePot(),
      communityCards: this.state.game.communityCards || [],
      buttonPosition: this.state.buttonPosition >= 0 ? this.state.buttonPosition : 0,
      dealerId: this.state.game.dealerId,
      smallBlindId: this.state.game.smallBlindId,
      bigBlindId: this.state.game.bigBlindId,
      players: this.getPlayersDTO() // Include players in game state
    } : null

    await this.broadcastMessage(this.buildMessage('table_state_update', {
        tableId: this.state.tableId,
        players: this.getPlayersDTO(),
        spectatorCount: this.state.spectators.size,
        gameState,
        buttonPosition: this.state.buttonPosition >= 0 ? this.state.buttonPosition : 0,
        timestamp: Date.now()
      }))
  }

  /**
   * Broadcast player action to all players
   */
  private async broadcastPlayerAction(playerId: string, action: string, amount?: number): Promise<void> {
    const player = this.state.players.get(playerId)
    if (!player) return

    await this.broadcastMessage(this.buildMessage('player_action', {
        playerId,
        username: player.username,
        action,
        amount,
        timestamp: Date.now()
      }))
  }

  /**
   * Broadcast chat message to all players
   */
  private async broadcastChatMessage(playerId: string, username: string, message: string): Promise<void> {
    await this.broadcastMessage(this.buildMessage('chat_message', {
        playerId,
        username,
        message,
        timestamp: Date.now()
      }))
  }

  /**
   * Calculate total pot from all player bets
   */
  private calculatePot(): number {
    let total = 0
    for (const player of this.state.players.values()) {
      total += player.currentBet
    }
    return total
  }

  /**
   * Build a standardized WebSocket message
   */
  private buildMessage(type: string, payload?: any, error?: string): WebSocketMessage {
    if (error) {
      // For error messages, include error in payload
      return createWebSocketMessage(type, { ...payload, error });
    }
    return createWebSocketMessage(type, payload);
  }

  /**
   * Send message to specific WebSocket
   */
  private sendMessage(websocket: WebSocket, message: any): void {
    try {
      websocket.send(JSON.stringify(message))
    } catch (error) {
      console.error('Failed to send WebSocket message:', error)
    }
  }

  /**
   * Send error message to specific WebSocket
   */
  private sendError(websocket: WebSocket, error: string): void {
    this.sendMessage(websocket, this.buildMessage('error', undefined, error))
  }

  /**
   * Get player ID from WebSocket connection
   */
  private getPlayerIdFromWebSocket(websocket: WebSocket): string | null {
    for (const [playerId, connection] of this.state.connections.entries()) {
      if (connection.websocket === websocket) {
        return playerId
      }
    }
    return null
  }

  /**
   * Find next available seat at the table
   */
  private findNextAvailableSeat(): number {
    const occupiedSeats = new Set(
      Array.from(this.state.players.values())
        .map(p => p.position?.seat)
        .filter(seat => seat !== undefined)
    )
    
    for (let i = 0; i < this.state.config.maxPlayers; i++) {
      if (!occupiedSeats.has(i)) {
        return i
      }
    }
    
    // This shouldn't happen if we check table capacity first
    throw new Error('No available seats')
  }

  /**
   * Find next dealer index by rotating button clockwise
   */
  private findNextDealerIndex(sortedPlayers: GameTablePlayer[]): number {
    if (sortedPlayers.length === 0) return 0
    
    // Find current button holder
    const currentButtonIndex = sortedPlayers.findIndex(
      p => p.position?.seat === this.state.buttonPosition
    )
    
    // If button position not found, start at 0
    if (currentButtonIndex === -1) {
      return 0
    }
    
    // Move to next player clockwise
    let nextIndex = (currentButtonIndex + 1) % sortedPlayers.length
    let attempts = 0
    
    // Skip inactive players
    while (sortedPlayers[nextIndex]?.status !== 'active' && attempts < sortedPlayers.length) {
      nextIndex = (nextIndex + 1) % sortedPlayers.length
      attempts++
    }
    
    return nextIndex
  }

  /**
   * Get current game state for client
   */
  private getCurrentGameState(): any {
    const game = this.state.game
    if (!game) {
      return null
    }
    
    return {
      phase: game.phase,
      pot: game.pot,
      currentBet: game.currentBet,
      currentPlayer: game.activePlayerId,
      communityCards: game.communityCards || [],
      buttonPosition: this.state.buttonPosition >= 0 ? this.state.buttonPosition : 0,
      dealerId: game.dealerId,
      smallBlindId: game.smallBlindId,
      bigBlindId: game.bigBlindId,
      players: this.getPlayersDTO() // Always include players in game state
    }
  }

  /**
   * Get player at specific index
   */
  private getPlayerAtIndex(index: number): GameTablePlayer | undefined {
    const players = Array.from(this.state.players.values())
    return players[index]
  }

  /**
   * Convert player to client-safe DTO
   */
  private playerToDTO(player: GameTablePlayer, includeHoleCards: boolean = false): any {
    const isButton = player.position?.seat === this.state.buttonPosition
    return {
      id: player.id,
      username: player.username,
      chipCount: player.chips,
      chips: player.chips, // Include both for compatibility
      status: player.status,
      position: player.position?.seat ?? 0, // Return just the seat number for validator compatibility
      currentBet: player.currentBet || 0,
      isFolded: player.isFolded,
      hasActed: player.hasActed,
      isAllIn: player.chips === 0 && player.status === 'active',
      timeBank: player.timeBank,
      isButton,
      isDealer: isButton, // For compatibility
      holeCards: includeHoleCards ? player.holeCards : undefined
    }
  }

  /**
   * Get all players as DTOs
   */
  private getPlayersDTO(currentPlayerId?: string): any[] {
    return Array.from(this.state.players.values()).map(player => 
      this.playerToDTO(player, player.id === currentPlayerId)
    )
  }
}
