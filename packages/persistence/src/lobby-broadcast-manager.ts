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
  maxRetries?: number       // Maximum retry attempts for failed broadcasts
  retryDelayMs?: number     // Delay between retry attempts
  maxHistorySize?: number   // Maximum broadcast history to keep
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
  private batchTimer: ReturnType<typeof setTimeout> | null = null
  private sequenceNumber: number = 0
  private lastState: Map<string, TableListing> = new Map()
  private config: BroadcastConfig
  
  // Internal state
  private lastBroadcast: WebSocketMessage | undefined
  private allBroadcasts: WebSocketMessage[] = []
  private broadcastBatches: { timestamp: number; updates: TableChange[] }[] = []
  private maxHistorySize: number
  
  constructor(
    config: BroadcastConfig = {
      batchingWindowMs: 100,
      maxBatchSize: 50,
      maxRetries: 3,
      retryDelayMs: 1000,
      maxHistorySize: 1000
    }
  ) {
    this.config = {
      ...config,
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1000,
      maxHistorySize: config.maxHistorySize ?? 1000
    }
    this.maxHistorySize = this.config.maxHistorySize || 1000
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
    
    // Store message with memory management
    this.lastBroadcast = message
    this.addToHistory(message)
    this.addToBatchHistory({
      timestamp: Date.now(),
      updates: changes
    })
    
    // Broadcast with retry logic
    await this.broadcastWithRetry(message, broadcastFn, {
      sequenceId: this.sequenceNumber,
      changeCount: changes.length,
      patchCount: patch.length
    })
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
    
    // Store message with memory management
    this.lastBroadcast = message
    this.addToHistory(message)
    
    // Broadcast with retry logic
    await this.broadcastWithRetry(message, broadcastFn, {
      type,
      tableId: table.tableId,
      sequenceId: this.sequenceNumber
    })
  }
  
  /**
   * Get current sequence number
   */
  getSequenceNumber(): number {
    return this.sequenceNumber
  }
  
  /**
   * Clean up resources
   */
  cleanup(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }
  }
  
  /**
   * Broadcast with retry logic
   */
  private async broadcastWithRetry(
    message: WebSocketMessage,
    broadcastFn: (message: WebSocketMessage) => Promise<void>,
    metadata: Record<string, unknown>
  ): Promise<void> {
    const maxRetries = this.config.maxRetries || 3
    const retryDelayMs = this.config.retryDelayMs || 1000
    
    let lastError: Error | undefined
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await broadcastFn(message)
        logger.info('Broadcast successful', { ...metadata, attempt })
        return
      } catch (error) {
        lastError = error as Error
        logger.error('Broadcast failed', {
          ...metadata,
          attempt,
          error: lastError.message,
          willRetry: attempt < maxRetries
        })
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelayMs * Math.pow(2, attempt)))
        }
      }
    }
    
    // All retries failed
    logger.error('All broadcast retries failed', {
      ...metadata,
      attempts: maxRetries + 1,
      error: lastError?.message
    })
  }
  
  /**
   * Add message to history with circular buffer behavior
   */
  private addToHistory(message: WebSocketMessage): void {
    this.allBroadcasts.push(message)
    
    // Maintain circular buffer
    if (this.allBroadcasts.length > this.maxHistorySize) {
      this.allBroadcasts.shift()
    }
  }
  
  /**
   * Add batch to history with circular buffer behavior
   */
  private addToBatchHistory(batch: { timestamp: number; updates: TableChange[] }): void {
    this.broadcastBatches.push(batch)
    
    // Maintain circular buffer
    if (this.broadcastBatches.length > this.maxHistorySize) {
      this.broadcastBatches.shift()
    }
  }
}