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
  spectators: Set<string>
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

  constructor(state: DurableObjectState, env: any) {
    this.durableObjectState = state
    this.env = env
    
    // Initialize table state
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
      spectators: new Set(),
      createdAt: Date.now(),
      lastActivity: Date.now(),
      handNumber: 0
    }

    // Initialize game engines
    this.bettingEngine = new BettingEngine()
    this.deckManager = new DeckManager()

    // Start heartbeat monitoring
    this.startHeartbeatMonitoring()
  }

  /**
   * Handle HTTP requests to the Durable Object
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

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
    switch (path) {
      case '/create':
        return this.handleCreateTable(request)
      case '/join':
        return this.handleJoinTableREST(request)
      case '/leave':
        return this.handleLeaveTableREST(request)
      case '/state':
        return this.handleGetTableState(request)
      case '/action':
        return this.handlePlayerActionREST(request)
      default:
        return new Response('Not found', { status: 404 })
    }
  }

  /**
   * Handle table creation via REST
   */
  private async handleCreateTable(request: Request): Promise<Response> {
    try {
      const body = await request.json() as { config: TableConfig }
      const creatorId = request.headers.get('X-Creator-ID')
      const creatorUsername = request.headers.get('X-Creator-Username')

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
        setTimeout(() => this.startNewGame(), 1000)
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
        status: p.status
      })),
      gameState: this.state.gameState,
      playerCount: this.state.players.size,
      isActive: this.state.game !== null,
      lastActivity: this.state.lastActivity
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
        
        // Give player 30 seconds to reconnect before removing from game
        setTimeout(() => {
          if (!connection.isConnected) {
            this.removePlayerFromTable(playerId)
          }
        }, 30000)
        
        break
      }
    }
    
    await this.broadcastTableState()
  }

  /**
   * Handle player joining the table
   */
  private async handleJoinTable(websocket: WebSocket, payload: any): Promise<void> {
    const { playerId, username, chipCount } = payload

    // Validate player can join
    if (this.state.players.size >= this.state.config.maxPlayers) {
      this.sendError(websocket, 'Table is full')
      return
    }

    if (this.state.players.has(playerId)) {
      this.sendError(websocket, 'Player already at table')
      return
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
        seat: this.findNextAvailableSeat(),
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

    this.state.spectators.add(playerId)
    
    const connection: PlayerConnection = {
      websocket,
      playerId,
      username,
      isConnected: true,
      lastHeartbeat: Date.now()
    }
    
    this.state.connections.set(playerId, connection)

    this.sendMessage(websocket, {
      type: 'spectate_success',
      data: { tableId: this.state.tableId }
    })

    await this.broadcastTableState()
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
    if (!this.state.gameState) {
      return { success: false, error: 'No game in progress' }
    }

    const player = this.state.players.get(playerId)
    if (!player) {
      return { success: false, error: 'Player not found' }
    }

    // Validate it's the player's turn
    if (this.state.gameState.activePlayerId !== playerId) {
      return { success: false, error: 'Not your turn' }
    }

    // Process action based on type
    switch (action) {
      case 'fold':
        player.isFolded = true
        player.hasActed = true
        break
        
      case 'check':
        if (this.state.gameState.currentBet > player.currentBet) {
          return { success: false, error: 'Cannot check, must call or fold' }
        }
        player.hasActed = true
        break
        
      case 'call':
        const callAmount = this.state.gameState.currentBet - player.currentBet
        if (player.chips < callAmount) {
          return { success: false, error: 'Insufficient chips to call' }
        }
        player.chips -= callAmount
        player.currentBet = this.state.gameState.currentBet
        player.hasActed = true
        break
        
      case 'bet':
      case 'raise':
        if (!amount || amount <= 0) {
          return { success: false, error: 'Invalid bet amount' }
        }
        
        const totalBet = player.currentBet + amount
        if (totalBet <= this.state.gameState.currentBet) {
          return { success: false, error: 'Bet must be higher than current bet' }
        }
        
        if (player.chips < amount) {
          return { success: false, error: 'Insufficient chips' }
        }
        
        player.chips -= amount
        player.currentBet = totalBet
        this.state.gameState.currentBet = totalBet
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

    // Update pot
    this.state.gameState.pot = this.calculatePot()

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
    const smallBlindIndex = (dealerIndex + 1) % playerArray.length
    const bigBlindIndex = (dealerIndex + 2) % playerArray.length
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
      activePlayerId: bigBlind.id, // Big blind acts first pre-flop
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

    console.log(`Started new game with ${this.state.players.size} players`)
    
    await this.broadcastMessage({
      type: 'game_started',
      data: {
        players: Array.from(this.state.players.values()),
        smallBlind: this.state.config.smallBlind,
        bigBlind: this.state.config.bigBlind
      }
    })
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
        break
      case GamePhase.FLOP:
        this.state.game.phase = GamePhase.TURN
        break
      case GamePhase.TURN:
        this.state.game.phase = GamePhase.RIVER
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
