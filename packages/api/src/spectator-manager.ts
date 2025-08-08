/**
 * Spectator Manager - Phase 3B.3.3
 * 
 * Provides comprehensive spectator viewing experience including:
 * - Live game viewing with educational overlays
 * - Multi-table tournament viewing
 * - Hand history and replay functionality
 * - Player statistics and analysis
 */

import { GameState, Player, GamePlayer, Card, HandRanking, GamePhase } from '@primo-poker/shared'

export interface SpectatorInfo {
  spectatorId: string
  username: string
  joinedAt: number
  isEducationalMode: boolean
  preferredView: 'standard' | 'educational' | 'statistics'
  followedPlayerId?: string
}

export interface SpectatorGameView {
  gameState: GameState
  players: GamePlayer[] // Include players array for spectator view
  visibleCards: {
    communityCards: Card[]
    playerHands: { [playerId: string]: Card[] | null } // null if not revealed
  }
  potOdds?: number
  handStrengths?: { [playerId: string]: HandAnalysis }
  suggestedAction?: ActionSuggestion
  historicalData?: PlayerStats[]
}

export interface HandAnalysis {
  currentStrength: HandRanking
  winProbability: number
  drawOuts: number
  handDescription: string
  category: 'strong' | 'medium' | 'weak' | 'drawing'
}

export interface ActionSuggestion {
  recommendedAction: 'fold' | 'call' | 'raise' | 'check'
  reasoning: string
  expectedValue: number
  alternativeActions: Array<{
    action: string
    probability: number
    reasoning: string
  }>
}

export interface PlayerStats {
  playerId: string
  username: string
  handsPlayed: number
  vpip: number // Voluntarily Put money In Pot
  pfr: number  // Pre-Flop Raise
  aggression: number
  tendencies: string[]
  recentActions: Array<{
    hand: number
    action: string
    position: string
    result: 'won' | 'lost' | 'folded'
  }>
}

export interface TournamentView {
  tournamentId: string
  currentLevel: number
  nextBlindIncrease: number
  tables: Array<{
    tableId: string
    playerCount: number
    averageStack: number
    bigBlind: number
    isFeatureTable: boolean
  }>
  leaderboard: Array<{
    playerId: string
    username: string
    chipCount: number
    position: number
  }>
}

export interface HandReplay {
  handId: string
  tableId: string
  timestamp: number
  players: Player[]
  actions: Array<{
    playerId: string
    action: string
    amount?: number
    cards?: Card[]
    timestamp: number
  }>
  finalPot: number
  winner: {
    playerId: string
    hand: Card[]
    handRanking: HandRanking
    winnings: number
  }
}

export interface SpectatorUpdate {
  gameState: GameState
  players: GamePlayer[]
  timestamp: number
}

export class SpectatorManager {
  private spectators: Map<string, SpectatorInfo> = new Map()
  private tableViewers: Map<string, Set<string>> = new Map() // tableId -> spectatorIds
  private handHistories: Map<string, HandReplay[]> = new Map() // tableId -> hands
  private playerStats: Map<string, PlayerStats> = new Map() // playerId -> stats
  private updateQueues: Map<string, SpectatorUpdate[]> = new Map() // tableId -> pending updates
  private updateTimers: Map<string, number> = new Map() // tableId -> timer
  private readonly SPECTATOR_DELAY_MS = 500
  private readonly MAX_SPECTATORS_PER_TABLE = 50
  
  // Callback for broadcasting updates (to be set by WebSocket handler)
  public onBroadcast?: (tableId: string, update: SpectatorUpdate) => void

  /**
   * Add a spectator to a table
   */
  addSpectator(
    tableId: string, 
    spectatorInfo: SpectatorInfo
  ): boolean {
    try {
      // Check if table already has max spectators
      const viewers = this.tableViewers.get(tableId)
      if (viewers && viewers.size >= this.MAX_SPECTATORS_PER_TABLE) {
        console.log(`Table ${tableId} has reached max spectator limit`)
        return false
      }
      
      this.spectators.set(spectatorInfo.spectatorId, spectatorInfo)
      
      if (!this.tableViewers.has(tableId)) {
        this.tableViewers.set(tableId, new Set())
      }
      
      this.tableViewers.get(tableId)!.add(spectatorInfo.spectatorId)
      
      console.log(`Spectator ${spectatorInfo.username} joined table ${tableId}`)
      return true
    } catch (error) {
      console.error('Error adding spectator:', error)
      return false
    }
  }

