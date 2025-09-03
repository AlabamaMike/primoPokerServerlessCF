import { Context } from '@cloudflare/workers-types';

/**
 * Security Audit Logger
 * Provides comprehensive logging for security-related events with retention policies
 */

export enum AuditEventType {
  // Authentication events
  LOGIN_SUCCESS = 'auth.login.success',
  LOGIN_FAILURE = 'auth.login.failure',
  LOGOUT = 'auth.logout',
  REGISTER = 'auth.register',
  PASSWORD_CHANGE = 'auth.password.change',
  PASSWORD_RESET = 'auth.password.reset',
  
  // Authorization events
  ACCESS_GRANTED = 'authz.access.granted',
  ACCESS_DENIED = 'authz.access.denied',
  PERMISSION_CHANGE = 'authz.permission.change',
  
  // Financial events
  DEPOSIT = 'finance.deposit',
  WITHDRAWAL = 'finance.withdrawal',
  TRANSFER = 'finance.transfer',
  BALANCE_ADJUSTMENT = 'finance.balance.adjustment',
  
  // Game events
  TABLE_CREATE = 'game.table.create',
  TABLE_JOIN = 'game.table.join',
  TABLE_LEAVE = 'game.table.leave',
  BET_PLACED = 'game.bet.placed',
  HAND_COMPLETED = 'game.hand.completed',
  
  // Security events
  RATE_LIMIT_EXCEEDED = 'security.rate_limit.exceeded',
  SUSPICIOUS_ACTIVITY = 'security.suspicious_activity',
  CSRF_VIOLATION = 'security.csrf.violation',
  INVALID_SIGNATURE = 'security.signature.invalid',
  
  // Administrative events
  USER_BANNED = 'admin.user.banned',
  USER_UNBANNED = 'admin.user.unbanned',
  SETTINGS_CHANGED = 'admin.settings.changed',
  DATA_EXPORT = 'admin.data.export',
  DATA_DELETE = 'admin.data.delete'
}

export enum AuditSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export interface AuditEvent {
  id: string;
  timestamp: number;
  type: AuditEventType;
  severity: AuditSeverity;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata: Record<string, any>;
  requestId?: string;
  sessionId?: string;
}

export interface AuditLoggerConfig {
  kvNamespace: KVNamespace;
  r2Bucket?: R2Bucket; // For long-term storage
  retentionDays: number; // KV retention
  archiveRetentionDays?: number; // R2 retention
  batchSize?: number; // Events to batch before flushing
  flushIntervalMs?: number; // Max time before flush
}

