/**
 * Tournament Viewer - Phase 3B.3.3
 * 
 * Provides multi-table tournament viewing capabilities including:
 * - Tournament bracket overview
 * - Picture-in-picture for multiple tables
 * - Live leaderboard updates
 * - Final table streaming
 */

import { SpectatorManager, TournamentView, SpectatorInfo, SpectatorGameView } from './spectator-manager'
import { GameState, GamePlayer } from '@primo-poker/shared'

export interface TournamentTable {
  tableId: string
  tableName: string
  currentLevel: number
  playersRemaining: number
  averageStack: number
  bigBlind: number
  isFeatureTable: boolean
  spectatorCount: number
}

export interface TournamentBracket {
  tournamentId: string
  name: string
  status: 'registering' | 'running' | 'final_table' | 'completed'
  startTime: number
  currentLevel: number
  nextLevelTime: number
  totalPlayers: number
  playersRemaining: number
  prizePool: number
  tables: TournamentTable[]
  payouts: Array<{
    position: number
    amount: number
    percentage: number
  }>
}

export interface MultiTableView {
  primaryTable: {
    tableId: string
    gameView: SpectatorGameView
  }
  secondaryTables: Array<{
    tableId: string
    thumbnail: TournamentTableSummary
  }>
  tournament: TournamentBracket
  focusedPlayerId?: string | undefined
}

export interface TournamentTableSummary {
  tableId: string
  currentPot: number
  biggestStack: number
  smallestStack: number
  activePlayerCount: number
  currentAction: string
  lastUpdate: number
}

export class TournamentViewer {
  private spectatorManager: SpectatorManager
  private tournaments: Map<string, TournamentBracket> = new Map()
  private tableViews: Map<string, SpectatorGameView> = new Map()
  private autoSwitchEnabled: boolean = true
  private featureTableRotationInterval: number = 30000 // 30 seconds

  constructor(spectatorManager: SpectatorManager) {
    this.spectatorManager = spectatorManager
  }

  /**
   * Register a tournament for viewing
   */
  registerTournament(tournament: TournamentBracket): void {
    this.tournaments.set(tournament.tournamentId, tournament)
    console.log(`Registered tournament: ${tournament.name}`)
  }

  /**
   * Get comprehensive multi-table view for a tournament
   */
  getMultiTableView(
    tournamentId: string, 
    spectatorId: string,
    primaryTableId?: string
  ): MultiTableView | null {
    const tournament = this.tournaments.get(tournamentId)
    if (!tournament) {
      console.error(`Tournament ${tournamentId} not found`)
      return null
    }

    // Determine primary table (feature table or specified table)
    const primaryTable = primaryTableId 
      ? tournament.tables.find(t => t.tableId === primaryTableId)
      : tournament.tables.find(t => t.isFeatureTable) || tournament.tables[0]

    if (!primaryTable) {
      console.error('No suitable primary table found')
      return null
    }

    // Get detailed view for primary table
    const primaryGameView = this.tableViews.get(primaryTable.tableId)
    if (!primaryGameView) {
      console.error(`No game view available for table ${primaryTable.tableId}`)
      return null
    }

    // Get summaries for other tables
    const secondaryTables = tournament.tables
      .filter(t => t.tableId !== primaryTable.tableId)
      .map(table => ({
        tableId: table.tableId,
        thumbnail: this.generateTableSummary(table)
      }))

    return {
      primaryTable: {
        tableId: primaryTable.tableId,
        gameView: primaryGameView
      },
      secondaryTables,
      tournament,
      focusedPlayerId: this.getFocusedPlayer(spectatorId)
    }
  }

  /**
   * Update table view for spectator viewing
   */
  updateTableView(
    tableId: string, 
    gameState: GameState, 
    players: GamePlayer[],
    spectatorId: string
  ): void {
    const gameView = this.spectatorManager.generateSpectatorView(
      tableId, 
      gameState, 
      players, 
      spectatorId
    )
    
    this.tableViews.set(tableId, gameView)
  }

  /**
   * Switch primary table focus
   */
  switchPrimaryTable(
    tournamentId: string, 
    newPrimaryTableId: string
  ): boolean {
    const tournament = this.tournaments.get(tournamentId)
    if (!tournament) return false

    const targetTable = tournament.tables.find(t => t.tableId === newPrimaryTableId)
    if (!targetTable) return false

    // Update feature table designation
    tournament.tables.forEach(table => {
      table.isFeatureTable = (table.tableId === newPrimaryTableId)
    })

    console.log(`Switched primary table to ${newPrimaryTableId}`)
    return true
  }

  /**
   * Follow a specific player across tables
   */
  followPlayer(spectatorId: string, playerId: string): boolean {
    return this.spectatorManager.updateSpectatorPreferences(spectatorId, {
      followedPlayerId: playerId
    })
  }

