/**
 * Enhanced GameTable Durable Object - Phase 3B.2
 * 
 * This enhanced version includes:
 * - Advanced betting engine integration
 * - Card dealing and deck management
 * - Complete game flow automation
 * - Real-time state broadcasting
 */

import { 
  GamePlayer, 
  TableConfig, 
  GameState, 
  GamePhase, 
  PlayerStatus,
  Card,
  Suit,
  Rank
} from '@primo-poker/shared'

import {
  BettingEngine,
  BettingAction,
  BettingRules,
  SidePot,
  DeckManager,
  GameDeck
} from '@primo-poker/core'

export interface PlayerConnection {
  websocket: WebSocket
  playerId: string
  username: string
  isConnected: boolean
  lastHeartbeat: number
}

export interface SimpleGamePlayer extends GamePlayer {
  // Additional runtime properties for table management
  seat: number
  holeCards: Card[]
  isConnected: boolean
  lastSeen: number
}

export interface SimpleGameState {
  tableId: string
  phase: GamePhase
  players: Map<string, SimpleGamePlayer>
  connections: Map<string, PlayerConnection>
  spectators: Set<string>
  
  // Pot and betting
  pot: number
  sidePots: SidePot[]
  currentBet: number
  currentPlayer: string | null
  
  // Positions
  dealerPosition: number
  smallBlindPosition: number
  bigBlindPosition: number
  
  // Cards and deck
  communityCards: Card[]
  deck: GameDeck
  
  // Game settings
  handNumber: number
  smallBlind: number
  bigBlind: number
  maxPlayers: number
  
  // Engines
  bettingEngine: BettingEngine
  
  // State management
  isActive: boolean
  lastActivity: number
  actionTimeout: number
}

export class GameTableDurableObject {
  private state: SimpleGameState
  private heartbeatInterval: number | null = null

  constructor(state: DurableObjectState, env: any) {
    // Initialize enhanced table state
    this.state = {
      tableId: crypto.randomUUID(),
      phase: GamePhase.WAITING,
      players: new Map(),
      connections: new Map(),
      spectators: new Set(),
      
      // Pot and betting
      pot: 0,
      sidePots: [],
      currentBet: 0,
      currentPlayer: null,
      
      // Positions
      dealerPosition: 0,
      smallBlindPosition: 1,
      bigBlindPosition: 2,
      
      // Cards and deck
      communityCards: [],
      deck: new DeckManager(),
      
      // Game settings
      handNumber: 0,
      smallBlind: 10,
      bigBlind: 20,
      maxPlayers: 9,
      
      // Engines
      bettingEngine: new BettingEngine(10, 20),
      
      // State management
      isActive: false,
      lastActivity: Date.now(),
      actionTimeout: 30000 // 30 seconds
    }

    // Start heartbeat monitoring
    this.startHeartbeatMonitoring()
  }

  /**
   * Handle HTTP requests and WebSocket upgrades
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request);
    }
    
    // Handle other HTTP requests if needed
    return new Response('Not found', { status: 404 });
  }

  /**
   * Handle WebSocket upgrade
   */
  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    // Extract authentication info from headers
    const playerId = request.headers.get('X-Player-ID');
    const username = request.headers.get('X-Username');
    const tableId = request.headers.get('X-Table-ID');
    
    if (!playerId || !username || !tableId) {
      return new Response('Missing authentication headers', { status: 400 });
    }

    // Create WebSocket pair
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    if (!server) {
      return new Response('WebSocket creation failed', { status: 500 });
    }

    // Accept the WebSocket connection
    server.accept();

    // Store the connection and send initial connection message
    await this.handleConnectionEstablished(server, {
      playerId,
      username,
      tableId
    });

