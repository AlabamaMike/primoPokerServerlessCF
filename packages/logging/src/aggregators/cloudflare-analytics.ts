import { LogAggregator, LogEntry } from '../types';

export interface CloudflareAnalyticsConfig {
  dataset: string;
  accountId: string;
  apiToken: string;
  batchSize?: number;
  flushInterval?: number;
}

export class CloudflareAnalyticsAggregator implements LogAggregator {
  private readonly config: Required<CloudflareAnalyticsConfig>;
  private buffer: LogEntry[] = [];
  private flushTimer?: any;

  constructor(config: CloudflareAnalyticsConfig) {
    this.config = {
      batchSize: 100,
      flushInterval: 5000, // 5 seconds
      ...config,
    };

    this.startFlushTimer();
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
      // Transform entries to Cloudflare Analytics Engine format
      const analyticsEvents = batch.map(entry => ({
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
        throw new Error(`Analytics Engine API error: ${response.status}`);
      }
    } catch (error) {
      // Log aggregation should not fail the application
      console.error('Failed to send logs to Analytics Engine:', error);
      
      // Put failed entries back in buffer if there's room
      if (this.buffer.length + batch.length < this.config.batchSize * 2) {
        this.buffer.unshift(...batch);
      }
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        console.error('Periodic flush failed:', error);
      });
    }, this.config.flushInterval);
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    
    // Final flush
    this.flush().catch(error => {
      console.error('Final flush failed:', error);
    });
  }
}