  /**
   * Remove a spectator from a table
   */
  removeSpectator(tableId: string, spectatorId: string): boolean {
    try {
      const viewers = this.tableViewers.get(tableId)
      if (viewers) {
        viewers.delete(spectatorId)
        if (viewers.size === 0) {
          this.tableViewers.delete(tableId)
        }
      }
      
      this.spectators.delete(spectatorId)
      console.log(`Spectator ${spectatorId} left table ${tableId}`)
      return true
    } catch (error) {
      console.error('Error removing spectator:', error)
      return false
    }
  }

  /**
   * Generate spectator view of the game with educational features
   */
  generateSpectatorView(
    tableId: string, 
    gameState: GameState,
    players: GamePlayer[],
    spectatorId: string
  ): SpectatorGameView {
    const spectator = this.spectators.get(spectatorId)
    const baseView: SpectatorGameView = {
      gameState,
      players,
      visibleCards: this.getVisibleCards(gameState, players)
    }

    if (!spectator) {
      return baseView
    }

    // Add educational features based on spectator preferences
    if (spectator.isEducationalMode || spectator.preferredView === 'educational') {
      baseView.potOdds = this.calculatePotOdds(gameState)
      baseView.handStrengths = this.analyzeHandStrengths(players, gameState)
      baseView.suggestedAction = this.generateActionSuggestion(gameState)
    }

    // Add statistical data if requested
    if (spectator.preferredView === 'statistics') {
      baseView.historicalData = this.getPlayerStatsForTable(players)
    }

    return baseView
  }

  /**
   * Get visible cards based on game state and rules
   */
  private getVisibleCards(gameState: GameState, players: GamePlayer[]): SpectatorGameView['visibleCards'] {
    const result: SpectatorGameView['visibleCards'] = {
      communityCards: gameState.communityCards || [],
      playerHands: {}
    }

    // Show player hands only if they're revealed (showdown) or player folded
    players.forEach((player: GamePlayer) => {
      if (player.isFolded || gameState.phase === GamePhase.SHOWDOWN) {
        // In a real implementation, you'd check if cards should be visible
        result.playerHands[player.id] = player.cards || null
      } else {
        result.playerHands[player.id] = null // Hidden
      }
    })

    return result
  }

  /**
   * Calculate pot odds for educational display
   */
  private calculatePotOdds(gameState: GameState): number {
    const totalPot = gameState.pot || 0
    const callAmount = gameState.currentBet || 0
    
    if (callAmount === 0) return 0
    
    return totalPot / (totalPot + callAmount)
  }

  /**
   * Analyze hand strengths for all players (educational)
   */
  private analyzeHandStrengths(players: GamePlayer[], gameState: GameState): { [playerId: string]: HandAnalysis } {
    const result: { [playerId: string]: HandAnalysis } = {}

    players.forEach((player: GamePlayer) => {
      if (player.cards && player.cards.length === 2) {
        const analysis = this.analyzePlayerHand(
          player.cards,
          gameState.communityCards || [],
          gameState.phase
        )
        result[player.id] = analysis
      }
    })

    return result
  }

  /**
   * Analyze individual player hand
   */
  private analyzePlayerHand(
    holeCards: Card[], 
    communityCards: Card[], 
    phase: string
  ): HandAnalysis {
    // This is a simplified analysis - in production you'd use the hand evaluator
    const allCards = [...holeCards, ...communityCards]
    
    // Mock analysis for now
    return {
      currentStrength: HandRanking.HIGH_CARD,
      winProbability: 0.35, // Would calculate based on cards
      drawOuts: 0,
      handDescription: 'Ace high',
      category: 'medium'
    }
  }

  /**
   * Generate AI action suggestions for educational purposes
   */
  private generateActionSuggestion(gameState: GameState): ActionSuggestion {
    // Mock suggestion - would use advanced poker AI
    return {
      recommendedAction: 'call',
      reasoning: 'Good pot odds with drawing potential',
      expectedValue: 0.15,
      alternativeActions: [
        {
          action: 'fold',
          probability: 0.3,
          reasoning: 'Conservative play to minimize losses'
        },
        {
          action: 'raise',
          probability: 0.2,
          reasoning: 'Aggressive play to build pot with strong draw'
        }
      ]
    }
  }

  /**
   * Get player statistics for educational display
   */
  private getPlayerStatsForTable(players: GamePlayer[]): PlayerStats[] {
    return players.map((player: GamePlayer) => {
      const existingStats = this.playerStats.get(player.id)
      
      if (existingStats) {
        return existingStats
      }

      // Generate mock stats for new players
      return {
        playerId: player.id,
        username: player.username,
        handsPlayed: Math.floor(Math.random() * 100) + 20,
        vpip: Math.random() * 0.4 + 0.15, // 15-55%
        pfr: Math.random() * 0.25 + 0.05,  // 5-30%
        aggression: Math.random() * 3 + 1,  // 1-4
        tendencies: ['Tight-Aggressive', 'Position-Aware'],
        recentActions: []
      }
    })
  }

