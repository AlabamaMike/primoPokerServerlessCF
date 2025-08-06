/**
 * Rate Limiting Durable Object
 * 
 * Provides distributed rate limiting for API endpoints.
 * Uses sliding window algorithm for accurate rate limiting.
 */

export interface RateLimitRequest {
  key: string;
  limit: number;
  window: number; // milliseconds
  path?: string; // For metrics tracking
}

export interface RateLimitResponse {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

interface RateLimitRecord {
  timestamps: number[];
  window: number;
  limit: number;
}

export class RateLimitDurableObject {
  private state: DurableObjectState;
  private env: any;
  private records: Map<string, RateLimitRecord> = new Map();
  private metrics: Map<string, { hits: number; blocked: number }> = new Map();
  
  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle metrics endpoint
    if (url.pathname === '/metrics') {
      return this.getMetrics();
    }
    
    // Handle rate limit check
    try {
      const body: RateLimitRequest = await request.json();
      
      // Get or create record
      let record = this.records.get(body.key);
      if (!record) {
        record = {
          timestamps: [],
          window: body.window,
          limit: body.limit
        };
        this.records.set(body.key, record);
      }

      // Clean old timestamps
      const now = Date.now();
      const cutoff = now - record.window;
      record.timestamps = record.timestamps.filter(ts => ts > cutoff);

      // Check if allowed
      const allowed = record.timestamps.length < record.limit;
      if (allowed) {
        record.timestamps.push(now);
      }

      // Update metrics
      const metricsKey = body.path || 'unknown';
      const metric = this.metrics.get(metricsKey) || { hits: 0, blocked: 0 };
      metric.hits++;
      if (!allowed) {
        metric.blocked++;
      }
      this.metrics.set(metricsKey, metric);

      // Send metrics to KV if available
      if (this.env?.METRICS_NAMESPACE && body.path) {
        try {
          await this.env.METRICS_NAMESPACE.put(
            `rate_limit:${body.key}:${now}`,
            JSON.stringify({
              clientId: body.key,
              path: body.path,
              limited: !allowed,
              timestamp: now,
            }),
            { expirationTtl: 3600 } // 1 hour
          );
        } catch (error) {
          console.error('Failed to record rate limit metric:', error);
        }
      }

      // Calculate reset time
      const firstTimestamp = record.timestamps[0];
      const resetAt = firstTimestamp !== undefined
        ? firstTimestamp + record.window 
        : now + record.window;

      const response: RateLimitResponse = {
        allowed,
        remaining: Math.max(0, record.limit - record.timestamps.length),
        resetAt
      };

      // Persist state periodically
      if (Math.random() < 0.1) { // 10% chance
        await this.persistState();
      }

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      return new Response(JSON.stringify({
        allowed: true, // Fail open
        remaining: 0,
        resetAt: Date.now() + 60000,
        error: error instanceof Error ? error.message : 'Rate limit check failed'
      }), {
        status: 200, // Return 200 to fail open
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async alarm(): Promise<void> {
    // Clean up old records
    const now = Date.now();
    for (const [key, record] of this.records) {
      const cutoff = now - record.window;
      record.timestamps = record.timestamps.filter(ts => ts > cutoff);
      
      // Remove empty records
      if (record.timestamps.length === 0) {
        this.records.delete(key);
      }
    }

    await this.persistState();
    
    // Schedule next cleanup
    await this.state.storage.setAlarm(new Date(now + 3600000)); // 1 hour
  }

  private async persistState(): Promise<void> {
    // Convert Map to array for storage
    const recordsArray = Array.from(this.records.entries());
    await this.state.storage.put('records', recordsArray);
  }

  async initialize(): Promise<void> {
    // Load persisted state
    const recordsArray = await this.state.storage.get<[string, RateLimitRecord][]>('records');
    if (recordsArray) {
      this.records = new Map(recordsArray);
    }

    // Set up cleanup alarm if not already set
    const currentAlarm = await this.state.storage.getAlarm();
    if (!currentAlarm) {
      await this.state.storage.setAlarm(new Date(Date.now() + 3600000));
    }
  }

  private async getMetrics(): Promise<Response> {
    const metricsData = {
      timestamp: new Date().toISOString(),
      totalKeys: this.records.size,
      pathMetrics: Array.from(this.metrics.entries()).map(([path, data]) => ({
        path,
        totalHits: data.hits,
        blockedRequests: data.blocked,
        blockRate: data.hits > 0 ? data.blocked / data.hits : 0,
      })),
      activeClients: Array.from(this.records.entries()).map(([key, record]) => ({
        key,
        currentRequests: record.timestamps.length,
        limit: record.limit,
        window: record.window,
        utilizationRate: record.limit > 0 ? record.timestamps.length / record.limit : 0,
      })).filter(client => client.currentRequests > 0),
    };

    return new Response(JSON.stringify(metricsData), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}