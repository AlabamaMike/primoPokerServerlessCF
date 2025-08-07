/**
 * Table State Change Detector
 * Detects changes in lobby table state for real-time updates
 */

import { TableListing } from '@primo-poker/shared'

export interface TableStateChangeDetectorConfig {
  statsFields?: string[]
}

export type TableChangeType = 'TABLE_CREATED' | 'TABLE_UPDATED' | 'TABLE_REMOVED' | 'STATS_UPDATED'

export interface TableChange {
  type: TableChangeType
  tableId: string
  data?: TableListing
  fields?: string[]
  updates?: Partial<TableListing>
  stats?: {
    avgPot: number
    handsPerHour: number
  }
}

export class TableStateChangeDetector {
  private readonly statsFields: string[]
  
  constructor(config?: TableStateChangeDetectorConfig) {
    this.statsFields = config?.statsFields || ['avgPot', 'handsPerHour']
  }
  
  /**
   * Detect changes between old and new table states
   */
  detectChanges(
    oldState: Map<string, TableListing>, 
    newState: Map<string, TableListing>
  ): TableChange[] {
    const changes: TableChange[] = []
    
    // Check for new tables
    for (const [tableId, newTable] of newState) {
      if (!oldState.has(tableId)) {
        changes.push({
          type: 'TABLE_CREATED',
          tableId,
          data: newTable
        })
      }
    }
    
    // Check for removed tables
    for (const [tableId] of oldState) {
      if (!newState.has(tableId)) {
        changes.push({
          type: 'TABLE_REMOVED',
          tableId
        })
      }
    }
    
    // Check for updated tables
    for (const [tableId, newTable] of newState) {
      const oldTable = oldState.get(tableId)
      if (oldTable) {
        const changedFields = this.detectFieldChanges(oldTable, newTable)
        
        if (changedFields.length > 0) {
          // Check if only stats changed
          const onlyStatsChanged = changedFields.every(field => 
            this.statsFields.includes(field)
          )
          
          if (onlyStatsChanged) {
            const stats: Record<string, unknown> = {}
            changedFields.forEach(field => {
              stats[field] = newTable[field as keyof TableListing]
            })
            
            changes.push({
              type: 'STATS_UPDATED',
              tableId,
              stats: stats as any // Type will be validated by consumers
            })
          } else {
            const updates: Partial<TableListing> = {}
            changedFields.forEach(field => {
              (updates as Record<string, unknown>)[field] = newTable[field as keyof TableListing]
            })
            
            changes.push({
              type: 'TABLE_UPDATED',
              tableId,
              fields: changedFields,
              updates
            })
          }
        }
      }
    }
    
    return changes
  }
  
  /**
   * Detect which fields changed between two table listings
   */
  private detectFieldChanges(
    oldTable: TableListing, 
    newTable: TableListing
  ): string[] {
    const changedFields: string[] = []
    
    // Check simple fields
    const simpleFields: (keyof TableListing)[] = [
      'name', 'gameType', 'currentPlayers', 'maxPlayers', 
      'isPrivate', 'requiresPassword', 'avgPot', 'handsPerHour',
      'waitingList', 'status'
    ]
    
    for (const field of simpleFields) {
      if (oldTable[field] !== newTable[field]) {
        changedFields.push(field)
      }
    }
    
    // Check stakes
    if (oldTable.stakes.smallBlind !== newTable.stakes.smallBlind ||
        oldTable.stakes.bigBlind !== newTable.stakes.bigBlind) {
      changedFields.push('stakes')
    }
    
    // Check player list with deep comparison
    if (this.hasPlayerListChanged(oldTable.playerList, newTable.playerList)) {
      changedFields.push('playerList')
    }
    
    return changedFields
  }
  
  /**
   * Check if player list has changed (order matters in poker)
   */
  private hasPlayerListChanged(
    oldList: TableListing['playerList'],
    newList: TableListing['playerList']
  ): boolean {
    // Different lengths means changed
    if (oldList.length !== newList.length) {
      return true
    }
    
    // Check each player in order
    for (let i = 0; i < oldList.length; i++) {
      const oldPlayer = oldList[i]
      const newPlayer = newList[i]
      
      // Different player ID at same position
      if (oldPlayer?.playerId !== newPlayer?.playerId) {
        return true
      }
      
      // Check if player properties changed
      if (oldPlayer && newPlayer) {
        if (oldPlayer.chipCount !== newPlayer.chipCount ||
            oldPlayer.isActive !== newPlayer.isActive ||
            oldPlayer.username !== newPlayer.username) {
          return true
        }
      }
    }
    
    return false
  }
}