  /**
   * Get tournament statistics
   */
  getTournamentStats(tournamentId: string): {
    totalPlayers: number
    playersRemaining: number
    averageStack: number
    biggestStack: number
    prizesAwarded: number
    eliminationsThisLevel: number
  } | null {
    const tournament = this.tournaments.get(tournamentId)
    if (!tournament) return null

    // Calculate real-time statistics
    const allStacks = tournament.tables.flatMap(table => 
      Array.from({ length: table.playersRemaining }, () => table.averageStack)
    )

    return {
      totalPlayers: tournament.totalPlayers,
      playersRemaining: tournament.playersRemaining,
      averageStack: allStacks.reduce((sum, stack) => sum + stack, 0) / allStacks.length,
      biggestStack: Math.max(...allStacks),
      prizesAwarded: tournament.totalPlayers - tournament.playersRemaining,
      eliminationsThisLevel: 0 // Would track eliminations since level started
    }
  }

  /**
   * Enable/disable automatic table switching for exciting action
   */
  setAutoSwitch(enabled: boolean): void {
    this.autoSwitchEnabled = enabled
    
    if (enabled) {
      console.log('Auto-switch enabled: Will automatically focus on exciting action')
    } else {
      console.log('Auto-switch disabled: Manual table selection only')
    }
  }

  /**
   * Generate table summary for thumbnail view
   */
  private generateTableSummary(table: TournamentTable): TournamentTableSummary {
    // In a real implementation, this would get actual game data
    return {
      tableId: table.tableId,
      currentPot: Math.floor(Math.random() * 50000) + 5000,
      biggestStack: Math.floor(table.averageStack * 2.5),
      smallestStack: Math.floor(table.averageStack * 0.3),
      activePlayerCount: table.playersRemaining,
      currentAction: this.generateRandomAction(),
      lastUpdate: Date.now()
    }
  }

  /**
   * Get focused player for spectator
   */
  private getFocusedPlayer(spectatorId: string): string | undefined {
    const spectators = this.spectatorManager.getTableSpectators('') // Would need table context
    const spectator = spectators.find(s => s.spectatorId === spectatorId)
    return spectator?.followedPlayerId
  }

  /**
   * Generate random action for demo purposes
   */
  private generateRandomAction(): string {
    const actions = [
      'Player raises to 2,400',
      'All-in for 15,200!',
      'Player calls',
      'Big fold on the river',
      'Showdown in progress'
    ]
    const randomAction = actions[Math.floor(Math.random() * actions.length)]
    return randomAction || 'Waiting for action...'
  }

  /**
   * Detect exciting action for auto-switching
   */
  detectExcitingAction(tableId: string, gameState: GameState, players: GamePlayer[]): boolean {
    // Criteria for exciting action:
    // - All-in situations
    // - Large pots (relative to blinds)
    // - Multiple active players in big pots
    // - Final table situations

    const pot = gameState.pot || 0
    const bigBlind = 200 // Would get from game config
    const activePlayers = players.filter(p => !p.isFolded).length

    // Large pot threshold (20+ big blinds)
    const isLargePot = pot > (bigBlind * 20)
    
    // Multiple players in action
    const isMultiWay = activePlayers >= 3

    // All-in situation
    const hasAllIn = players.some(p => p.isAllIn)

    return isLargePot || (isMultiWay && pot > bigBlind * 10) || hasAllIn
  }

  /**
   * Auto-switch to most exciting table
   */
  autoSwitchToExcitingAction(tournamentId: string): string | null {
    if (!this.autoSwitchEnabled) return null

    const tournament = this.tournaments.get(tournamentId)
    if (!tournament) return null

    // Find table with most exciting action
    let mostExcitingTable: string | null = null
    let highestExcitementScore = 0

    tournament.tables.forEach(table => {
      const gameView = this.tableViews.get(table.tableId)
      if (gameView) {
        const excitementScore = this.calculateExcitementScore(
          gameView.gameState, 
          gameView.players
        )
        
        if (excitementScore > highestExcitementScore) {
          highestExcitementScore = excitementScore
          mostExcitingTable = table.tableId
        }
      }
    })

    if (mostExcitingTable && highestExcitementScore > 5) {
      this.switchPrimaryTable(tournamentId, mostExcitingTable)
      return mostExcitingTable
    }

    return null
  }

  /**
   * Calculate excitement score for a table
   */
  private calculateExcitementScore(gameState: GameState, players: GamePlayer[]): number {
    let score = 0
    const pot = gameState.pot || 0
    const bigBlind = 200 // Would get from game config

    // Pot size contribution
    score += Math.min(pot / bigBlind, 50) // Max 50 points for pot size

    // Active players
    const activePlayers = players.filter(p => !p.isFolded).length
    score += activePlayers * 2

    // All-in situations
    const allInPlayers = players.filter(p => p.isAllIn).length
    score += allInPlayers * 10

    // Showdown phase
    if (gameState.phase === 'showdown') {
      score += 5
    }

    return score
  }

  /**
   * Get viewing statistics
   */
  getViewingStats(): {
    activeTournaments: number
    totalSpectators: number
    mostWatchedTable: string | null
    averageViewingTime: number
  } {
    const spectatorStats = this.spectatorManager.getSpectatorStats()
    
    return {
      activeTournaments: this.tournaments.size,
      totalSpectators: spectatorStats.totalSpectators,
      mostWatchedTable: null, // Would calculate from spectator distribution
      averageViewingTime: spectatorStats.averageViewingTime
    }
  }
}
