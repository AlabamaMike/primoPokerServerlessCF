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
  Rank
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
}

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
      handNumber: 0
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
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket]
      
      // Accept the WebSocket connection
      this.durableObjectState.acceptWebSocket(server)
      
      // Extract player info from headers
      const playerId = request.headers.get('X-Player-ID')
      const username = request.headers.get('X-Username')
      
      if (playerId && username) {
        // Store connection info
        const connection: PlayerConnection = {
          websocket: server,
          playerId,
          username,
          isConnected: true,
          lastHeartbeat: Date.now()
        }
        this.state.connections.set(playerId, connection)
      }
      
      return new Response(null, {
        status: 101,
        webSocket: client,
      })
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
    console.log('GameTableDO - handleCreateTable called')
    try {
      const body = await request.json() as { config: TableConfig }
      const creatorId = request.headers.get('X-Creator-ID')
      const creatorUsername = request.headers.get('X-Creator-Username')
      console.log('GameTableDO - handleCreateTable - Body:', JSON.stringify(body))

      // Update table configuration
      this.state.config = body.config
      this.state.tableId = body.config.id
      this.state.createdAt = Date.now()
      this.state.lastActivity = Date.now()

      // Save state
      await this.durableObjectState.storage.put('tableState', this.state)

      return new Response(JSON.stringify({
        success: true,
        tableId: this.state.tableId,
        config: this.state.config,
        createdBy: creatorUsername,
        createdAt: this.state.createdAt
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to create table'
      }), {
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

      // Save state
      await this.durableObjectState.storage.put('tableState', this.state)

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
      players: Array.from(this.state.players.values()).map(p => ({
        id: p.id,
        username: p.username,
        chipCount: p.chips,
        position: p.position,
        status: p.status,
        currentBet: p.currentBet,
        isFolded: p.isFolded
      })),
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

      console.log(`GameTable received message: ${type}`, payload)

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
          await this.broadcastMessage({
            type: 'spectator_count_update',
            data: {
              count: this.state.spectators.size,
              spectators: Array.from(this.state.spectators.values())
            }
          })
        } else if (this.state.players.has(playerId)) {
          // Give player 30 seconds to reconnect before removing from game
          setTimeout(() => {
            if (!connection.isConnected) {
              this.removePlayerFromTable(playerId)
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
    this.sendMessage(websocket, {
      type: 'join_table_success',
      data: {
        tableId: this.state.tableId,
        position: player.position,
        chipCount: player.chips
      }
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
    
    this.sendMessage(websocket, {
      type: 'leave_table_success',
      data: { tableId: this.state.tableId }
    })
  }

  /**
   * Handle player action (fold, check, call, bet, raise)
   */
  private async handlePlayerAction(websocket: WebSocket, payload: any): Promise<void> {
    const { playerId, action, amount } = payload

    if (!this.state.game) {
      this.sendError(websocket, 'No game in progress')
      return
    }

    if (!this.state.players.has(playerId)) {
      this.sendError(websocket, 'Player not at table')
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
      this.sendMessage(websocket, {
        type: 'action_success',
        data: {
          action,
          amount,
          newChipCount: this.state.players.get(playerId)?.chips
        }
      })

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
    this.sendMessage(websocket, {
      type: 'spectator_joined',
      data: {
        tableId: this.state.tableId,
        tableState: await this.getTableStateForClient(),
        spectatorCount: this.state.spectators.size
      }
    })

    // Broadcast spectator count update to all
    await this.broadcastMessage({
      type: 'spectator_count_update',
      data: {
        count: this.state.spectators.size,
        spectators: Array.from(this.state.spectators.values())
      }
    })
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
    this.sendMessage(websocket, {
      type: 'left_table',
      data: { tableId: this.state.tableId }
    })
    
    // Broadcast updated spectator count
    await this.broadcastMessage({
      type: 'spectator_count_update',
      data: {
        count: this.state.spectators.size,
        spectators: Array.from(this.state.spectators.values())
      }
    })
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
      return this.sendMessage(websocket, {
        type: 'seat_unavailable',
        data: {
          seatIndex,
          reason: 'Seat is already occupied'
        }
      })
    }
    
    // Check if seat is already reserved
    const existingReservation = this.state.seatReservations.get(seatIndex)
    if (existingReservation && existingReservation.expiresAt > Date.now()) {
      return this.sendMessage(websocket, {
        type: 'seat_unavailable',
        data: {
          seatIndex,
          reason: 'Seat is reserved by another player'
        }
      })
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
    this.sendMessage(websocket, {
      type: 'seat_reserved',
      data: {
        seatIndex,
        reservation,
        expiresIn: 60
      }
    })
    
    // Broadcast reservation to all
    await this.broadcastMessage({
      type: 'seat_reservation_update',
      data: {
        seatIndex,
        reserved: true,
        playerId,
        expiresAt: reservation.expiresAt
      }
    })
    
    // Set timer to expire reservation
    setTimeout(() => {
      const currentReservation = this.state.seatReservations.get(seatIndex)
      if (currentReservation && currentReservation.playerId === playerId) {
        this.state.seatReservations.delete(seatIndex)
        
        // Broadcast expiration
        this.broadcastMessage({
          type: 'seat_reservation_expired',
          data: { seatIndex }
        })
      }
    }, 60000)
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
    this.sendMessage(websocket, {
      type: 'stand_up_success',
      data: {
        chipCount,
        returnedToBankroll: true,
        seatIndex
      }
    })
    
    // Broadcast table update
    await this.broadcastTableState()
    
    // Broadcast spectator update
    await this.broadcastMessage({
      type: 'player_stood_up',
      data: {
        playerId,
        username: player.username,
        seatIndex,
        chipCount
      }
    })
    
    // Update spectator count
    await this.broadcastMessage({
      type: 'spectator_count_update',
      data: {
        count: this.state.spectators.size,
        spectators: Array.from(this.state.spectators.values())
      }
    })
    
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

    this.sendMessage(websocket, {
      type: 'heartbeat_ack',
      data: { timestamp: Date.now() }
    })
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
   * Find next available seat position
   */
  private findNextAvailableSeat(): number {
    for (let i = 0; i < this.state.config.maxPlayers; i++) {
      const seatTaken = Array.from(this.state.players.values()).some(p => p.position?.seat === i)
      if (!seatTaken) {
        return i
      }
    }
    return 0 // Should not happen if table not full
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
    if (playerArray.length < 2) return
    
    const dealerIndex = Math.floor(Math.random() * playerArray.length)
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
    
    await this.broadcastMessage({
      type: 'game_started',
      data: {
        gameId: this.state.game.gameId,
        phase: this.state.game.phase,
        pot: this.state.game.pot,
        dealerId: dealer.id,
        smallBlindId: smallBlind.id,
        bigBlindId: bigBlind.id,
        activePlayerId: this.state.game.activePlayerId,
        players: Array.from(this.state.players.values()).map(p => ({
          id: p.id,
          username: p.username,
          chipCount: p.chips,
          position: p.position,
          currentBet: p.currentBet,
          isFolded: p.isFolded,
          isDealer: p.id === dealer.id,
          isSmallBlind: p.id === smallBlind.id,
          isBigBlind: p.id === bigBlind.id,
          // Only send hole cards to the player themselves
          holeCards: undefined // Will be sent separately
        }))
      }
    })
    
    // Send hole cards privately to each player
    for (const [playerId, connection] of this.state.connections.entries()) {
      const player = this.state.players.get(playerId)
      if (player && connection.isConnected) {
        this.sendMessage(connection.websocket, {
          type: 'hole_cards',
          data: {
            cards: player.holeCards
          }
        })
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
    }

    // Reset player actions for new betting round
    for (const player of this.state.players.values()) {
      if (!player.isFolded) {
        player.hasActed = false
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
      players: Array.from(this.state.players.values()).map(p => ({
        id: p.id,
        username: p.username,
        position: p.position,
        chipCount: p.chips,
        status: p.status,
        isDealer: p.isDealer,
        isFolded: p.isFolded,
        currentBet: p.currentBet
      })),
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
      communityCards: this.state.game.communityCards || []
    } : null

    await this.broadcastMessage({
      type: 'table_state_update',
      data: {
        tableId: this.state.tableId,
        players: Array.from(this.state.players.values()),
        spectatorCount: this.state.spectators.size,
        gameState,
        timestamp: Date.now()
      }
    })
  }

  /**
   * Broadcast player action to all players
   */
  private async broadcastPlayerAction(playerId: string, action: string, amount?: number): Promise<void> {
    const player = this.state.players.get(playerId)
    if (!player) return

    await this.broadcastMessage({
      type: 'player_action',
      data: {
        playerId,
        username: player.username,
        action,
        amount,
        timestamp: Date.now()
      }
    })
  }

  /**
   * Broadcast chat message to all players
   */
  private async broadcastChatMessage(playerId: string, username: string, message: string): Promise<void> {
    await this.broadcastMessage({
      type: 'chat_message',
      data: {
        playerId,
        username,
        message,
        timestamp: Date.now()
      }
    })
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
    this.sendMessage(websocket, {
      type: 'error',
      data: { error, timestamp: Date.now() }
    })
  }
}
