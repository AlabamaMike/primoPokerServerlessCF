/**
 * Lobby Broadcast Manager
 * Manages real-time updates with delta updates, batching, and sequence numbers
 */

import { TableListing, WebSocketMessage, createWebSocketMessage } from '@primo-poker/shared'
import { TableStateChangeDetector, TableChange } from './table-state-detector'
import { DeltaUpdateGenerator, JsonPatchOperation } from './delta-update-generator'
import { logger } from '@primo-poker/core'

export interface BroadcastConfig {
  batchingWindowMs: number  // Time window for batching updates
  maxBatchSize: number      // Maximum updates in a single batch
}

export interface LobbyUpdateMessage extends WebSocketMessage {
  type: 'table_delta_update'
  payload: {
    changes: TableChange[]
    patch: JsonPatchOperation[]
    sequenceId: number
    timestamp: number
  }
}

export class LobbyBroadcastManager {
  private stateDetector: TableStateChangeDetector
  private deltaGenerator: DeltaUpdateGenerator
  private pendingChanges: TableChange[] = []
  private batchTimer: NodeJS.Timeout | null = null
  private sequenceNumber: number = 0
  private lastState: Map<string, TableListing> = new Map()
  private config: BroadcastConfig
  
  // For testing
  private lastBroadcast?: WebSocketMessage
  private allBroadcasts: WebSocketMessage[] = []
  private broadcastBatches: { timestamp: number; updates: TableChange[] }[] = []
  
  constructor(
    config: BroadcastConfig = {
      batchingWindowMs: 100,
      maxBatchSize: 50
    }
  ) {
    this.config = config
    this.stateDetector = new TableStateChangeDetector()
    this.deltaGenerator = new DeltaUpdateGenerator()
  }
  
  /**
   * Update state and schedule broadcast
   */
  async updateState(
    newState: Map<string, TableListing>,
    broadcastFn: (message: WebSocketMessage) => Promise<void>
  ): Promise<void> {
    // Detect changes
    const changes = this.stateDetector.detectChanges(this.lastState, newState)
    
    if (changes.length === 0) {
      return
    }
    
    // Update last state
    this.lastState = new Map(newState)
    
    // Add to pending changes
    this.pendingChanges.push(...changes)
    
    // Schedule or execute broadcast
    if (this.pendingChanges.length >= this.config.maxBatchSize) {
      // Immediate broadcast if batch is full
      await this.flushPendingChanges(broadcastFn)
    } else {
      // Schedule batched broadcast
      this.scheduleBroadcast(broadcastFn)
    }
  }
  
  /**
   * Schedule a batched broadcast
   */
  private scheduleBroadcast(broadcastFn: (message: WebSocketMessage) => Promise<void>): void {
    if (this.batchTimer) {
      return // Already scheduled
    }
    
    this.batchTimer = setTimeout(async () => {
      await this.flushPendingChanges(broadcastFn)
    }, this.config.batchingWindowMs)
  }
  
  /**
   * Flush all pending changes
   */
  private async flushPendingChanges(
    broadcastFn: (message: WebSocketMessage) => Promise<void>
  ): Promise<void> {
    if (this.pendingChanges.length === 0) {
      return
    }
    
    // Clear timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }
    
    // Get changes and clear pending
    const changes = [...this.pendingChanges]
    this.pendingChanges = []
    
    // Generate patch
    const patch = this.deltaGenerator.generatePatch(changes)
    
    // Increment sequence number
    this.sequenceNumber++
    
    // Create message
    const message = createWebSocketMessage<LobbyUpdateMessage['payload']>(
      'table_delta_update',
      {
        changes,
        patch,
        sequenceId: this.sequenceNumber,
        timestamp: Date.now()
      },
      {
        sequenceId: this.sequenceNumber,
        requiresAck: false
      }
    )
    
    // Store for testing
    this.lastBroadcast = message
    this.allBroadcasts.push(message)
    this.broadcastBatches.push({
      timestamp: Date.now(),
      updates: changes
    })
    
    try {
      await broadcastFn(message)
      logger.info('Broadcast lobby update', {
        sequenceId: this.sequenceNumber,
        changeCount: changes.length,
        patchCount: patch.length
      })
    } catch (error) {
      logger.error('Failed to broadcast lobby update', error as Error)
    }
  }
  
  /**
   * Broadcast a single table change immediately
   */
  async broadcastTableChange(
    type: 'table_created' | 'table_updated' | 'table_removed',
    table: TableListing,
    broadcastFn: (message: WebSocketMessage) => Promise<void>
  ): Promise<void> {
    this.sequenceNumber++
    
    const message = createWebSocketMessage(
      type,
      {
        table,
        timestamp: Date.now()
      },
      {
        sequenceId: this.sequenceNumber
      }
    )
    
    // Store for testing
    this.lastBroadcast = message
    this.allBroadcasts.push(message)
    
    await broadcastFn(message)
  }
  
  /**
   * Get current sequence number
   */
  getSequenceNumber(): number {
    return this.sequenceNumber
  }
  
  /**
   * Reset state (for testing)
   */
  reset(): void {
    this.pendingChanges = []
    this.sequenceNumber = 0
    this.lastState = new Map()
    this.lastBroadcast = undefined
    this.allBroadcasts = []
    this.broadcastBatches = []
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }
  }
  
  // Testing helpers
  getLastBroadcast(): WebSocketMessage | undefined {
    return this.lastBroadcast
  }
  
  getAllBroadcasts(): WebSocketMessage[] {
    return this.allBroadcasts
  }
  
  getBroadcastBatches(): { timestamp: number; updates: TableChange[] }[] {
    return this.broadcastBatches
  }
}