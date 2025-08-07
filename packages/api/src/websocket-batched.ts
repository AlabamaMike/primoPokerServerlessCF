import {
  WebSocketMessage,
  createWebSocketMessage,
} from '@primo-poker/shared';
import { CompressedWebSocketManager, CompressedConnection } from './websocket-compressed';

export interface BatchingOptions {
  batchWindow?: number; // ms
  maxBatchSize?: number;
  enableAdaptiveBatching?: boolean;
  enableDeduplication?: boolean;
}

interface QueuedMessage {
  message: WebSocketMessage;
  priority: number;
  timestamp: number;
  hash: string | undefined;
}

interface BatchingConfig {
  currentWindow: number;
  messageFrequency: number;
  lastAdjustment: number;
}

interface BatchingStats {
  totalMessages: number;
  totalBatches: number;
  messagesPerBatch: number[];
  compressionRatio: number;
}

interface ConnectionBatchingState {
  queue: QueuedMessage[];
  batchTimer?: number | ReturnType<typeof setTimeout>;
  config: BatchingConfig;
  stats: BatchingStats;
  lastMessageTime: number;
}

export class BatchingWebSocketManager extends CompressedWebSocketManager {
  private batchingOptions: Required<BatchingOptions>;
  private connectionStates = new Map<string, ConnectionBatchingState>();
  private errorStats = {
    sendFailures: 0,
    batchingErrors: 0,
  };

  constructor(jwtSecret: string, options: BatchingOptions = {}) {
    super(jwtSecret);
    
    this.batchingOptions = {
      batchWindow: options.batchWindow ?? 100,
      maxBatchSize: options.maxBatchSize ?? 10,
      enableAdaptiveBatching: options.enableAdaptiveBatching ?? true,
      enableDeduplication: options.enableDeduplication ?? false,
    };
  }

  async handleConnection(ws: WebSocket, request: Request): Promise<void> {
    await super.handleConnection(ws, request);

    const connectionId = this.findConnectionId(ws);
    if (!connectionId) return;

    // Initialize batching state
    this.connectionStates.set(connectionId, {
      queue: [],
      config: {
        currentWindow: this.batchingOptions.batchWindow,
        messageFrequency: 0,
        lastAdjustment: Date.now(),
      },
      stats: {
        totalMessages: 0,
        totalBatches: 0,
        messagesPerBatch: [],
        compressionRatio: 1,
      },
      lastMessageTime: Date.now(),
    });

    // Override close handler to clean up batching state
    ws.addEventListener('close', () => {
      this.cleanupBatchingState(connectionId);
    });
  }

  public queueMessage(
    ws: WebSocket,
    message: WebSocketMessage,
    options: { priority?: number } = {}
  ): void {
    const connectionId = this.findConnectionId(ws);
    if (!connectionId) return;

    const state = this.connectionStates.get(connectionId);
    if (!state) return;

    const connection = this.getConnectionInfo(ws);
    if (!connection || connection.ws.readyState !== 1) return; // 1 = OPEN

    // Create queued message
    const queuedMessage: QueuedMessage = {
      message,
      priority: options.priority ?? this.getDefaultPriority(message),
      timestamp: Date.now(),
      hash: this.batchingOptions.enableDeduplication ? this.hashMessage(message) : undefined,
    };

    // Update stats
    state.stats.totalMessages++;
    this.updateMessageFrequency(state);

    // Add to queue
    state.queue.push(queuedMessage);

    // Check if we should send immediately
    if (this.shouldSendImmediately(state, queuedMessage)) {
      this.flushBatch(connectionId);
    } else {
      // Schedule batch send
      this.scheduleBatchSend(connectionId);
    }
  }

  public sendImmediate(ws: WebSocket, message: WebSocketMessage): void {
    // Bypass batching for high-priority messages
    const connectionId = this.findConnectionId(ws);
    if (connectionId) {
      this.sendToConnection(connectionId, message);
    }
  }

  private shouldSendImmediately(
    state: ConnectionBatchingState,
    message: QueuedMessage
  ): boolean {
    // Send immediately if:
    // 1. Queue is at max size
    // 2. Message has critical priority (>= 10)
    // 3. Message is real-time critical
    return state.queue.length >= this.batchingOptions.maxBatchSize ||
      message.priority >= 10 ||
      this.isRealtimeCritical(message.message);
  }

  private scheduleBatchSend(connectionId: string): void {
    const state = this.connectionStates.get(connectionId);
    if (!state || state.batchTimer) return;

    state.batchTimer = setTimeout(() => {
      this.flushBatch(connectionId);
    }, state.config.currentWindow);
  }

  private flushBatch(connectionId: string): void {
    const state = this.connectionStates.get(connectionId);
    if (!state || state.queue.length === 0) return;

    const connection = this.getConnectionInfo(this.getConnectionById(connectionId));
    if (!connection || connection.ws.readyState !== 1) { // 1 = OPEN
      state.queue = [];
      return;
    }

    // Clear timer
    if (state.batchTimer) {
      clearTimeout(state.batchTimer);
      delete state.batchTimer;
    }

    try {
      // Sort by priority (highest first) and timestamp
      state.queue.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.timestamp - b.timestamp;
      });

      // Deduplicate if enabled
      let messages = state.queue;
      if (this.batchingOptions.enableDeduplication) {
        messages = this.deduplicateMessages(messages);
      }

      // Send as batch
      const batchMessage = createWebSocketMessage('batch', {
        messages: messages.map(m => m.message),
        count: messages.length,
        timestamp: Date.now(),
      });

      const ws = connection ? connection.ws : undefined;
      if (ws) {
        super.sendWebSocketMessage(ws, batchMessage);
      }

