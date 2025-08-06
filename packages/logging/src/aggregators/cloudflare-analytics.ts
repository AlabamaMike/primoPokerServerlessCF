import { LogAggregator, LogEntry } from '../types';

export interface CloudflareAnalyticsConfig {
  dataset: string;
  accountId: string;
  apiToken: string;
  batchSize?: number;
  flushInterval?: number;
  maxRetries?: number;
  retryDelay?: number;
  maxDeadLetterQueueSize?: number;
  onError?: (error: Error, entries: LogEntry[]) => void;
}

interface DeadLetterEntry {
  entries: LogEntry[];
  attempts: number;
  nextRetryTime: number;
}

interface AggregatorMetrics {
  totalSent: number;
  totalFailed: number;
  totalRetried: number;
  totalDropped: number;
  deadLetterQueueSize: number;
  bufferSize: number;
}

// Type for processed configuration
type ProcessedCloudflareAnalyticsConfig = Required<Omit<CloudflareAnalyticsConfig, 'onError'>> & {
  onError?: CloudflareAnalyticsConfig['onError'];
};

export class CloudflareAnalyticsAggregator implements LogAggregator {
  private readonly config: ProcessedCloudflareAnalyticsConfig;
  private buffer: LogEntry[] = [];
  private flushTimer?: ReturnType<typeof setInterval>;
  private retryTimer?: ReturnType<typeof setInterval>;
  private deadLetterQueue: DeadLetterEntry[] = [];
  private metrics: AggregatorMetrics = {
    totalSent: 0,
    totalFailed: 0,
    totalRetried: 0,
    totalDropped: 0,
    deadLetterQueueSize: 0,
    bufferSize: 0,
  };

  constructor(config: CloudflareAnalyticsConfig) {
    this.config = {
      batchSize: 100,
      flushInterval: 5000, // 5 seconds
      maxRetries: 3,
      retryDelay: 1000, // 1 second
      maxDeadLetterQueueSize: 1000,
      ...config,
    };

    this.startFlushTimer();
    this.startRetryTimer();
  }

  async send(entries: LogEntry[]): Promise<void> {
    this.buffer.push(...entries);
    this.metrics.bufferSize = this.buffer.length;
    
    if (this.buffer.length >= this.config.batchSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0, this.config.batchSize);
    
    try {
      await this.sendBatch(batch);
      
      // Update metrics on success
      this.metrics.totalSent += batch.length;
    } catch (error) {
      // Update metrics on failure
      this.metrics.totalFailed += batch.length;
      
      // Log aggregation should not fail the application
      console.error('Failed to send logs to Analytics Engine:', error);
      
      // Call error callback if configured
      if (this.config.onError) {
        // Ensure error is an Error object
        const errorObj = error instanceof Error ? error : new Error(String(error));
        this.config.onError(errorObj, batch);
      }
      
      // Add to dead letter queue if space available
      if (this.deadLetterQueue.length < this.config.maxDeadLetterQueueSize) {
        this.deadLetterQueue.push({
          entries: batch,
          attempts: 0,
          nextRetryTime: Date.now() + this.config.retryDelay,
        });
        this.metrics.deadLetterQueueSize = this.deadLetterQueue.length;
      } else {
        // Track dropped entries
        this.metrics.totalDropped += batch.length;
        console.warn(`Dead letter queue full. Dropping ${batch.length} log entries.`);
      }
    }
    
    this.metrics.bufferSize = this.buffer.length;
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
    }, this.config.retryDelay);
  }

  private async processDeadLetterQueue(): Promise<void> {
    const now = Date.now();
    const entriesToRetry: DeadLetterEntry[] = [];

    // Find entries ready for retry
    this.deadLetterQueue = this.deadLetterQueue.filter(entry => {
      if (entry.nextRetryTime <= now) {
        entriesToRetry.push(entry);
        return false;
      }
      return true;
    });

    // Process retries
    for (const entry of entriesToRetry) {
      entry.attempts++;
      
      try {
        // Attempt to send the entries
        await this.sendBatch(entry.entries);
        
        // Success - update metrics
        this.metrics.totalRetried += entry.entries.length;
      } catch (error) {
        // Failed retry
        if (entry.attempts < this.config.maxRetries) {
          // Calculate exponential backoff with maximum limit
          const MAX_BACKOFF_DELAY_MS = 300000; // 5 minutes
          const calculatedDelay = this.config.retryDelay * Math.pow(2, entry.attempts);
          const backoffDelay = Math.min(calculatedDelay, MAX_BACKOFF_DELAY_MS);
          entry.nextRetryTime = Date.now() + backoffDelay;
          
          // Put back in queue if space available
          if (this.deadLetterQueue.length < this.config.maxDeadLetterQueueSize) {
            this.deadLetterQueue.push(entry);
          } else {
            this.metrics.totalDropped += entry.entries.length;
            console.warn(`Dead letter queue full during retry. Dropping ${entry.entries.length} log entries.`);
          }
        } else {
          // Max retries exceeded
          this.metrics.totalDropped += entry.entries.length;
          console.warn(`Max retries exceeded. Dropping ${entry.entries.length} log entries.`);
        }
      }
    }
    
    this.metrics.deadLetterQueueSize = this.deadLetterQueue.length;
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
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Analytics Engine API error: ${response.status} - ${errorText}`);
    }
  }

  getMetrics(): AggregatorMetrics {
    return { ...this.metrics };
  }

  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = undefined;
    }
    
    // Final flush - await to ensure completion
    try {
      await this.flush();
    } catch (error) {
      console.error('Final flush failed:', error);
    }
    
    // Log final metrics
    console.log('CloudflareAnalyticsAggregator final metrics:', this.metrics);
  }
}