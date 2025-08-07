/**
 * Table State Change Detector
 * Detects changes in lobby table state for real-time updates
 */

import { TableListing } from '@primo-poker/shared'

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
  private readonly statsFields = ['avgPot', 'handsPerHour']
  
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
            changes.push({
              type: 'STATS_UPDATED',
              tableId,
              stats: {
                avgPot: newTable.avgPot,
                handsPerHour: newTable.handsPerHour
              }
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
    
    // Check player list (compare lengths for now)
    if (oldTable.playerList.length !== newTable.playerList.length) {
      changedFields.push('playerList')
    }
    
    return changedFields
  }
}