      // Update stats
      state.stats.totalBatches++;
      state.stats.messagesPerBatch.push(messages.length);
      if (state.stats.messagesPerBatch.length > 100) {
        state.stats.messagesPerBatch.shift(); // Keep last 100
      }

      // Clear queue
      state.queue = [];

      // Adapt batching window if enabled
      if (this.batchingOptions.enableAdaptiveBatching) {
        this.adaptBatchingWindow(state);
      }
    } catch (error) {
      console.error('Failed to send batch:', error);
      this.errorStats.sendFailures++;
      this.errorStats.batchingErrors++;
    }
  }

  private deduplicateMessages(messages: QueuedMessage[]): QueuedMessage[] {
    const seen = new Set<string>();
    const deduplicated: QueuedMessage[] = [];

    for (const msg of messages) {
      if (msg.hash && !seen.has(msg.hash)) {
        seen.add(msg.hash);
        deduplicated.push(msg);
      } else if (!msg.hash) {
        deduplicated.push(msg);
      }
    }

    return deduplicated;
  }

  private adaptBatchingWindow(state: ConnectionBatchingState): void {
    const now = Date.now();
    if (now - state.config.lastAdjustment < 5000) return; // Adjust at most every 5s

    const avgBatchSize = state.stats.messagesPerBatch.length > 0
      ? state.stats.messagesPerBatch.reduce((a, b) => a + b, 0) / state.stats.messagesPerBatch.length
      : 0;

    // Adjust window based on message frequency and batch size
    if (state.config.messageFrequency > 20 && avgBatchSize > 5) {
      // High frequency - decrease window
      state.config.currentWindow = Math.max(20, state.config.currentWindow * 0.8);
    } else if (state.config.messageFrequency < 5 && avgBatchSize < 2) {
      // Low frequency - increase window
      state.config.currentWindow = Math.min(500, state.config.currentWindow * 1.2);
    }

    state.config.lastAdjustment = now;
  }

  private updateMessageFrequency(state: ConnectionBatchingState): void {
    const now = Date.now();
    const timeSinceLastMessage = now - state.lastMessageTime;
    
    // Calculate exponential moving average of message frequency
    const instantFrequency = timeSinceLastMessage > 0 ? 1000 / timeSinceLastMessage : 0;
    state.config.messageFrequency = state.config.messageFrequency * 0.7 + instantFrequency * 0.3;
    
    state.lastMessageTime = now;
  }

  private getDefaultPriority(message: WebSocketMessage): number {
    // Assign default priorities based on message type
    const priorities: Record<string, number> = {
      'player_action': 5,
      'game_update': 3,
      'chat': 1,
      'system': 2,
      'disconnect_warning': 10,
      'error': 8,
    };
    return priorities[message.type] ?? 2;
  }

  protected isRealtimeCritical(message: WebSocketMessage): boolean {
    return ['player_action', 'disconnect_warning'].includes(message.type);
  }

  private hashMessage(message: WebSocketMessage): string {
    // Simple hash for deduplication
    return `${message.type}:${JSON.stringify(message.payload)}`;
  }

  private cleanupBatchingState(connectionId: string): void {
    const state = this.connectionStates.get(connectionId);
    if (state) {
      if (state.batchTimer) {
        clearTimeout(state.batchTimer);
      }
      this.connectionStates.delete(connectionId);
    }
  }

  protected findConnectionId(ws: WebSocket): string | undefined {
    const connections = this.getAllConnections();
    for (const [id, connection] of connections) {
      if (connection.ws === ws) {
        return id;
      }
    }
    return undefined;
  }

  private getConnectionById(connectionId: string): WebSocket | undefined {
    const connections = this.getAllConnections();
    const connection = connections.get(connectionId);
    return connection?.ws;
  }

  // Public API
  public getBatchingConfig(ws: WebSocket): BatchingConfig | undefined {
    const connectionId = this.findConnectionId(ws);
    if (!connectionId) return undefined;
    
    const state = this.connectionStates.get(connectionId);
    return state?.config;
  }

  public getBatchingStats(): {
    totalMessages: number;
    totalBatches: number;
    averageBatchSize: number;
    compressionRatio: number;
  } {
    let totalMessages = 0;
    let totalBatches = 0;
    const allBatchSizes: number[] = [];

    for (const state of this.connectionStates.values()) {
      totalMessages += state.stats.totalMessages;
      totalBatches += state.stats.totalBatches;
      allBatchSizes.push(...state.stats.messagesPerBatch);
    }

    const averageBatchSize = allBatchSizes.length > 0
      ? allBatchSizes.reduce((a, b) => a + b, 0) / allBatchSizes.length
      : 0;

    return {
      totalMessages,
      totalBatches,
      averageBatchSize,
      compressionRatio: totalBatches > 0 ? totalMessages / totalBatches : 1,
    };
  }

  public getConnectionBatchingStats(ws: WebSocket): BatchingStats & { averageBatchSize: number } | undefined {
    const connectionId = this.findConnectionId(ws);
    if (!connectionId) return undefined;
    
    const state = this.connectionStates.get(connectionId);
    if (!state) return undefined;

    const avgBatchSize = state.stats.messagesPerBatch.length > 0
      ? state.stats.messagesPerBatch.reduce((a, b) => a + b, 0) / state.stats.messagesPerBatch.length
      : 0;

    return {
      ...state.stats,
      averageBatchSize: avgBatchSize,
    };
  }

  public getErrorStats(): {
    sendFailures: number;
    batchingErrors: number;
  } {
    return { ...this.errorStats };
  }
}