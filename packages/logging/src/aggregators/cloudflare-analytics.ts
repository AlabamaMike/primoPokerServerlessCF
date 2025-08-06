import { LogAggregator, LogEntry } from '../types';

export interface FailedLogEntry {
  entry: LogEntry[];
  error: Error;
  timestamp: number;
  attempts: number;
}

export interface ErrorCallback {
  (error: Error, entries: LogEntry[]): void;
}

export interface CloudflareAnalyticsConfig {
  dataset: string;
  accountId: string;
  apiToken: string;
  batchSize?: number;
  flushInterval?: number;
  maxRetries?: number;
  retryDelay?: number;
  maxDeadLetterQueueSize?: number;
  onError?: ErrorCallback;
}

export class CloudflareAnalyticsAggregator implements LogAggregator {
  private readonly config: Required<CloudflareAnalyticsConfig>;
  private buffer: LogEntry[] = [];
  private deadLetterQueue: FailedLogEntry[] = [];
  private flushTimer?: any;
  private retryTimer?: any;
  private metrics = {
    totalSent: 0,
    totalFailed: 0,
    totalRetried: 0,
    totalDropped: 0,
  };

  constructor(config: CloudflareAnalyticsConfig) {
    this.config = {
      batchSize: 100,
      flushInterval: 5000, // 5 seconds
      maxRetries: 3,
      retryDelay: 1000, // 1 second base delay
      maxDeadLetterQueueSize: 1000,
      onError: () => {}, // No-op by default
      ...config,
    };

    this.startFlushTimer();
    this.startRetryTimer();
  }

  async send(entries: LogEntry[]): Promise<void> {
    this.buffer.push(...entries);
    
    if (this.buffer.length >= this.config.batchSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0, this.config.batchSize);
    
    try {
      await this.sendBatch(batch);
      this.metrics.totalSent += batch.length;
    } catch (error) {
      this.handleFailedBatch(batch, error as Error);
    }
  }

  private async sendBatch(entries: LogEntry[]): Promise<void> {
    // Transform entries to Cloudflare Analytics Engine format
    const analyticsEvents = entries.map(entry => ({
      timestamp: new Date(entry.timestamp).getTime(),
      indexes: [
        entry.level,
        entry.context.namespace || 'default',
        entry.context.operation || 'unknown',
        entry.context.resource || 'unknown',
      ],
      doubles: [
        entry.context.duration || 0,
      ],
      blobs: [
        entry.message,
        entry.context.correlationId || '',
        entry.context.playerId || '',
        entry.context.tableId || '',
        JSON.stringify(entry.error || {}),
      ],
    }));

    // Send to Cloudflare Analytics Engine using the correct ingestion endpoint
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/analytics_engine/${this.config.dataset}/event`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(analyticsEvents),
      }
    );

    if (!response.ok) {
      throw new Error(`Analytics Engine API error: ${response.status} ${response.statusText}`);
    }
  }

  private handleFailedBatch(entries: LogEntry[], error: Error): void {
    this.metrics.totalFailed += entries.length;

    // Invoke error callback
    this.config.onError(error, entries);

    // Add to dead letter queue if there's room
    if (this.deadLetterQueue.length < this.config.maxDeadLetterQueueSize) {
      this.deadLetterQueue.push({
        entry: entries,
        error,
        timestamp: Date.now(),
        attempts: 1,
      });
    } else {
      // Drop oldest entries if queue is full
      this.metrics.totalDropped += entries.length;
      console.error(`Dead letter queue full. Dropping ${entries.length} log entries.`);
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        console.error('Periodic flush failed:', error);
      });
    }, this.config.flushInterval);
  }

  private startRetryTimer(): void {
    this.retryTimer = setInterval(() => {
      this.processDeadLetterQueue().catch(error => {
        console.error('Dead letter queue processing failed:', error);
      });
    }, this.config.retryDelay * 5); // Check every 5x base retry delay
  }

  private async processDeadLetterQueue(): Promise<void> {
    if (this.deadLetterQueue.length === 0) return;

    const now = Date.now();
    const toRetry: FailedLogEntry[] = [];

    // Find entries ready for retry based on exponential backoff
    this.deadLetterQueue = this.deadLetterQueue.filter(failed => {
      const retryAfter = failed.timestamp + (this.config.retryDelay * Math.pow(2, failed.attempts - 1));
      
      if (now >= retryAfter && failed.attempts < this.config.maxRetries) {
        toRetry.push(failed);
        return false; // Remove from queue temporarily
      }
      
      if (failed.attempts >= this.config.maxRetries) {
        this.metrics.totalDropped += failed.entry.length;
        console.error(`Max retries (${this.config.maxRetries}) reached for ${failed.entry.length} log entries. Dropping permanently.`);
        return false; // Remove from queue permanently
      }
      
      return true; // Keep in queue for later
    });

    // Retry failed entries
    for (const failed of toRetry) {
      try {
        await this.sendBatch(failed.entry);
        this.metrics.totalRetried += failed.entry.length;
        this.metrics.totalSent += failed.entry.length;
      } catch (error) {
        // Put back in dead letter queue with incremented attempts
        this.deadLetterQueue.push({
          ...failed,
          error: error as Error,
          timestamp: Date.now(),
          attempts: failed.attempts + 1,
        });
      }
    }
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = undefined;
    }
    
    // Final flush
    this.flush().catch(error => {
      console.error('Final flush failed:', error);
    });
    
    // Log metrics on shutdown
    console.log('Analytics aggregator metrics:', {
      ...this.metrics,
      deadLetterQueueSize: this.deadLetterQueue.length,
    });
  }

  // Public method to access metrics
  getMetrics() {
    return {
      ...this.metrics,
      deadLetterQueueSize: this.deadLetterQueue.length,
      bufferSize: this.buffer.length,
    };
  }
}