export class SecurityAuditLogger {
  private config: Required<AuditLoggerConfig>;
  private eventBatch: AuditEvent[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor(config: AuditLoggerConfig) {
    this.config = {
      archiveRetentionDays: 365, // 1 year default
      batchSize: 100,
      flushIntervalMs: 5000, // 5 seconds
      ...config
    };

    // Start flush timer
    this.scheduleFlush();
  }

  async log(
    type: AuditEventType,
    severity: AuditSeverity,
    metadata: Record<string, any>,
    context?: {
      userId?: string;
      request?: Request;
      requestId?: string;
      sessionId?: string;
    }
  ): Promise<void> {
    const event: AuditEvent = {
      id: this.generateEventId(),
      timestamp: Date.now(),
      type,
      severity,
      metadata,
      userId: context?.userId,
      requestId: context?.requestId,
      sessionId: context?.sessionId
    };

    // Extract request info if provided
    if (context?.request) {
      event.ipAddress = this.extractIpAddress(context.request);
      event.userAgent = context.request.headers.get('User-Agent') || undefined;
    }

    // Add to batch
    this.eventBatch.push(event);

    // Check if batch should be flushed
    if (this.eventBatch.length >= this.config.batchSize) {
      await this.flush();
    }

    // Log critical events immediately
    if (severity === AuditSeverity.CRITICAL) {
      await this.flush();
    }
  }

  /**
   * Helper methods for common audit scenarios
   */
  async logLoginAttempt(
    success: boolean,
    email: string,
    ipAddress?: string,
    reason?: string
  ): Promise<void> {
    await this.log(
      success ? AuditEventType.LOGIN_SUCCESS : AuditEventType.LOGIN_FAILURE,
      success ? AuditSeverity.INFO : AuditSeverity.WARNING,
      {
        email,
        reason,
        ipAddress
      }
    );
  }

  async logFinancialTransaction(
    type: 'deposit' | 'withdrawal' | 'transfer',
    userId: string,
    amount: number,
    metadata: Record<string, any>
  ): Promise<void> {
    const eventTypeMap = {
      deposit: AuditEventType.DEPOSIT,
      withdrawal: AuditEventType.WITHDRAWAL,
      transfer: AuditEventType.TRANSFER
    };

    await this.log(
      eventTypeMap[type],
      AuditSeverity.INFO,
      {
        amount,
        ...metadata
      },
      { userId }
    );
  }

  async logSecurityViolation(
    type: 'rate_limit' | 'csrf' | 'signature' | 'suspicious',
    details: Record<string, any>,
    request?: Request
  ): Promise<void> {
    const eventTypeMap = {
      rate_limit: AuditEventType.RATE_LIMIT_EXCEEDED,
      csrf: AuditEventType.CSRF_VIOLATION,
      signature: AuditEventType.INVALID_SIGNATURE,
      suspicious: AuditEventType.SUSPICIOUS_ACTIVITY
    };

    await this.log(
      eventTypeMap[type],
      AuditSeverity.WARNING,
      details,
      { request }
    );
  }

  /**
   * Query audit logs
   */
  async query(options: {
    startTime?: number;
    endTime?: number;
    type?: AuditEventType;
    severity?: AuditSeverity;
    userId?: string;
    limit?: number;
  }): Promise<AuditEvent[]> {
    // Flush any pending events first
    await this.flush();

    const {
      startTime = Date.now() - 24 * 60 * 60 * 1000, // Default: last 24 hours
      endTime = Date.now(),
      type,
      severity,
      userId,
      limit = 100
    } = options;

    // Query from KV (recent events)
    const events: AuditEvent[] = [];
    const prefix = 'audit:';
    
    // This is a simplified implementation. In production, you'd want
    // to use a more sophisticated indexing strategy
    const list = await this.config.kvNamespace.list({ prefix, limit: 1000 });
    
    for (const key of list.keys) {
      const event = await this.config.kvNamespace.get(key.name, 'json') as AuditEvent | null;
      if (!event) continue;

      // Apply filters
      if (event.timestamp < startTime || event.timestamp > endTime) continue;
      if (type && event.type !== type) continue;
      if (severity && event.severity !== severity) continue;
      if (userId && event.userId !== userId) continue;

      events.push(event);
      
      if (events.length >= limit) break;
    }

    // Sort by timestamp descending
    return events.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    startDate: Date,
    endDate: Date
  ): Promise<ComplianceReport> {
    const events = await this.query({
      startTime: startDate.getTime(),
      endTime: endDate.getTime(),
      limit: 10000 // Higher limit for reports
    });

    const report: ComplianceReport = {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      summary: {
        totalEvents: events.length,
        byType: {},
        bySeverity: {},
        securityViolations: 0,
        financialTransactions: 0
      },
      details: {
        loginAttempts: {
          successful: 0,
          failed: 0
        },
        financialActivity: {
          deposits: { count: 0, total: 0 },
          withdrawals: { count: 0, total: 0 },
          transfers: { count: 0, total: 0 }
        },
        securityEvents: []
      }
    };

    // Analyze events
    for (const event of events) {
      // Count by type
      report.summary.byType[event.type] = (report.summary.byType[event.type] || 0) + 1;
      
      // Count by severity
      report.summary.bySeverity[event.severity] = (report.summary.bySeverity[event.severity] || 0) + 1;

      // Specific analysis
      switch (event.type) {
        case AuditEventType.LOGIN_SUCCESS:
          report.details.loginAttempts.successful++;
          break;
        case AuditEventType.LOGIN_FAILURE:
          report.details.loginAttempts.failed++;
          break;
        case AuditEventType.DEPOSIT:
          report.details.financialActivity.deposits.count++;
          report.details.financialActivity.deposits.total += event.metadata.amount || 0;
          report.summary.financialTransactions++;
          break;
        case AuditEventType.WITHDRAWAL:
          report.details.financialActivity.withdrawals.count++;
          report.details.financialActivity.withdrawals.total += event.metadata.amount || 0;
          report.summary.financialTransactions++;
          break;
        case AuditEventType.TRANSFER:
          report.details.financialActivity.transfers.count++;
          report.details.financialActivity.transfers.total += event.metadata.amount || 0;
          report.summary.financialTransactions++;
          break;
        case AuditEventType.RATE_LIMIT_EXCEEDED:
        case AuditEventType.CSRF_VIOLATION:
        case AuditEventType.INVALID_SIGNATURE:
        case AuditEventType.SUSPICIOUS_ACTIVITY:
          report.summary.securityViolations++;
          report.details.securityEvents.push({
            type: event.type,
            timestamp: event.timestamp,
            metadata: event.metadata
          });
          break;
      }
    }

    return report;
  }

  /**
   * Private helper methods
   */
  private async flush(): Promise<void> {
    if (this.eventBatch.length === 0) return;

    const events = [...this.eventBatch];
    this.eventBatch = [];

    // Store in KV with TTL
    const ttl = this.config.retentionDays * 24 * 60 * 60; // Convert days to seconds
    
    await Promise.all(
      events.map(event =>
        this.config.kvNamespace.put(
          `audit:${event.timestamp}:${event.id}`,
          JSON.stringify(event),
          { expirationTtl: ttl }
        )
      )
    );

    // Archive to R2 if configured
    if (this.config.r2Bucket) {
      const date = new Date();
      const key = `audit-logs/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${Date.now()}.json`;
      
      await this.config.r2Bucket.put(
        key,
        JSON.stringify(events),
        {
          httpMetadata: {
            contentType: 'application/json'
          }
        }
      );
    }

    // Reschedule timer
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    this.flushTimer = setTimeout(() => {
      this.flush().catch(console.error);
    }, this.config.flushIntervalMs);
  }

  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractIpAddress(request: Request): string {
    return request.headers.get('CF-Connecting-IP') ||
           request.headers.get('X-Forwarded-For')?.split(',')[0].trim() ||
           'unknown';
  }
}

interface ComplianceReport {
  period: {
    start: string;
    end: string;
  };
  summary: {
    totalEvents: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    securityViolations: number;
    financialTransactions: number;
  };
  details: {
    loginAttempts: {
      successful: number;
      failed: number;
    };
    financialActivity: {
      deposits: { count: number; total: number };
      withdrawals: { count: number; total: number };
      transfers: { count: number; total: number };
    };
    securityEvents: Array<{
      type: string;
      timestamp: number;
      metadata: Record<string, any>;
    }>;
  };
}