export interface BatchedMessage<T = any> {
  type: string;
  payload: T;
  timestamp: number;
}

export interface MessageBatcherConfig {
  batchInterval: number;
  maxBatchSize?: number;
  onBatch: (messages: BatchedMessage[]) => void;
  onError?: (error: Error) => void;
}

export interface MessageBatcherMetrics {
  totalMessages: number;
  totalBatches: number;
  averageBatchSize: number;
  messagesDropped: number;
  processingTime: number[];
  lastBatchTime: number;
}

export class MessageBatcher<T = any> {
  private queue: BatchedMessage<T>[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private config: MessageBatcherConfig;
  private metrics: MessageBatcherMetrics = {
    totalMessages: 0,
    totalBatches: 0,
    averageBatchSize: 0,
    messagesDropped: 0,
    processingTime: [],
    lastBatchTime: 0
  };
  private messageDedupeMap = new Map<string, BatchedMessage<T>>();
  private isProcessing = false;

  constructor(config: MessageBatcherConfig) {
    this.config = {
      maxBatchSize: 100,
      ...config
    };
  }

  /**
   * Add a message to the batch queue
   */
  add(type: string, payload: T): void {
    try {
      const message: BatchedMessage<T> = {
        type,
        payload,
        timestamp: Date.now()
      };

      this.metrics.totalMessages++;

      // For table updates, use deduplication
      if (type === 'table_updated' && this.isTableUpdate(payload)) {
        const tableId = (payload as any).id;
        const key = `${type}-${tableId}`;
        this.messageDedupeMap.set(key, message);
      } else {
        this.queue.push(message);
      }

      // Start batch timer if not already running
      if (!this.timer && !this.isProcessing) {
        this.timer = setTimeout(() => this.processBatch(), this.config.batchInterval);
      }

      // Process immediately if we hit max batch size
      if (this.queue.length + this.messageDedupeMap.size >= (this.config.maxBatchSize || 100)) {
        this.processBatch();
      }
    } catch (error) {
      this.metrics.messagesDropped++;
      this.config.onError?.(error as Error);
    }
  }

  /**
   * Process the current batch of messages
   */
  private async processBatch(): Promise<void> {
    if (this.isProcessing || (this.queue.length === 0 && this.messageDedupeMap.size === 0)) {
      this.timer = null;
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      // Clear the timer
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }

      // Combine queue and deduplicated messages
      const messages: BatchedMessage<T>[] = [
        ...this.queue,
        ...Array.from(this.messageDedupeMap.values())
      ];

      // Clear the queue and dedup map
      this.queue = [];
      this.messageDedupeMap.clear();

      if (messages.length > 0) {
        // Sort by timestamp to maintain order
        messages.sort((a, b) => a.timestamp - b.timestamp);

        // Process the batch
        await this.config.onBatch(messages);

        // Update metrics
        this.metrics.totalBatches++;
        this.metrics.averageBatchSize = 
          (this.metrics.averageBatchSize * (this.metrics.totalBatches - 1) + messages.length) / 
          this.metrics.totalBatches;
        this.metrics.lastBatchTime = Date.now();
        
        const processingTime = Date.now() - startTime;
        this.metrics.processingTime.push(processingTime);
        
        // Keep only last 100 processing times
        if (this.metrics.processingTime.length > 100) {
          this.metrics.processingTime.shift();
        }
      }
    } catch (error) {
      this.config.onError?.(error as Error);
    } finally {
      this.isProcessing = false;
      
      // Schedule next batch if there are pending messages
      if (this.queue.length > 0 || this.messageDedupeMap.size > 0) {
        this.timer = setTimeout(() => this.processBatch(), this.config.batchInterval);
      }
    }
  }

  /**
   * Force process any pending messages immediately
   */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.processBatch();
  }

  /**
   * Get current metrics
   */
  getMetrics(): MessageBatcherMetrics {
    return {
      ...this.metrics,
      averageProcessingTime: this.metrics.processingTime.length > 0
        ? this.metrics.processingTime.reduce((a, b) => a + b, 0) / this.metrics.processingTime.length
        : 0
    } as MessageBatcherMetrics & { averageProcessingTime: number };
  }

  /**
   * Clear all pending messages and reset metrics
   */
  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.queue = [];
    this.messageDedupeMap.clear();
    this.metrics = {
      totalMessages: 0,
      totalBatches: 0,
      averageBatchSize: 0,
      messagesDropped: 0,
      processingTime: [],
      lastBatchTime: 0
    };
  }

  /**
   * Destroy the batcher and clear all resources
   */
  destroy(): void {
    this.clear();
  }

  /**
   * Check if payload is a table update
   */
  private isTableUpdate(payload: unknown): payload is { id: string } {
    return (
      payload !== null &&
      typeof payload === 'object' &&
      'id' in payload
    );
  }
}

/**
 * Debounce helper for rapid updates
 */
export function createDebouncer<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const debounced = ((...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  }) as T;

  (debounced as any).cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced as T & { cancel: () => void };
}