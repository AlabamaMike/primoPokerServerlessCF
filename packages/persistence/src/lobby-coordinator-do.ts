/**
 * LobbyCoordinator Durable Object - Phase 2
 * 
 * Manages global lobby state and real-time lobby updates using WebSocket broadcasts.
 * Coordinates with multiple GameTable DOs to provide a unified lobby experience.
 */

import { 
  TableListing, 
  TableFilters, 
  LobbyTableConfig,
  PublicPlayerInfo,
  TableStats,
  createWebSocketMessage,
  WebSocketMessage
} from '@primo-poker/shared'
import { logger } from '@primo-poker/core'
import { MetricsCollector, DurableObjectHealthMetric } from './monitoring/metrics'

export interface LobbyCoordinatorState {
  tables: Map<string, TableListing>
  playerTableMap: Map<string, string>
  waitingLists: Map<string, Set<string>>
  tableStats: Map<string, TableStats>
  seatReservations: Map<string, Map<string, SeatReservation>>
  createdAt: number
  lastUpdated: number
}

export interface SeatReservation {
  playerId: string
  username: string
  seatIndex: number
  reservedAt: number
  expiresAt: number
}

export interface LobbyWebSocketConnection {
  websocket: WebSocket
  clientId: string
  connectedAt: number
  filters?: TableFilters
  lastHeartbeat: number
}

export class LobbyCoordinatorDurableObject {
  private state: LobbyCoordinatorState
  private durableObjectState: DurableObjectState
  private env: any
  private initialized: boolean = false
  private connections: Map<string, LobbyWebSocketConnection> = new Map()
  private updateInterval: number | null = null
  private cleanupInterval: number | null = null
  private metrics?: MetricsCollector
  // Cache for table queries
  private tableCache: Map<string, { data: any; timestamp: number }> = new Map()
  private cacheMaxAge = 5000 // 5 seconds cache TTL

  // Constants
  private static readonly RESERVATION_DURATION = 60000 // 60 seconds
  private static readonly INACTIVE_TABLE_THRESHOLD = 30 * 60 * 1000 // 30 minutes
  private static readonly HEARTBEAT_TIMEOUT = 30000 // 30 seconds
  private static readonly UPDATE_INTERVAL = 5000 // 5 seconds
  private static readonly CLEANUP_INTERVAL = 60000 // 1 minute

  constructor(state: DurableObjectState, env: any) {
    this.durableObjectState = state
    this.env = env
    
    // Initialize state
    this.state = {
      tables: new Map(),
      playerTableMap: new Map(),
      waitingLists: new Map(),
      tableStats: new Map(),
      seatReservations: new Map(),
      createdAt: Date.now(),
      lastUpdated: Date.now()
    }

    // Initialize metrics if available
    if (env.DB && env.KV) {
      this.metrics = new MetricsCollector(env.DB, env.KV)
    }

    // Start periodic tasks
    this.startPeriodicTasks()
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
        case '/tables':
          response = await this.handleGetTables(request)
          break
        case '/tables/create':
          response = await this.handleCreateTable(request)
          break
        case '/tables/update':
          response = await this.handleUpdateTable(request)
          break
        case '/tables/remove':
          response = await this.handleRemoveTable(request)
          break
        case '/player/location':
          response = await this.handleGetPlayerLocation(request)
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
      logger.error('LobbyCoordinator error:', error as Error)
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
      const savedState = await this.durableObjectState.storage.get('lobbyState') as LobbyCoordinatorState | undefined
      if (savedState) {
        this.state = {
          ...savedState,
          tables: new Map(Object.entries(savedState.tables || {})),
          playerTableMap: new Map(Object.entries(savedState.playerTableMap || {})),
          waitingLists: new Map(Object.entries(savedState.waitingLists || {}).map(([k, v]) => [k, new Set(v as string[])])),
          tableStats: new Map(Object.entries(savedState.tableStats || {})),
          seatReservations: new Map(Object.entries(savedState.seatReservations || {}).map(([k, v]) => [k, new Map(Object.entries(v as any))]))
        }
        logger.info('Loaded saved lobby state', { tableCount: this.state.tables.size })
      }
    } catch (error) {
      logger.error('Failed to load saved lobby state:', error as Error)
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
        tables: Object.fromEntries(this.state.tables),
        playerTableMap: Object.fromEntries(this.state.playerTableMap),
        waitingLists: Object.fromEntries(Array.from(this.state.waitingLists).map(([k, v]) => [k, Array.from(v)])),
        tableStats: Object.fromEntries(this.state.tableStats),
        seatReservations: Object.fromEntries(Array.from(this.state.seatReservations).map(([k, v]) => [k, Object.fromEntries(v)]))
      }

