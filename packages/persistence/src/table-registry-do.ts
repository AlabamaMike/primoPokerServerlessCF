/**
 * Table Registry Durable Object for Phase 3B.3
 * 
 * Manages global table discovery and metadata for live multiplayer lobby system
 */

import type { TableListing, TableFilters } from '@primo-poker/shared'
import { LobbyManager } from './lobby-manager'

export interface TableRegistryState {
  tables: Map<string, TableListing>
  lastUpdated: number
  totalActivePlayers: number
  totalSpectators: number
}

export class TableRegistryDurableObject {
  private state: DurableObjectState
  private lobbyManager: LobbyManager
  private tables: Map<string, TableListing> = new Map()

  constructor(state: DurableObjectState, env: any) {
    this.state = state
    this.lobbyManager = new LobbyManager()
    this.initializeFromStorage()
  }

  /**
   * Handle HTTP requests for table discovery
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    try {
      switch (path) {
        case '/tables':
          return this.handleGetTables(request)
        
        case '/tables/create':
          return this.handleCreateTable(request)
        
        case '/tables/join':
          return this.handleJoinTable(request)
        
        case '/tables/leave':
          return this.handleLeaveTable(request)
        
        case '/tables/update':
          return this.handleUpdateTable(request)
        
        case '/tables/stats':
          return this.handleGetStats(request)
        
        default:
          return new Response('Not Found', { status: 404 })
      }
    } catch (error) {
      console.error('TableRegistry error:', error)
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
   * Get filtered list of tables
   */
  private async handleGetTables(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const filters: TableFilters = {}

    // Parse query parameters
    const gameType = url.searchParams.get('gameType')
    if (gameType) filters.gameType = gameType as any

    const minStakes = url.searchParams.get('minStakes')
    if (minStakes) filters.minStakes = parseInt(minStakes)

    const maxStakes = url.searchParams.get('maxStakes')
    if (maxStakes) filters.maxStakes = parseInt(maxStakes)

    const hasSeatsAvailable = url.searchParams.get('hasSeatsAvailable')
    if (hasSeatsAvailable) filters.hasSeatsAvailable = hasSeatsAvailable === 'true'

    const searchTerm = url.searchParams.get('search')
    if (searchTerm) filters.searchTerm = searchTerm

    const tables = await this.lobbyManager.getAvailableTables(filters)

    return new Response(JSON.stringify({
      success: true,
      data: {
        tables,
        totalTables: tables.length,
        activePlayers: this.calculateActivePlayers(tables),
        lastUpdated: Date.now()
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Create a new table
   */
  private async handleCreateTable(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const requestData = await request.json() as { config?: any, creatorId?: string }
    const { config, creatorId } = requestData
    
    if (!config || !creatorId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const tableId = await this.lobbyManager.createTable(config, creatorId)
    
    // Sync with persistent storage
    await this.syncToStorage()

    return new Response(JSON.stringify({
      success: true,
      data: { tableId }
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Join a table
   */
  private async handleJoinTable(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const requestData = await request.json() as { tableId?: string, playerId?: string, password?: string }
    const { tableId, playerId, password } = requestData
    
    if (!tableId || !playerId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const result = await this.lobbyManager.joinTable(tableId, playerId, password)
    
    if (result.success) {
      await this.syncToStorage()
    }

    return new Response(JSON.stringify({
      success: result.success,
      data: result
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Leave a table
   */
  private async handleLeaveTable(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const requestData = await request.json() as { playerId?: string }
    const { playerId } = requestData
    
    if (!playerId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing playerId'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const success = await this.lobbyManager.leaveTable(playerId)
    
    if (success) {
      await this.syncToStorage()
    }

    return new Response(JSON.stringify({
      success,
      data: { left: success }
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

    const requestData = await request.json() as { tableId?: string, table?: any }
    const { tableId, table } = requestData
    
    if (!tableId || !table) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    await this.lobbyManager.updateTableStats(tableId, table)
    await this.syncToStorage()

    return new Response(JSON.stringify({
      success: true,
      data: { updated: true }
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Get global statistics
   */
  private async handleGetStats(request: Request): Promise<Response> {
    const tables = await this.lobbyManager.getAvailableTables()
    
    const stats = {
      totalTables: tables.length,
      activeTables: tables.filter(t => t.status === 'active').length,
      waitingTables: tables.filter(t => t.status === 'waiting').length,
      totalPlayers: this.calculateActivePlayers(tables),
      totalSpectators: tables.reduce((sum, t) => sum + t.waitingList, 0),
      averagePot: tables.reduce((sum, t) => sum + t.avgPot, 0) / Math.max(tables.length, 1),
      averageHandsPerHour: tables.reduce((sum, t) => sum + t.handsPerHour, 0) / Math.max(tables.length, 1),
      gameTypeDistribution: this.calculateGameTypeDistribution(tables),
      stakesDistribution: this.calculateStakesDistribution(tables),
      lastUpdated: Date.now()
    }

    return new Response(JSON.stringify({
      success: true,
      data: stats
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Initialize state from Durable Object storage
   */
  private async initializeFromStorage(): Promise<void> {
    try {
      const storedState = await this.state.storage.get<TableRegistryState>('registry_state')
      
      if (storedState) {
        // Reconstruct Map from stored data
        this.tables = new Map(Object.entries(storedState.tables || {}))
        
        // Initialize lobby manager with stored tables
        for (const [tableId, table] of this.tables) {
          // Restore table in lobby manager
          // This is a simplified restoration - in practice, you'd want more sophisticated state recovery
        }
      }
    } catch (error) {
      console.error('Failed to initialize from storage:', error)
    }
  }

  /**
   * Sync current state to Durable Object storage
   */
  private async syncToStorage(): Promise<void> {
    try {
      const state: TableRegistryState = {
        tables: this.tables,
        lastUpdated: Date.now(),
        totalActivePlayers: this.calculateActivePlayers(Array.from(this.tables.values())),
        totalSpectators: Array.from(this.tables.values()).reduce((sum, t) => sum + t.waitingList, 0)
      }

      await this.state.storage.put('registry_state', state)
    } catch (error) {
      console.error('Failed to sync to storage:', error)
    }
  }

  /**
   * Calculate total active players across all tables
   */
  private calculateActivePlayers(tables: TableListing[]): number {
    return tables.reduce((sum, table) => sum + table.currentPlayers, 0)
  }

  /**
   * Calculate game type distribution
   */
  private calculateGameTypeDistribution(tables: TableListing[]): Record<string, number> {
    const distribution: Record<string, number> = {}
    
    for (const table of tables) {
      distribution[table.gameType] = (distribution[table.gameType] || 0) + 1
    }
    
    return distribution
  }

  /**
   * Calculate stakes distribution
   */
  private calculateStakesDistribution(tables: TableListing[]): Array<{ range: string, count: number }> {
    const ranges = [
      { min: 0, max: 1, label: '$0-$1' },
      { min: 1, max: 5, label: '$1-$5' },
      { min: 5, max: 25, label: '$5-$25' },
      { min: 25, max: 100, label: '$25-$100' },
      { min: 100, max: Infinity, label: '$100+' }
    ]

    return ranges.map(range => ({
      range: range.label,
      count: tables.filter(t => 
        t.stakes.bigBlind >= range.min && t.stakes.bigBlind < range.max
      ).length
    }))
  }

  /**
   * Handle WebSocket connections for real-time lobby updates
   */
  async handleWebSocket(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade')
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 400 })
    }

    const webSocketPair = new WebSocketPair()
    const [client, server] = Object.values(webSocketPair)

    if (!server || !client) {
      return new Response('Failed to create WebSocket pair', { status: 500 })
    }

    server.accept()

    // Set up real-time lobby updates
    this.setupLobbyWebSocket(server)

    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  /**
   * Set up WebSocket for real-time lobby updates
   */
  private setupLobbyWebSocket(websocket: WebSocket): void {
    let updateInterval: number

    websocket.addEventListener('open', () => {
      console.log('Lobby WebSocket connected')
      
      // Send initial table list
      this.sendLobbyUpdate(websocket)
      
      // Set up periodic updates
      updateInterval = setInterval(() => {
        this.sendLobbyUpdate(websocket)
      }, 5000) as any // Update every 5 seconds
    })

    websocket.addEventListener('close', () => {
      console.log('Lobby WebSocket disconnected')
      if (updateInterval) {
        clearInterval(updateInterval)
      }
    })

    websocket.addEventListener('message', async (event) => {
      try {
        const message = JSON.parse(event.data as string)
        
        switch (message.type) {
          case 'get_tables':
            const tables = await this.lobbyManager.getAvailableTables(message.filters || {})
            websocket.send(JSON.stringify({
              type: 'tables_update',
              data: tables,
              timestamp: Date.now()
            }))
            break
            
          case 'ping':
            websocket.send(JSON.stringify({
              type: 'pong',
              timestamp: Date.now()
            }))
            break
        }
      } catch (error) {
        console.error('Error handling lobby WebSocket message:', error)
      }
    })
  }

  /**
   * Send lobby update through WebSocket
   */
  private async sendLobbyUpdate(websocket: WebSocket): Promise<void> {
    try {
      const tables = await this.lobbyManager.getAvailableTables()
      
      websocket.send(JSON.stringify({
        type: 'tables_update',
        data: tables,
        stats: {
          totalTables: tables.length,
          activePlayers: this.calculateActivePlayers(tables),
          activeGames: tables.filter(t => t.status === 'active').length
        },
        timestamp: Date.now()
      }))
    } catch (error) {
      console.error('Error sending lobby update:', error)
    }
  }
}