  /**
   * Record hand for replay functionality
   */
  recordHand(tableId: string, handReplay: HandReplay): void {
    if (!this.handHistories.has(tableId)) {
      this.handHistories.set(tableId, [])
    }

    const history = this.handHistories.get(tableId)!
    history.push(handReplay)

    // Keep only last 50 hands to manage memory
    if (history.length > 50) {
      history.shift()
    }
  }

  /**
   * Get hand history for replay
   */
  getHandHistory(tableId: string, limit: number = 10): HandReplay[] {
    const history = this.handHistories.get(tableId) || []
    return history.slice(-limit).reverse() // Most recent first
  }

  /**
   * Get tournament overview for multi-table viewing
   */
  getTournamentView(tournamentId: string): TournamentView | null {
    // Mock tournament data - would integrate with tournament system
    return {
      tournamentId,
      currentLevel: 3,
      nextBlindIncrease: 180, // seconds
      tables: [
        {
          tableId: 'table-1',
          playerCount: 9,
          averageStack: 15000,
          bigBlind: 200,
          isFeatureTable: true
        },
        {
          tableId: 'table-2', 
          playerCount: 8,
          averageStack: 12000,
          bigBlind: 200,
          isFeatureTable: false
        }
      ],
      leaderboard: [
        {
          playerId: 'player-1',
          username: 'PokerPro2024',
          chipCount: 25000,
          position: 1
        }
      ]
    }
  }

  /**
   * Get spectator count for a table
   */
  getSpectatorCount(tableId: string): number {
    const viewers = this.tableViewers.get(tableId)
    return viewers ? viewers.size : 0
  }

  /**
   * Get all spectators for a table
   */
  getTableSpectators(tableId: string): SpectatorInfo[] {
    const viewers = this.tableViewers.get(tableId)
    if (!viewers) return []

    return Array.from(viewers)
      .map(id => this.spectators.get(id))
      .filter(Boolean) as SpectatorInfo[]
  }

  /**
   * Update spectator preferences
   */
  updateSpectatorPreferences(
    spectatorId: string, 
    preferences: Partial<Pick<SpectatorInfo, 'isEducationalMode' | 'preferredView' | 'followedPlayerId'>>
  ): boolean {
    const spectator = this.spectators.get(spectatorId)
    if (!spectator) return false

    Object.assign(spectator, preferences)
    this.spectators.set(spectatorId, spectator)
    return true
  }

  /**
   * Get spectator statistics
   */
  getSpectatorStats(): {
    totalSpectators: number
    activeSpectators: number
    tablesWithSpectators: number
    averageViewingTime: number
  } {
    const now = Date.now()
    const activeThreshold = 5 * 60 * 1000 // 5 minutes

    const activeSpectators = Array.from(this.spectators.values())
      .filter(s => (now - s.joinedAt) < activeThreshold).length

    return {
      totalSpectators: this.spectators.size,
      activeSpectators,
      tablesWithSpectators: this.tableViewers.size,
      averageViewingTime: 12 * 60 * 1000 // Mock: 12 minutes average
    }
  }

  /**
   * Queue a game state update for delayed broadcast to spectators
   */
  queueSpectatorUpdate(tableId: string, update: SpectatorUpdate): boolean {
    const viewers = this.tableViewers.get(tableId)
    if (!viewers || viewers.size === 0) {
      return false
    }

    // Initialize queue if needed
    if (!this.updateQueues.has(tableId)) {
      this.updateQueues.set(tableId, [])
    }

    // Add update to queue
    this.updateQueues.get(tableId)!.push(update)

    // Clear existing timer
    const existingTimer = this.updateTimers.get(tableId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Set new timer for delayed broadcast
    const timer = setTimeout(() => {
      this.broadcastPendingUpdates(tableId)
    }, this.SPECTATOR_DELAY_MS)

    this.updateTimers.set(tableId, timer)
    return true
  }

  /**
   * Get the number of pending updates for a table
   */
  getPendingUpdatesCount(tableId: string): number {
    const queue = this.updateQueues.get(tableId)
    return queue ? queue.length : 0
  }

  /**
   * Broadcast pending updates to spectators
   */
  private broadcastPendingUpdates(tableId: string): void {
    const queue = this.updateQueues.get(tableId)
    if (!queue || queue.length === 0) {
      return
    }

    // Get the latest update (last in queue)
    const latestUpdate = queue[queue.length - 1]

    // Clear the queue
    this.updateQueues.set(tableId, [])
    this.updateTimers.delete(tableId)

    // Broadcast to callback if set
    if (this.onBroadcast) {
      this.onBroadcast(tableId, latestUpdate)
    }
  }
}
