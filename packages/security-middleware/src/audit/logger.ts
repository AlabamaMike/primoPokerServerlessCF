import { Logger } from '@primo-poker/logging';

export interface AuditEvent {
  id: string;
  timestamp: number;
  eventType: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  resource: string;
  action: string;
  result: 'success' | 'failure' | 'error';
  metadata?: Record<string, unknown>;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

export interface AuditLoggerConfig {
  storage: {
    kv: KVNamespace; // Short-term storage (7 days)
    r2?: R2Bucket; // Long-term storage
  };
  logger: Logger;
  retention: {
    kv: number; // Days to keep in KV
    r2: number; // Days to keep in R2
  };
  batchSize: number;
  flushInterval: number; // milliseconds
}

export class AuditLogger {
  private config: AuditLoggerConfig;
  private batch: AuditEvent[] = [];
  private flushTimer?: number;

  constructor(config: Partial<AuditLoggerConfig> & { storage: AuditLoggerConfig['storage']; logger: Logger }) {
    this.config = {
      retention: {
        kv: 7,
        r2: 90,
      },
      batchSize: 100,
      flushInterval: 5000,
      ...config,
    };

    // Start periodic flush
    this.scheduleFlush();
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async log(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    const auditEvent: AuditEvent = {
      ...event,
      id: this.generateId(),
      timestamp: Date.now(),
    };

    this.batch.push(auditEvent);

    // Log critical events immediately
    if (event.severity === 'critical') {
      await this.flush();
    } else if (this.batch.length >= this.config.batchSize) {
      await this.flush();
    }

    // Also log to standard logger for real-time monitoring
    this.config.logger.log({
      level: event.severity === 'critical' ? 'error' : 'info',
      message: `Audit: ${event.action} on ${event.resource}`,
      data: auditEvent,
    });
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    this.flushTimer = setTimeout(async () => {
      if (this.batch.length > 0) {
        await this.flush();
      }
      this.scheduleFlush();
    }, this.config.flushInterval) as unknown as number;
  }

  async flush(): Promise<void> {
    if (this.batch.length === 0) return;

    const events = [...this.batch];
    this.batch = [];

    try {
      // Group events by hour for efficient storage
      const eventsByHour = new Map<string, AuditEvent[]>();
      
      for (const event of events) {
        const hourKey = new Date(event.timestamp).toISOString().slice(0, 13);
        if (!eventsByHour.has(hourKey)) {
          eventsByHour.set(hourKey, []);
        }
        eventsByHour.get(hourKey)!.push(event);
      }

      // Store in KV with TTL
      const kvPromises: Promise<void>[] = [];
      for (const [hour, hourEvents] of eventsByHour) {
        const key = `audit:${hour}:${Date.now()}`;
        kvPromises.push(
          this.config.storage.kv.put(
            key,
            JSON.stringify(hourEvents),
            { expirationTtl: this.config.retention.kv * 24 * 60 * 60 }
          )
        );
      }

      // Store in R2 for long-term retention
      if (this.config.storage.r2) {
        const date = new Date();
        const path = `audit-logs/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getTime()}.json`;
        
        await this.config.storage.r2.put(
          path,
          JSON.stringify(events),
          {
            customMetadata: {
              count: String(events.length),
              startTime: String(events[0].timestamp),
              endTime: String(events[events.length - 1].timestamp),
            },
          }
        );
      }

      await Promise.all(kvPromises);
    } catch (error) {
      this.config.logger.error('Failed to flush audit logs', { error });
      // Re-add events to batch for retry
      this.batch = [...events, ...this.batch];
    }
  }

  async query(options: {
    startTime?: number;
    endTime?: number;
    userId?: string;
    eventType?: string;
    resource?: string;
    severity?: AuditEvent['severity'];
    limit?: number;
  }): Promise<AuditEvent[]> {
    const results: AuditEvent[] = [];
    const { startTime = Date.now() - 24 * 60 * 60 * 1000, endTime = Date.now(), limit = 1000 } = options;

    // Query KV storage
    const startHour = new Date(startTime).toISOString().slice(0, 13);
    const endHour = new Date(endTime).toISOString().slice(0, 13);

    const { keys } = await this.config.storage.kv.list({
      prefix: 'audit:',
      limit: 1000,
    });

    for (const key of keys) {
      const hourKey = key.name.split(':')[1];
      if (hourKey >= startHour && hourKey <= endHour) {
        const data = await this.config.storage.kv.get(key.name);
        if (data) {
          const events: AuditEvent[] = JSON.parse(data);
          for (const event of events) {
            if (this.matchesFilters(event, options) && results.length < limit) {
              results.push(event);
            }
          }
        }
      }
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp - a.timestamp);

    return results.slice(0, limit);
  }

  private matchesFilters(event: AuditEvent, filters: {
    startTime?: number;
    endTime?: number;
    userId?: string;
    eventType?: string;
    resource?: string;
    severity?: AuditEvent['severity'];
    limit?: number;
  }): boolean {
    if (filters.userId && event.userId !== filters.userId) return false;
    if (filters.eventType && event.eventType !== filters.eventType) return false;
    if (filters.resource && event.resource !== filters.resource) return false;
    if (filters.severity && event.severity !== filters.severity) return false;
    if (filters.startTime && event.timestamp < filters.startTime) return false;
    if (filters.endTime && event.timestamp > filters.endTime) return false;
    return true;
  }

  // Helper methods for common audit events
  async logAuth(userId: string | undefined, action: 'login' | 'logout' | 'register' | 'failed_login', request: Request, metadata?: Record<string, unknown>): Promise<void> {
    await this.log({
      eventType: 'authentication',
      userId,
      ipAddress: request.headers.get('CF-Connecting-IP') || undefined,
      userAgent: request.headers.get('User-Agent') || undefined,
      resource: '/auth',
      action,
      result: action === 'failed_login' ? 'failure' : 'success',
      severity: action === 'failed_login' ? 'warning' : 'info',
      metadata,
    });
  }

  async logWalletOperation(userId: string, action: string, amount: number, result: 'success' | 'failure', metadata?: Record<string, unknown>): Promise<void> {
    await this.log({
      eventType: 'wallet',
      userId,
      resource: '/wallet',
      action,
      result,
      severity: result === 'failure' ? 'error' : 'info',
      metadata: {
        amount,
        ...metadata,
      },
    });
  }

  async logAdminAction(adminId: string, action: string, targetResource: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.log({
      eventType: 'admin',
      userId: adminId,
      resource: targetResource,
      action,
      result: 'success',
      severity: 'warning', // All admin actions are important
      metadata,
    });
  }

  async generateComplianceReport(startDate: Date, endDate: Date): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsBySeverity: Record<string, number>;
    failureRate: number;
    topUsers: Array<{ userId: string; count: number }>;
  }> {
    const events = await this.query({
      startTime: startDate.getTime(),
      endTime: endDate.getTime(),
      limit: 10000,
    });

    const eventsByType: Record<string, number> = {};
    const eventsBySeverity: Record<string, number> = {};
    const userCounts: Record<string, number> = {};
    let failures = 0;

    for (const event of events) {
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
      eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
      
      if (event.userId) {
        userCounts[event.userId] = (userCounts[event.userId] || 0) + 1;
      }
      
      if (event.result === 'failure') {
        failures++;
      }
    }

    const topUsers = Object.entries(userCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([userId, count]) => ({ userId, count }));

    return {
      totalEvents: events.length,
      eventsByType,
      eventsBySeverity,
      failureRate: events.length > 0 ? failures / events.length : 0,
      topUsers,
    };
  }
}