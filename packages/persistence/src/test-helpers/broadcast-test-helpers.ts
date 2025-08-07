/**
 * Test helpers for LobbyBroadcastManager
 * These should only be used in test environments
 */

import { WebSocketMessage } from '@primo-poker/shared'
import { TableChange } from '../table-state-detector'
import { LobbyBroadcastManager } from '../lobby-broadcast-manager'

export interface BroadcastTestData {
  lastBroadcast: WebSocketMessage | undefined
  allBroadcasts: WebSocketMessage[]
  broadcastBatches: { timestamp: number; updates: TableChange[] }[]
}

/**
 * Extract test data from a LobbyBroadcastManager instance
 * This uses reflection to access private fields for testing
 */
export function extractBroadcastTestData(manager: LobbyBroadcastManager): BroadcastTestData {
  // Access private fields via any cast (only for testing!)
  const anyManager = manager as any
  
  return {
    lastBroadcast: anyManager.lastBroadcast,
    allBroadcasts: [...anyManager.allBroadcasts],
    broadcastBatches: [...anyManager.broadcastBatches]
  }
}

/**
 * Reset the broadcast manager's internal state
 * This uses reflection to access private fields for testing
 */
export function resetBroadcastManager(manager: LobbyBroadcastManager): void {
  const anyManager = manager as any
  
  // Reset all internal state
  anyManager.pendingChanges = []
  anyManager.sequenceNumber = 0
  anyManager.lastState = new Map()
  anyManager.lastBroadcast = undefined
  anyManager.allBroadcasts = []
  anyManager.broadcastBatches = []
  
  // Clear any pending timers
  if (anyManager.batchTimer) {
    clearTimeout(anyManager.batchTimer)
    anyManager.batchTimer = null
  }
}