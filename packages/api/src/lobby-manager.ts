/**
 * Lobby Manager for Phase 3B.3
 * 
 * Manages table discovery, creation, and player matching for live multiplayer experience
 */

import { GameState, Player, GamePhase, Table, TableFilters, TableListing, PublicPlayerInfo, LobbyTableConfig, JoinResult, ReservationResult, TableStats } from '@primo-poker/shared'

export class LobbyManager {
  private tables: Map<string, TableListing> = new Map()
  private reservations: Map<string, { playerId: string, tableId: string, expiresAt: number }> = new Map()
  private waitingLists: Map<string, string[]> = new Map()
  private tableStats: Map<string, TableStats> = new Map()
  private playerTableMap: Map<string, string> = new Map()

  constructor() {
    this.startPeriodicUpdates()
    this.startCleanupTasks()
  }

  /**
   * Get filtered list of available tables
   */
  async getAvailableTables(filters: TableFilters = {}): Promise<TableListing[]> {
    let tables = Array.from(this.tables.values())

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
      // Prioritize tables with available seats
      const aHasSeats = a.currentPlayers < a.maxPlayers ? 1 : 0
      const bHasSeats = b.currentPlayers < b.maxPlayers ? 1 : 0
      
      if (aHasSeats !== bHasSeats) {
        return bHasSeats - aHasSeats
      }

      // Then by recent activity
      return b.lastActivity - a.lastActivity
    })

    return tables
  }

  /**
   * Create a new table
   */
  async createTable(config: LobbyTableConfig, creatorId: string): Promise<string> {
    const tableId = this.generateTableId()
    
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

    this.tables.set(tableId, tableListing)
    this.waitingLists.set(tableId, [])
    
    // Initialize table stats
    this.tableStats.set(tableId, {
      totalHands: 0,
      avgPotSize: 0,
      handsPerHour: 0,
      playerTurnover: 0,
      biggestPot: 0,
      currentStreaks: []
    })

    console.log(`Created new ${config.gameType} table: ${config.name} (${tableId})`)
    
    return tableId
  }

  /**
   * Join a table
   */
  async joinTable(tableId: string, playerId: string, password?: string): Promise<JoinResult> {
    const table = this.tables.get(tableId)
    if (!table) {
      return { success: false, error: 'Table not found' }
    }

    // Check if player is already at a table
    const currentTable = this.playerTableMap.get(playerId)
    if (currentTable && currentTable !== tableId) {
      return { success: false, error: 'Already seated at another table' }
    }

    // Check password for private tables
    if (table.requiresPassword && !password) {
      return { success: false, error: 'Password required' }
    }

    // Check if table has available seats
    if (table.currentPlayers >= table.maxPlayers) {
      // Add to waiting list
      const waitingList = this.waitingLists.get(tableId)!
      if (!waitingList.includes(playerId)) {
        waitingList.push(playerId)
        table.waitingList = waitingList.length
      }
      
      return { 
        success: false, 
        error: 'Table full', 
        waitingListPosition: waitingList.indexOf(playerId) + 1 
      }
    }

    // Add player to table
    const seatNumber = this.findAvailableSeat(table)
    const chipCount = this.calculateBuyIn(table)

    // Update table listing
    table.currentPlayers++
    table.lastActivity = Date.now()
    
    // Add player info
    table.playerList.push({
      playerId,
      username: await this.getPlayerUsername(playerId),
      chipCount,
      isActive: true
    })

    // Track player table assignment
    this.playerTableMap.set(playerId, tableId)

    console.log(`Player ${playerId} joined table ${tableId} at seat ${seatNumber}`)

    return {
      success: true,
      tableId,
      seatNumber,
      chipCount
    }
  }

  /**
   * Reserve a seat at a table
   */
  async reserveSeat(tableId: string, playerId: string): Promise<ReservationResult> {
    const table = this.tables.get(tableId)
    if (!table) {
      return { success: false, error: 'Table not found' }
    }

    if (table.currentPlayers >= table.maxPlayers) {
      return { success: false, error: 'No seats available' }
    }

    const reservationId = this.generateReservationId()
    const expiresAt = Date.now() + (5 * 60 * 1000) // 5 minutes

    this.reservations.set(reservationId, {
      playerId,
      tableId,
      expiresAt
    })

    return {
      success: true,
      reservationId,
      expiresAt
    }
  }

  /**
   * Leave a table
   */
  async leaveTable(playerId: string): Promise<boolean> {
    const tableId = this.playerTableMap.get(playerId)
    if (!tableId) return false

    const table = this.tables.get(tableId)
    if (!table) return false

    // Remove player from table
    table.playerList = table.playerList.filter(p => p.playerId !== playerId)
    table.currentPlayers = table.playerList.length
    table.lastActivity = Date.now()

    // Remove player mapping
    this.playerTableMap.delete(playerId)

    // Process waiting list
    await this.processWaitingList(tableId)

    console.log(`Player ${playerId} left table ${tableId}`)
    
    return true
  }

  /**
   * Update table statistics
   */
  async updateTableStats(tableId: string, table: Table): Promise<void> {
    const tableListing = this.tables.get(tableId)
    const stats = this.tableStats.get(tableId)
    
    if (!tableListing || !stats) return

    // Update basic stats
    tableListing.lastActivity = Date.now()
    
    // Update player list with current table state
    tableListing.playerList = Array.from(table.players.values()).map(player => ({
      playerId: player.id,
      username: player.username,
      chipCount: player.chipCount,
      isActive: player.status === 'playing'
    }))

    tableListing.currentPlayers = tableListing.playerList.filter(p => p.isActive).length

    // Update game-specific stats if game state exists
    if (table.gameState && table.gameState.phase === GamePhase.SHOWDOWN && table.gameState.pot > 0) {
      stats.totalHands++
      stats.avgPotSize = ((stats.avgPotSize * (stats.totalHands - 1)) + table.gameState.pot) / stats.totalHands
      
      if (table.gameState.pot > stats.biggestPot) {
        stats.biggestPot = table.gameState.pot
      }
    }

    // Update table status
    if (tableListing.currentPlayers < 2) {
      tableListing.status = 'waiting'
    } else if (table.gameState && table.gameState.phase !== GamePhase.WAITING) {
      tableListing.status = 'active'
    }

    // Calculate hands per hour (simplified)
    const hoursActive = (Date.now() - tableListing.createdAt) / (1000 * 60 * 60)
    if (hoursActive > 0) {
      stats.handsPerHour = Math.round(stats.totalHands / hoursActive)
      tableListing.handsPerHour = stats.handsPerHour
    }

    tableListing.avgPot = Math.round(stats.avgPotSize)
  }

  /**
   * Get detailed table statistics
   */
  async getTableStatistics(tableId: string): Promise<TableStats | null> {
    return this.tableStats.get(tableId) || null
  }

  /**
   * Get table by ID
   */
  getTable(tableId: string): TableListing | undefined {
    return this.tables.get(tableId)
  }

  /**
   * Get player's current table
   */
  getPlayerTable(playerId: string): string | undefined {
    return this.playerTableMap.get(playerId)
  }

  /**
   * Remove a table
   */
  async removeTable(tableId: string): Promise<boolean> {
    const table = this.tables.get(tableId)
    if (!table) return false

    // Remove all players from tracking
    table.playerList.forEach(player => {
      this.playerTableMap.delete(player.playerId)
    })

    // Clean up related data
    this.tables.delete(tableId)
    this.waitingLists.delete(tableId)
    this.tableStats.delete(tableId)

    // Clean up reservations
    for (const [reservationId, reservation] of this.reservations) {
      if (reservation.tableId === tableId) {
        this.reservations.delete(reservationId)
      }
    }

    console.log(`Removed table ${tableId}`)
    return true
  }

  /**
   * Process waiting list when seat becomes available
   */
  private async processWaitingList(tableId: string): Promise<void> {
    const waitingList = this.waitingLists.get(tableId)
    const table = this.tables.get(tableId)
    
    if (!waitingList || !table || waitingList.length === 0) return
    if (table.currentPlayers >= table.maxPlayers) return

    // Get next player from waiting list
    const nextPlayerId = waitingList.shift()
    if (!nextPlayerId) return

    table.waitingList = waitingList.length

    // Auto-join the next player (would typically send notification)
    console.log(`Processing waiting list for table ${tableId}: ${nextPlayerId} gets next seat`)
  }

  /**
   * Find available seat number
   */
  private findAvailableSeat(table: TableListing): number {
    const occupiedSeats = new Set(table.playerList.map((_, index) => index))
    
    for (let seat = 0; seat < table.maxPlayers; seat++) {
      if (!occupiedSeats.has(seat)) {
        return seat
      }
    }
    
    return 0 // Fallback
  }

  /**
   * Calculate buy-in amount for table
   */
  private calculateBuyIn(table: TableListing): number {
    // Default to 100 big blinds for cash games
    return table.stakes.bigBlind * 100
  }

  /**
   * Get player username (mock implementation)
   */
  private async getPlayerUsername(playerId: string): Promise<string> {
    // In real implementation, this would query user database
    return `Player_${playerId.slice(-4)}`
  }

  /**
   * Generate unique table ID
   */
  private generateTableId(): string {
    return `table_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Generate unique reservation ID
   */
  private generateReservationId(): string {
    return `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Start periodic updates
   */
  private startPeriodicUpdates(): void {
    setInterval(() => {
      // Update table activity and cleanup inactive tables
      const now = Date.now()
      const inactiveThreshold = 30 * 60 * 1000 // 30 minutes
      
      for (const [tableId, table] of this.tables) {
        if (now - table.lastActivity > inactiveThreshold && table.currentPlayers === 0) {
          console.log(`Removing inactive table: ${tableId}`)
          this.removeTable(tableId)
        }
      }
    }, 5 * 60 * 1000) // Every 5 minutes
  }

  /**
   * Start cleanup tasks
   */
  private startCleanupTasks(): void {
    setInterval(() => {
      // Clean up expired reservations
      const now = Date.now()
      
      for (const [reservationId, reservation] of this.reservations) {
        if (now > reservation.expiresAt) {
          this.reservations.delete(reservationId)
        }
      }
    }, 60 * 1000) // Every minute
  }
}