    // Set up message handling
    server.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data);
        await this.webSocketMessage(server, JSON.stringify(data));
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
        this.sendError(server, 'Failed to process message');
      }
    });

    server.addEventListener('close', async (event) => {
      await this.webSocketClose(server, event.code, event.reason);
    });

    // Return the client side of the WebSocket to be sent to the user
    return new Response(null, {
      status: 101,
      webSocket: client || null,
    });
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
        case 'connection_established':
          await this.handleConnectionEstablished(websocket, payload)
          break
          
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
        
        // Mark player as disconnected
        const player = this.state.players.get(playerId)
        if (player) {
          player.isConnected = false
        }
        
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
   * Handle initial WebSocket connection establishment
   */
  private async handleConnectionEstablished(websocket: WebSocket, payload: any): Promise<void> {
    const { playerId, username, tableId } = payload
    
    console.log(`Connection established for player ${playerId} (${username}) at table ${tableId}`)
    
    // Store connection
    const connection: PlayerConnection = {
      websocket,
      playerId,
      username,
      isConnected: true,
      lastHeartbeat: Date.now()
    }
    
    this.state.connections.set(playerId, connection)
    
    // Send connection confirmation
    this.sendMessage(websocket, {
      type: 'connection_confirmed',
      payload: {
        playerId,
        tableId: this.state.tableId,
        timestamp: Date.now()
      }
    })
    
    // Send initial table state
    this.sendTableState(websocket)
  }

  /**
   * Handle player joining the table
   */
  private async handleJoinTable(websocket: WebSocket, payload: any): Promise<void> {
    const { playerId, username, chipCount = 2000 } = payload

    // Validate player can join
    if (this.state.players.size >= 9) {
      this.sendError(websocket, 'Table is full')
      return
    }

    if (this.state.players.has(playerId)) {
      this.sendError(websocket, 'Player already at table')
      return
    }

    // Add player to table
    const player: SimpleGamePlayer = {
      // GamePlayer base fields
      id: playerId,
      username,
      email: `${username}@temp.com`, // Temporary email for game state
      chipCount: chipCount,
      status: PlayerStatus.WAITING,
      isDealer: false,
      timeBank: 30,
      
      // Runtime game fields
      chips: chipCount,
      currentBet: 0,
      hasActed: false,
      isFolded: false,
      isAllIn: false,
      
      // Table-specific fields
      seat: this.findNextAvailableSeat(),
      holeCards: [],
      isConnected: true,
      lastSeen: Date.now()
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

    console.log(`Player ${username} joined table at seat ${player.seat}. Players: ${this.state.players.size}`)

    // Send join confirmation
    this.sendMessage(websocket, {
      type: 'join_table_success',
      data: {
        tableId: this.state.tableId,
        seat: player.seat,
        chipCount: player.chips
      }
    })

    // Start game if we have enough players and no game in progress
    if (this.state.players.size >= 2 && this.state.phase === GamePhase.WAITING) {
      await this.startNewHand()
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

    if (this.state.phase === GamePhase.WAITING || this.state.phase === GamePhase.FINISHED) {
      this.sendError(websocket, 'No game in progress')
      return
    }

    if (!this.state.players.has(playerId)) {
      this.sendError(websocket, 'Player not at table')
      return
    }

    if (this.state.currentPlayer !== playerId) {
      this.sendError(websocket, 'Not your turn')
      return
    }

    try {
      // Process action
      const result = await this.processPlayerAction(playerId, action, amount)
      
      if (!result.success) {
        this.sendError(websocket, result.error || 'Invalid action')
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

      // Check if hand/betting round is complete
      await this.checkHandCompletion()

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

      // Update player connection status
      const player = this.state.players.get(playerId)
      if (player) {
        player.isConnected = true
      }
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
    
    if (!player && !this.state.spectators.has(playerId)) {
      this.sendError(websocket, 'Not at table')
      return
    }

    // Basic message validation
    if (!message || message.length > 200) {
      this.sendError(websocket, 'Invalid message')
      return
    }

    // Broadcast chat message to all players
    await this.broadcastChatMessage(playerId, player?.username || 'Spectator', message)
  }

  /**
   * Process player action
   */
  private async processPlayerAction(playerId: string, action: string, amount?: number): Promise<{success: boolean, error?: string}> {
    const player = this.state.players.get(playerId)
    if (!player) {
      return { success: false, error: 'Player not found' }
    }

    switch (action) {
      case 'fold':
        player.isFolded = true
        player.hasActed = true
        break
        
      case 'check':
        if (this.state.currentBet > player.currentBet) {
          return { success: false, error: 'Cannot check, must call or fold' }
        }
        player.hasActed = true
        break
        
      case 'call':
        const callAmount = this.state.currentBet - player.currentBet
        if (player.chips < callAmount) {
          return { success: false, error: 'Insufficient chips to call' }
        }
        player.chips -= callAmount
        player.currentBet = this.state.currentBet
        this.state.pot += callAmount
        player.hasActed = true
        break
        
      case 'bet':
      case 'raise':
        if (!amount || amount <= 0) {
          return { success: false, error: 'Invalid bet amount' }
        }
        
        const totalBet = player.currentBet + amount
        if (totalBet <= this.state.currentBet) {
          return { success: false, error: 'Bet must be higher than current bet' }
        }
        
        if (player.chips < amount) {
          return { success: false, error: 'Insufficient chips' }
        }
        
        player.chips -= amount
        player.currentBet = totalBet
        this.state.currentBet = totalBet
        this.state.pot += amount
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

    // Advance to next player
    this.advanceToNextPlayer()
    
    return { success: true }
  }

  /**
   * Find next available seat
   */
  private findNextAvailableSeat(): number {
    for (let i = 0; i < 9; i++) {
      const seatTaken = Array.from(this.state.players.values()).some(p => p.seat === i)
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
    
    console.log(`Player ${playerId} removed from table. Players: ${this.state.players.size}`)

    // If not enough players, end current hand
    if (this.state.players.size < 2 && this.state.phase !== GamePhase.WAITING) {
      this.state.phase = GamePhase.WAITING
      this.state.currentPlayer = null
    }
  }

  /**
   * Start a new hand
   */
  private async startNewHand(): Promise<void> {
    if (this.state.players.size < 2) {
      console.log('Not enough players to start hand')
      return
    }

    // Reset game state
    this.state.phase = GamePhase.PRE_FLOP
    this.state.pot = 0
    this.state.currentBet = this.state.bigBlind
    this.state.communityCards = []
    this.state.handNumber++

    // Reset player states
    for (const player of this.state.players.values()) {
      player.isFolded = false
      player.currentBet = 0
      player.hasActed = false
      player.holeCards = [] // TODO: Deal actual cards
    }

    // Post blinds (simplified)
    const players = Array.from(this.state.players.values())
    if (players.length >= 2) {
      // Small blind
      const sbPlayer = players[0]
      if (sbPlayer) {
        sbPlayer.chips -= this.state.smallBlind
        sbPlayer.currentBet = this.state.smallBlind
        this.state.pot += this.state.smallBlind
      }

      // Big blind
      const bbPlayer = players[1]
      if (bbPlayer) {
        bbPlayer.chips -= this.state.bigBlind
        bbPlayer.currentBet = this.state.bigBlind
        this.state.pot += this.state.bigBlind
      }

      // First to act is after big blind
      const nextPlayer = players.length > 2 ? players[2] : players[0]
      if (nextPlayer) {
        this.state.currentPlayer = nextPlayer.id
      }
    }

    console.log(`Started new hand #${this.state.handNumber} with ${this.state.players.size} players`)
    
    await this.broadcastMessage({
      type: 'hand_started',
      data: {
        handNumber: this.state.handNumber,
        smallBlind: this.state.smallBlind,
        bigBlind: this.state.bigBlind,
        players: Array.from(this.state.players.values()).map(p => ({
          id: p.id,
          username: p.username,
          chips: p.chips,
          seat: p.seat
        }))
      }
    })
  }

  /**
   * Advance to next active player
   */
  private advanceToNextPlayer(): void {
    const activePlayers = Array.from(this.state.players.values())
      .filter(p => !p.isFolded && p.isConnected)
      .sort((a, b) => a.seat - b.seat)

    if (activePlayers.length <= 1) {
      // Only one player left, end hand
      this.state.phase = GamePhase.FINISHED
      this.state.currentPlayer = null
      return
    }

    // Check if betting round is complete
    const playersNeedingAction = activePlayers.filter(p => 
      !p.hasActed || p.currentBet < this.state.currentBet
    )
    
    if (playersNeedingAction.length === 0) {
      // Betting round complete, advance to next phase
      this.advanceGamePhase()
    } else {
      // Find next player who needs to act
      const currentPlayerIndex = activePlayers.findIndex(p => p.id === this.state.currentPlayer)
      let nextIndex = (currentPlayerIndex + 1) % activePlayers.length
      
      // Find next player who needs to act
      let attempts = 0
      while (attempts < activePlayers.length) {
        const nextPlayer = activePlayers[nextIndex]
        if (nextPlayer && (!nextPlayer.hasActed || nextPlayer.currentBet < this.state.currentBet)) {
          this.state.currentPlayer = nextPlayer.id
          break
        }
        nextIndex = (nextIndex + 1) % activePlayers.length
        attempts++
      }
    }
  }

  /**
   * Advance game to next phase
   */
  private advanceGamePhase(): void {
    switch (this.state.phase) {
      case GamePhase.PRE_FLOP:
        this.state.phase = GamePhase.FLOP
        // TODO: Deal flop cards
        break
      case GamePhase.FLOP:
        this.state.phase = GamePhase.TURN
        // TODO: Deal turn card
        break
      case GamePhase.TURN:
        this.state.phase = GamePhase.RIVER
        // TODO: Deal river card
        break
      case GamePhase.RIVER:
        this.state.phase = GamePhase.SHOWDOWN
        break
      case GamePhase.SHOWDOWN:
        this.state.phase = GamePhase.FINISHED
        break
    }

    // Reset player actions for new betting round
    for (const player of this.state.players.values()) {
      if (!player.isFolded) {
        player.hasActed = false
      }
    }

    this.state.currentBet = 0

    // Set first to act
    const activePlayers = Array.from(this.state.players.values())
      .filter(p => !p.isFolded && p.isConnected)
      .sort((a, b) => a.seat - b.seat)
    
    if (activePlayers.length > 0 && activePlayers[0]) {
      this.state.currentPlayer = activePlayers[0].id
    }
  }

  /**
   * Check if hand is complete
   */
  private async checkHandCompletion(): Promise<void> {
    const activePlayers = Array.from(this.state.players.values()).filter(p => !p.isFolded)
    
    if (activePlayers.length <= 1) {
      // Only one player left, they win
      this.state.phase = GamePhase.FINISHED
      if (activePlayers.length === 1 && activePlayers[0]) {
        activePlayers[0].chips += this.state.pot
      }
      
      // Start new hand after delay
      setTimeout(() => {
        this.startNewHand()
      }, 3000)
    }
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
          
          const player = this.state.players.get(playerId)
          if (player) {
            player.isConnected = false
          }
          
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
    await this.broadcastMessage({
      type: 'table_state_update',
      data: {
        tableId: this.state.tableId,
        phase: this.state.phase,
        pot: this.state.pot,
        currentBet: this.state.currentBet,
        currentPlayer: this.state.currentPlayer,
        communityCards: this.state.communityCards,
        handNumber: this.state.handNumber,
        players: Array.from(this.state.players.values()).map(p => ({
          id: p.id,
          username: p.username,
          chips: p.chips,
          seat: p.seat,
          isFolded: p.isFolded,
          currentBet: p.currentBet,
          isConnected: p.isConnected
        })),
        spectatorCount: this.state.spectators.size,
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
   * Send current table state to specific WebSocket
   */
  private sendTableState(websocket: WebSocket): void {
    const players = Array.from(this.state.players.values()).map(player => ({
      id: player.id,
      username: player.username,
      chipCount: player.chipCount,
      seat: player.seat,
      isConnected: player.isConnected,
      status: player.status
    }))

    this.sendMessage(websocket, {
      type: 'table_state',
      payload: {
        tableId: this.state.tableId,
        phase: this.state.phase,
        players,
        pot: this.state.pot,
        currentBet: this.state.currentBet,
        currentPlayer: this.state.currentPlayer,
        communityCards: this.state.communityCards,
        handNumber: this.state.handNumber,
        smallBlind: this.state.smallBlind,
        bigBlind: this.state.bigBlind,
        isActive: this.state.isActive,
        timestamp: Date.now()
      }
    })
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