      await this.durableObjectState.storage.put('lobbyState', stateToSave)
    } catch (error) {
      logger.error('Failed to save lobby state:', error as Error)
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

      // Extract client info
      const clientId = request.headers.get('X-Client-ID') || crypto.randomUUID()

      // Store connection
      const connection: LobbyWebSocketConnection = {
        websocket: server,
        clientId,
        connectedAt: Date.now(),
        lastHeartbeat: Date.now()
      }
      this.connections.set(clientId, connection)

      // Send initial state
      await this.sendInitialState(server)

      logger.info('Lobby WebSocket connected', { clientId })

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

      // Update heartbeat
      connection.lastHeartbeat = Date.now()

      switch (type) {
        case 'set_filters':
          connection.filters = payload.filters
          await this.sendFilteredTables(websocket, payload.filters)
          break

        case 'get_tables':
          await this.sendFilteredTables(websocket, connection.filters)
          break

        case 'get_table_stats':
          await this.sendTableStats(websocket, payload.tableId)
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
      this.connections.delete(connection.clientId)
      logger.info('Lobby WebSocket disconnected', { clientId: connection.clientId, code, reason })
    }
  }

  /**
   * Get filtered tables with advanced filtering, sorting, and pagination
   */
  private async handleGetTables(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      // Legacy GET support
      const url = new URL(request.url)
      const filters = this.parseFilters(url.searchParams)
      
      const tables = this.getFilteredTables(filters)
      
      return new Response(JSON.stringify({
        success: true,
        data: {
          tables,
          totalTables: tables.length,
          activePlayers: this.calculateActivePlayers(tables),
          lastUpdated: this.state.lastUpdated
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // New POST endpoint with advanced features
    if (request.method === 'POST') {
      const body = await request.json() as {
        filters?: {
          stakes?: string[];
          seatsAvailable?: string;
          gameType?: string;
        };
        sort?: {
          field: 'players' | 'stakes' | 'avgPot' | 'handsPerHour';
          direction: 'asc' | 'desc';
        };
        cursor?: string;
        limit?: number;
      }

      const { filters, sort, cursor, limit = 50 } = body

      // Check cache
      const cacheKey = JSON.stringify({ filters, sort, cursor, limit })
      const cached = this.tableCache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
        return new Response(JSON.stringify(cached.data), {
          headers: { 'Content-Type': 'application/json' }
        })
      }

      // Get all tables
      let tables = Array.from(this.state.tables.values())

      // Apply filters
      if (filters) {
        tables = this.applyAdvancedFilters(tables, filters)
      }

      // Apply sorting
      if (sort) {
        tables = this.applySorting(tables, sort)
      }

      // Apply pagination
      const paginatedResult = this.applyPagination(tables, cursor, Math.min(limit, 100))

      // Transform to the expected format
      const transformedTables = paginatedResult.tables.map(table => ({
        id: table.tableId,
        name: table.name,
        gameType: table.gameType,
        stakes: {
          smallBlind: table.stakes.smallBlind,
          bigBlind: table.stakes.bigBlind,
          currency: table.stakes.currency || 'USD'
        },
        seats: {
          total: table.maxPlayers,
          occupied: table.currentPlayers,
          available: table.maxPlayers - table.currentPlayers
        },
        statistics: {
          avgPot: table.avgPot || 0,
          handsPerHour: table.handsPerHour || 0,
          playersPerFlop: this.calculatePlayersPerFlop(table)
        },
        waitingList: table.waitingList || 0,
        isActive: table.status === 'playing',
        createdAt: new Date(table.createdAt).toISOString()
      }))

      const responseData = {
        tables: transformedTables,
        pagination: {
          cursor: paginatedResult.nextCursor,
          hasMore: paginatedResult.hasMore,
          total: tables.length
        }
      }

      // Cache the result
      this.tableCache.set(cacheKey, {
        data: responseData,
        timestamp: Date.now()
      })

      // Clean old cache entries
      if (this.tableCache.size > 100) {
        const now = Date.now()
        for (const [key, value] of this.tableCache) {
          if (now - value.timestamp > this.cacheMaxAge * 2) {
            this.tableCache.delete(key)
          }
        }
      }

      return new Response(JSON.stringify(responseData), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response('Method Not Allowed', { status: 405 })
  }

  /**
   * Create a new table listing
   */
  private async handleCreateTable(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    // Check authorization header
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Authorization required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const body = await request.json() as { tableId: string; config: LobbyTableConfig; creatorId: string }
    const { tableId, config, creatorId } = body

    // Create table listing
    const tableListing: TableListing = {
      tableId,
      name: config.name,
      gameType: config.gameType,
      stakes: config.stakes,
      currentPlayers: 0,
      maxPlayers: config.maxPlayers,
      isPrivate: config.isPrivate,
      requiresPassword: !!config.password,
      avgPot: 0,
      handsPerHour: 0,
      waitingList: 0,
      playerList: [],
      createdAt: Date.now(),
      lastActivity: Date.now(),
      status: 'waiting'
    }

    this.state.tables.set(tableId, tableListing)
    this.state.waitingLists.set(tableId, new Set())
    this.state.tableStats.set(tableId, {
      totalHands: 0,
      avgPotSize: 0,
      handsPerHour: 0,
      playerTurnover: 0,
      biggestPot: 0,
      currentStreaks: []
    })
    this.state.seatReservations.set(tableId, new Map())

    await this.saveState()
    await this.broadcastTableUpdate(tableListing, 'table_created')

    logger.info('Created table listing', { tableId, name: config.name })

    return new Response(JSON.stringify({
      success: true,
      data: { tableId }
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Update table information
   */
  private async handleUpdateTable(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    // Check authorization header
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Authorization required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const body = await request.json() as { 
      tableId: string; 
      players?: PublicPlayerInfo[];
      gameState?: any;
      pot?: number;
      phase?: string;
    }
    
    const table = this.state.tables.get(body.tableId)
    if (!table) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Table not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Update table listing
    if (body.players) {
      table.playerList = body.players
      table.currentPlayers = body.players.filter(p => p.isActive).length
      
      // Update player-table mapping
      for (const player of body.players) {
        if (player.isActive) {
          this.state.playerTableMap.set(player.playerId, body.tableId)
        } else {
          this.state.playerTableMap.delete(player.playerId)
        }
      }
    }

    // Update game statistics
    if (body.pot !== undefined && body.phase === 'SHOWDOWN') {
      const stats = this.state.tableStats.get(body.tableId)
      if (stats) {
        stats.totalHands++
        stats.avgPotSize = ((stats.avgPotSize * (stats.totalHands - 1)) + body.pot) / stats.totalHands
        if (body.pot > stats.biggestPot) {
          stats.biggestPot = body.pot
        }
        
        // Calculate hands per hour
        const hoursActive = (Date.now() - table.createdAt) / (1000 * 60 * 60)
        if (hoursActive > 0) {
          stats.handsPerHour = Math.round(stats.totalHands / hoursActive)
          table.handsPerHour = stats.handsPerHour
        }
        
        table.avgPot = Math.round(stats.avgPotSize)
      }
    }

    // Update table status
    table.lastActivity = Date.now()
    if (table.currentPlayers < 2) {
      table.status = 'waiting'
    } else if (body.phase && body.phase !== 'WAITING') {
      table.status = 'active'
    }

    await this.saveState()
    await this.broadcastTableUpdate(table, 'table_updated')

    return new Response(JSON.stringify({
      success: true,
      data: { updated: true }
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Remove a table
   */
  private async handleRemoveTable(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    // Check authorization header
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Authorization required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const body = await request.json() as { tableId: string }
    const { tableId } = body

    const table = this.state.tables.get(tableId)
    if (!table) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Table not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Clean up all related data
    this.state.tables.delete(tableId)
    this.state.waitingLists.delete(tableId)
    this.state.tableStats.delete(tableId)
    this.state.seatReservations.delete(tableId)

    // Remove players from mapping
    for (const player of table.playerList) {
      this.state.playerTableMap.delete(player.playerId)
    }

    await this.saveState()
    await this.broadcastTableRemoval(tableId)

    logger.info('Removed table', { tableId })

    return new Response(JSON.stringify({
      success: true,
      data: { removed: true }
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Get player's current table location
   */
  private async handleGetPlayerLocation(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const playerId = url.searchParams.get('playerId')

    if (!playerId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Player ID required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const tableId = this.state.playerTableMap.get(playerId)
    const table = tableId ? this.state.tables.get(tableId) : null

    return new Response(JSON.stringify({
      success: true,
      data: {
        tableId,
        table: table ? {
          tableId: table.tableId,
          name: table.name,
          gameType: table.gameType,
          stakes: table.stakes
        } : null
      }
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
      tableCount: this.state.tables.size,
      activeConnections: this.connections.size,
      playerMappings: this.state.playerTableMap.size,
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
        objectName: 'LobbyCoordinator',
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
   * Parse table filters from query params
   */
  private parseFilters(params: URLSearchParams): TableFilters {
    const filters: TableFilters = {}

    const gameType = params.get('gameType')
    if (gameType) filters.gameType = gameType as any

    const minStakes = params.get('minStakes')
    if (minStakes) filters.minStakes = parseInt(minStakes)

    const maxStakes = params.get('maxStakes')
    if (maxStakes) filters.maxStakes = parseInt(maxStakes)

    const minPlayers = params.get('minPlayers')
    if (minPlayers) filters.minPlayers = parseInt(minPlayers)

    const maxPlayers = params.get('maxPlayers')
    if (maxPlayers) filters.maxPlayers = parseInt(maxPlayers)

    const hasSeatsAvailable = params.get('hasSeatsAvailable')
    if (hasSeatsAvailable) filters.hasSeatsAvailable = hasSeatsAvailable === 'true'

    const isPrivate = params.get('isPrivate')
    if (isPrivate !== null) filters.isPrivate = isPrivate === 'true'

    const searchTerm = params.get('search')
    if (searchTerm) filters.searchTerm = searchTerm

    return filters
  }

  /**
   * Get filtered tables
   */
  private getFilteredTables(filters: TableFilters): TableListing[] {
    let tables = Array.from(this.state.tables.values())

    // Apply filters
    if (filters.gameType) {
      tables = tables.filter(t => t.gameType === filters.gameType)
    }

    if (filters.minStakes !== undefined) {
      tables = tables.filter(t => t.stakes.bigBlind >= filters.minStakes!)
    }

    if (filters.maxStakes !== undefined) {
      tables = tables.filter(t => t.stakes.bigBlind <= filters.maxStakes!)
    }

    if (filters.minPlayers !== undefined) {
      tables = tables.filter(t => t.currentPlayers >= filters.minPlayers!)
    }

    if (filters.maxPlayers !== undefined) {
      tables = tables.filter(t => t.maxPlayers <= filters.maxPlayers!)
    }

    if (filters.hasSeatsAvailable) {
      tables = tables.filter(t => t.currentPlayers < t.maxPlayers)
    }

    if (filters.isPrivate !== undefined) {
      tables = tables.filter(t => t.isPrivate === filters.isPrivate)
    }

    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase()
      tables = tables.filter(t => 
        t.name.toLowerCase().includes(term) ||
        t.playerList.some(p => p.username.toLowerCase().includes(term))
      )
    }

    // Sort by activity and availability
    tables.sort((a, b) => {
      const aHasSeats = a.currentPlayers < a.maxPlayers ? 1 : 0
      const bHasSeats = b.currentPlayers < b.maxPlayers ? 1 : 0
      
      if (aHasSeats !== bHasSeats) {
        return bHasSeats - aHasSeats
      }

      return b.lastActivity - a.lastActivity
    })

    return tables
  }

  /**
   * Calculate total active players
   */
  private calculateActivePlayers(tables: TableListing[]): number {
    return tables.reduce((sum, table) => sum + table.currentPlayers, 0)
  }

  /**
   * Send initial state to new WebSocket connection
   */
  private async sendInitialState(websocket: WebSocket): Promise<void> {
    const tables = Array.from(this.state.tables.values())
    
    this.sendMessage(websocket, createWebSocketMessage('lobby_state', {
      tables,
      stats: {
        totalTables: tables.length,
        activePlayers: this.calculateActivePlayers(tables),
        activeGames: tables.filter(t => t.status === 'active').length
      },
      timestamp: Date.now()
    }))
  }

  /**
   * Send filtered tables to a WebSocket connection
   */
  private async sendFilteredTables(websocket: WebSocket, filters?: TableFilters): Promise<void> {
    const tables = this.getFilteredTables(filters || {})
    
    this.sendMessage(websocket, createWebSocketMessage('tables_update', {
      tables,
      filters,
      timestamp: Date.now()
    }))
  }

  /**
   * Send table statistics
   */
  private async sendTableStats(websocket: WebSocket, tableId: string): Promise<void> {
    const stats = this.state.tableStats.get(tableId)
    const table = this.state.tables.get(tableId)
    
    if (!stats || !table) {
      this.sendError(websocket, 'Table not found')
      return
    }

    this.sendMessage(websocket, createWebSocketMessage('table_stats', {
      tableId,
      stats,
      table: {
        name: table.name,
        gameType: table.gameType,
        stakes: table.stakes
      },
      timestamp: Date.now()
    }))
  }

  /**
   * Broadcast table update to all connections
   */
  private async broadcastTableUpdate(table: TableListing, eventType: string): Promise<void> {
    const message = createWebSocketMessage(eventType, {
      table,
      timestamp: Date.now()
    })

    await this.broadcast(message)
  }

  /**
   * Broadcast table removal
   */
  private async broadcastTableRemoval(tableId: string): Promise<void> {
    const message = createWebSocketMessage('table_removed', {
      tableId,
      timestamp: Date.now()
    })

    await this.broadcast(message)
  }

  /**
   * Broadcast message to all connections
   */
  private async broadcast(message: WebSocketMessage): Promise<void> {
    const messageStr = JSON.stringify(message)
    const deadConnections: string[] = []
    
    for (const [clientId, connection] of this.connections) {
      try {
        if (connection.websocket.readyState === WebSocket.OPEN) {
          connection.websocket.send(messageStr)
        } else {
          deadConnections.push(clientId)
        }
      } catch (error) {
        logger.error(`Failed to send to client ${clientId}:`, error as Error)
        deadConnections.push(clientId)
      }
    }
    
    // Clean up dead connections
    for (const clientId of deadConnections) {
      this.connections.delete(clientId)
    }
  }

  /**
   * Find connection by WebSocket
   */
  private findConnection(websocket: WebSocket): LobbyWebSocketConnection | undefined {
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
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify(message))
      } else {
        logger.warn('WebSocket not open, skipping message', { 
          readyState: websocket.readyState,
          messageType: message.type 
        })
        // Remove the connection if it's closed
        const connection = this.findConnection(websocket)
        if (connection) {
          this.connections.delete(connection.clientId)
        }
      }
    } catch (error) {
      logger.error('Failed to send WebSocket message:', error as Error)
      // Remove the connection on error
      const connection = this.findConnection(websocket)
      if (connection) {
        this.connections.delete(connection.clientId)
      }
    }
  }

  /**
   * Send error message to WebSocket
   */
  private sendError(websocket: WebSocket, error: string): void {
    this.sendMessage(websocket, createWebSocketMessage('error', { error, timestamp: Date.now() }))
  }

  /**
   * Start periodic tasks
   */
  private startPeriodicTasks(): void {
    // Periodic state updates
    this.updateInterval = setInterval(() => {
      this.performPeriodicUpdate()
    }, LobbyCoordinatorDurableObject.UPDATE_INTERVAL) as any

    // Cleanup tasks
    this.cleanupInterval = setInterval(() => {
      this.performCleanup()
    }, LobbyCoordinatorDurableObject.CLEANUP_INTERVAL) as any
  }

  /**
   * Perform periodic update
   */
  private async performPeriodicUpdate(): Promise<void> {
    // Broadcast current state to all connections
    const tables = Array.from(this.state.tables.values())
    const message = createWebSocketMessage('lobby_update', {
      tables,
      stats: {
        totalTables: tables.length,
        activePlayers: this.calculateActivePlayers(tables),
        activeGames: tables.filter(t => t.status === 'active').length
      },
      timestamp: Date.now()
    })

    await this.broadcast(message)
  }

  /**
   * Perform cleanup tasks
   */
  private async performCleanup(): Promise<void> {
    const now = Date.now()
    let stateChanged = false

    // Clean up inactive tables
    for (const [tableId, table] of this.state.tables) {
      if (now - table.lastActivity > LobbyCoordinatorDurableObject.INACTIVE_TABLE_THRESHOLD && table.currentPlayers === 0) {
        logger.info('Removing inactive table', { tableId })
        this.state.tables.delete(tableId)
        this.state.waitingLists.delete(tableId)
        this.state.tableStats.delete(tableId)
        this.state.seatReservations.delete(tableId)
        stateChanged = true
        
        await this.broadcastTableRemoval(tableId)
      }
    }

    // Clean up expired reservations
    for (const [tableId, reservations] of this.state.seatReservations) {
      for (const [seatIndex, reservation] of reservations) {
        if (now > reservation.expiresAt) {
          reservations.delete(seatIndex)
          stateChanged = true
        }
      }
    }

    // Clean up disconnected connections
    for (const [clientId, connection] of this.connections) {
      if (now - connection.lastHeartbeat > LobbyCoordinatorDurableObject.HEARTBEAT_TIMEOUT) {
        logger.info('Removing inactive connection', { clientId })
        this.connections.delete(clientId)
      }
    }

    if (stateChanged) {
      await this.saveState()
    }
  }

  /**
   * Apply advanced filters to tables
   */
  private applyAdvancedFilters(tables: TableListing[], filters: {
    stakes?: string[];
    seatsAvailable?: string;
    gameType?: string;
  }): TableListing[] {
    return tables.filter(table => {
      // Filter by stakes levels
      if (filters.stakes && filters.stakes.length > 0) {
        const tableStakeLevel = this.getStakeLevel(table.stakes.bigBlind)
        if (!filters.stakes.includes(tableStakeLevel)) {
          return false
        }
      }

      // Filter by available seats
      if (filters.seatsAvailable) {
        const parts = filters.seatsAvailable.split('-').map(Number)
        if (parts.length === 2) {
          const [min, max] = parts
          const availableSeats = table.maxPlayers - table.currentPlayers
          if (availableSeats < min || availableSeats > max) {
            return false
          }
        }
      }

      // Filter by game type
      if (filters.gameType && table.gameType !== filters.gameType) {
        return false
      }

      return true
    })
  }

  /**
   * Get stake level from big blind amount
   */
  private getStakeLevel(bigBlind: number): string {
    if (bigBlind <= 2) return 'low'
    if (bigBlind <= 10) return 'medium'
    return 'high'
  }

  /**
   * Apply sorting to tables
   */
  private applySorting(tables: TableListing[], sort: {
    field: 'players' | 'stakes' | 'avgPot' | 'handsPerHour';
    direction: 'asc' | 'desc';
  }): TableListing[] {
    const { field, direction } = sort
    const multiplier = direction === 'asc' ? 1 : -1

    return [...tables].sort((a, b) => {
      switch (field) {
        case 'players':
          return (a.currentPlayers - b.currentPlayers) * multiplier
        case 'stakes':
          return (a.stakes.bigBlind - b.stakes.bigBlind) * multiplier
        case 'avgPot':
          return ((a.avgPot || 0) - (b.avgPot || 0)) * multiplier
        case 'handsPerHour':
          return ((a.handsPerHour || 0) - (b.handsPerHour || 0)) * multiplier
        default:
          return 0
      }
    })
  }

  /**
   * Apply pagination to tables
   */
  private applyPagination(
    tables: TableListing[], 
    cursor?: string, 
    limit: number = 50
  ): { tables: TableListing[]; nextCursor?: string; hasMore: boolean } {
    let startIndex = 0
    
    if (cursor) {
      // Find the index of the cursor table
      const cursorIndex = tables.findIndex(t => t.tableId === cursor)
      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1
      }
    }

    const paginatedTables = tables.slice(startIndex, startIndex + limit)
    const hasMore = startIndex + limit < tables.length
    const nextCursor = hasMore ? paginatedTables[paginatedTables.length - 1]?.tableId : undefined

    return {
      tables: paginatedTables,
      nextCursor,
      hasMore
    }
  }

  /**
   * Calculate players per flop percentage
   */
  private calculatePlayersPerFlop(table: TableListing): number {
    // This would need actual game statistics tracking
    // For now, return a placeholder value
    return 45.5
  }

  /**
   * Cleanup on destruction
   */
  async destroy(): Promise<void> {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
  }
}