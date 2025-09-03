import { Context } from '@cloudflare/workers-types';
import { SecurityAuditLogger, AuditEventType, AuditSeverity } from '../audit/logger';
import { TokenBucketRateLimiter } from '../middleware/rate-limiter';
import { PerformanceCollector, PerformanceSummaryAggregator } from '../middleware/performance-wrapper';

/**
 * Security Monitoring Dashboard
 * Real-time security metrics and threat detection
 */

export interface SecurityMetrics {
  timestamp: number;
  authentication: {
    successfulLogins: number;
    failedLogins: number;
    registrations: number;
    passwordResets: number;
    activeSessions: number;
  };
  rateLimiting: {
    totalRequests: number;
    blockedRequests: number;
    topOffenders: Array<{ identifier: string; count: number }>;
  };
  threats: {
    suspiciousActivities: number;
    csrfViolations: number;
    invalidSignatures: number;
    bruteForceAttempts: number;
  };
  financial: {
    deposits: { count: number; total: number };
    withdrawals: { count: number; total: number };
    transfers: { count: number; total: number };
    suspiciousTransactions: number;
  };
  system: {
    errorRate: number;
    averageResponseTime: number;
    activeConnections: number;
  };
}

export interface ThreatAlert {
  id: string;
  timestamp: number;
  type: ThreatType;
  severity: ThreatSeverity;
  description: string;
  metadata: Record<string, any>;
  status: 'active' | 'resolved' | 'investigating';
}

export enum ThreatType {
  BRUTE_FORCE = 'brute_force',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  RATE_LIMIT_ABUSE = 'rate_limit_abuse',
  FINANCIAL_FRAUD = 'financial_fraud',
  ACCOUNT_TAKEOVER = 'account_takeover',
  DATA_EXFILTRATION = 'data_exfiltration'
}

export enum ThreatSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface DashboardConfig {
  kvNamespace: KVNamespace;
  auditLogger: SecurityAuditLogger;
  metricsInterval?: number; // Metrics collection interval in seconds
  alertThresholds?: {
    failedLoginAttempts?: number;
    rateLimitViolations?: number;
    suspiciousTransactionAmount?: number;
  };
}

export class SecurityMonitoringDashboard {
  private config: Required<DashboardConfig>;
  private metricsCache: Map<string, SecurityMetrics> = new Map();
  private activeAlerts: Map<string, ThreatAlert> = new Map();

  constructor(config: DashboardConfig) {
    this.config = {
      metricsInterval: 60, // 1 minute default
      alertThresholds: {
        failedLoginAttempts: 5,
        rateLimitViolations: 10,
        suspiciousTransactionAmount: 10000,
        ...config.alertThresholds
      },
      ...config
    };
  }

  /**
   * Collect current security metrics
   */
  async collectMetrics(): Promise<SecurityMetrics> {
    const now = Date.now();
    const metricsKey = `metrics:${Math.floor(now / (this.config.metricsInterval * 1000))}`;

    // Check cache
    const cached = this.metricsCache.get(metricsKey);
    if (cached) return cached;

    // Query recent audit events
    const recentEvents = await this.config.auditLogger.query({
      startTime: now - (this.config.metricsInterval * 1000),
      endTime: now,
      limit: 1000
    });

    // Initialize metrics
    const metrics: SecurityMetrics = {
      timestamp: now,
      authentication: {
        successfulLogins: 0,
        failedLogins: 0,
        registrations: 0,
        passwordResets: 0,
        activeSessions: 0
      },
      rateLimiting: {
        totalRequests: 0,
        blockedRequests: 0,
        topOffenders: []
      },
      threats: {
        suspiciousActivities: 0,
        csrfViolations: 0,
        invalidSignatures: 0,
        bruteForceAttempts: 0
      },
      financial: {
        deposits: { count: 0, total: 0 },
        withdrawals: { count: 0, total: 0 },
        transfers: { count: 0, total: 0 },
        suspiciousTransactions: 0
      },
      system: {
        errorRate: 0,
        averageResponseTime: 0,
        activeConnections: 0
      }
    };

    // Analyze events
    const rateLimitOffenders = new Map<string, number>();
    
    for (const event of recentEvents) {
      switch (event.type) {
        case AuditEventType.LOGIN_SUCCESS:
          metrics.authentication.successfulLogins++;
          break;
        case AuditEventType.LOGIN_FAILURE:
          metrics.authentication.failedLogins++;
          break;
        case AuditEventType.REGISTER:
          metrics.authentication.registrations++;
          break;
        case AuditEventType.PASSWORD_RESET:
          metrics.authentication.passwordResets++;
          break;
        case AuditEventType.RATE_LIMIT_EXCEEDED:
          metrics.rateLimiting.blockedRequests++;
          const offender = event.metadata.identifier || 'unknown';
          rateLimitOffenders.set(offender, (rateLimitOffenders.get(offender) || 0) + 1);
          break;
        case AuditEventType.SUSPICIOUS_ACTIVITY:
          metrics.threats.suspiciousActivities++;
          break;
        case AuditEventType.CSRF_VIOLATION:
          metrics.threats.csrfViolations++;
          break;
        case AuditEventType.INVALID_SIGNATURE:
          metrics.threats.invalidSignatures++;
          break;
        case AuditEventType.DEPOSIT:
          metrics.financial.deposits.count++;
          metrics.financial.deposits.total += event.metadata.amount || 0;
          break;
        case AuditEventType.WITHDRAWAL:
          metrics.financial.withdrawals.count++;
          metrics.financial.withdrawals.total += event.metadata.amount || 0;
          break;
        case AuditEventType.TRANSFER:
          metrics.financial.transfers.count++;
          metrics.financial.transfers.total += event.metadata.amount || 0;
          break;
      }
    }

    // Top rate limit offenders
    metrics.rateLimiting.topOffenders = Array.from(rateLimitOffenders.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([identifier, count]) => ({ identifier, count }));

    // Detect threats
    await this.detectThreats(metrics, recentEvents);

    // Cache metrics
    this.metricsCache.set(metricsKey, metrics);

    // Clean old cache entries
    if (this.metricsCache.size > 100) {
      const oldestKey = Array.from(this.metricsCache.keys())[0];
      this.metricsCache.delete(oldestKey);
    }

    return metrics;
  }

  /**
   * Get active threat alerts
   */
  async getActiveAlerts(): Promise<ThreatAlert[]> {
    // Load alerts from KV if not in memory
    const alertsList = await this.config.kvNamespace.list({
      prefix: 'alert:active:',
      limit: 100
    });

    const alerts: ThreatAlert[] = [];
    
    for (const key of alertsList.keys) {
      const alert = await this.config.kvNamespace.get(key.name, 'json') as ThreatAlert | null;
      if (alert && alert.status === 'active') {
        alerts.push(alert);
        this.activeAlerts.set(alert.id, alert);
      }
    }

    return Array.from(this.activeAlerts.values())
      .filter(alert => alert.status === 'active')
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Create dashboard HTML response
   */
  async renderDashboard(): Promise<Response> {
    const metrics = await this.collectMetrics();
    const alerts = await this.getActiveAlerts();

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Security Monitoring Dashboard</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
            color: #333;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        h1 {
            color: #2c3e50;
            margin-bottom: 30px;
        }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .metric-card {
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .metric-card h3 {
            margin: 0 0 15px 0;
            color: #34495e;
            font-size: 16px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .metric-value {
            font-size: 32px;
            font-weight: bold;
            margin: 10px 0;
        }
        .metric-label {
            color: #7f8c8d;
            font-size: 14px;
        }
        .alert {
            background: white;
            border-left: 4px solid #e74c3c;
            border-radius: 4px;
            padding: 15px;
            margin-bottom: 10px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .alert.critical {
            border-color: #c0392b;
            background: #ffe6e6;
        }
        .alert.high {
            border-color: #e74c3c;
        }
        .alert.medium {
            border-color: #f39c12;
        }
        .alert.low {
            border-color: #3498db;
        }
        .alert-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
        }
        .alert-type {
            font-weight: bold;
            text-transform: uppercase;
            font-size: 12px;
        }
        .alert-time {
            color: #7f8c8d;
            font-size: 12px;
        }
        .refresh-info {
            text-align: center;
            color: #7f8c8d;
            margin-top: 30px;
            font-size: 14px;
        }
        .metric-small {
            display: flex;
            justify-content: space-between;
            margin: 5px 0;
            font-size: 14px;
        }
        .metric-small-value {
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🛡️ Security Monitoring Dashboard</h1>
        
        <div class="metrics-grid">
            <div class="metric-card">
                <h3>Authentication</h3>
                <div class="metric-value">${metrics.authentication.successfulLogins}</div>
                <div class="metric-label">Successful Logins</div>
                <div class="metric-small">
                    <span>Failed Attempts</span>
                    <span class="metric-small-value">${metrics.authentication.failedLogins}</span>
                </div>
                <div class="metric-small">
                    <span>New Registrations</span>
                    <span class="metric-small-value">${metrics.authentication.registrations}</span>
                </div>
            </div>

            <div class="metric-card">
                <h3>Rate Limiting</h3>
                <div class="metric-value">${metrics.rateLimiting.blockedRequests}</div>
                <div class="metric-label">Blocked Requests</div>
                ${metrics.rateLimiting.topOffenders.length > 0 ? `
                    <div style="margin-top: 10px; font-size: 12px;">
                        <strong>Top Offenders:</strong>
                        ${metrics.rateLimiting.topOffenders.slice(0, 3).map(o => 
                            `<div>${o.identifier}: ${o.count}</div>`
                        ).join('')}
                    </div>
                ` : ''}
            </div>

            <div class="metric-card">
                <h3>Security Threats</h3>
                <div class="metric-value">${
                    metrics.threats.suspiciousActivities + 
                    metrics.threats.csrfViolations + 
                    metrics.threats.invalidSignatures
                }</div>
                <div class="metric-label">Total Threats Detected</div>
                <div class="metric-small">
                    <span>Suspicious Activities</span>
                    <span class="metric-small-value">${metrics.threats.suspiciousActivities}</span>
                </div>
                <div class="metric-small">
                    <span>CSRF Violations</span>
                    <span class="metric-small-value">${metrics.threats.csrfViolations}</span>
                </div>
            </div>

            <div class="metric-card">
                <h3>Financial Activity</h3>
                <div class="metric-value">$${(
                    metrics.financial.deposits.total + 
                    metrics.financial.withdrawals.total + 
                    metrics.financial.transfers.total
                ).toFixed(2)}</div>
                <div class="metric-label">Total Transaction Volume</div>
                <div class="metric-small">
                    <span>Deposits</span>
                    <span class="metric-small-value">${metrics.financial.deposits.count} ($${metrics.financial.deposits.total.toFixed(2)})</span>
                </div>
                <div class="metric-small">
                    <span>Withdrawals</span>
                    <span class="metric-small-value">${metrics.financial.withdrawals.count} ($${metrics.financial.withdrawals.total.toFixed(2)})</span>
                </div>
            </div>
        </div>

        <h2>🚨 Active Security Alerts</h2>
        ${alerts.length === 0 ? 
            '<p style="color: #27ae60;">✅ No active security alerts</p>' :
            alerts.map(alert => `
                <div class="alert ${alert.severity}">
                    <div class="alert-header">
                        <span class="alert-type">${alert.type.replace(/_/g, ' ')}</span>
                        <span class="alert-time">${new Date(alert.timestamp).toLocaleString()}</span>
                    </div>
                    <div>${alert.description}</div>
                </div>
            `).join('')
        }

        <div class="refresh-info">
            Dashboard updates every ${this.config.metricsInterval} seconds
            <br>
            Last updated: ${new Date().toLocaleString()}
        </div>
    </div>

    <script>
        // Auto-refresh dashboard
        setTimeout(() => location.reload(), ${this.config.metricsInterval * 1000});
        
        // WebSocket connection for real-time updates (if implemented)
        // const ws = new WebSocket('wss://your-domain/security-ws');
        // ws.onmessage = (event) => { ... };
    </script>
</body>
</html>
    `;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  }

  /**
   * Create API endpoint for metrics
   */
  async getMetricsJson(): Promise<Response> {
    const metrics = await this.collectMetrics();
    const alerts = await this.getActiveAlerts();

    return new Response(JSON.stringify({
      metrics,
      alerts,
      timestamp: Date.now()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  }

  /**
   * Get authentication-specific metrics
   */
  async getAuthenticationMetrics(): Promise<Response> {
    const metrics = await this.collectMetrics();
    
    return new Response(JSON.stringify({
      metrics: metrics.authentication,
      timestamp: Date.now()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  }

  /**
   * Get threat-specific metrics
   */
  async getThreatMetrics(): Promise<Response> {
    const metrics = await this.collectMetrics();
    const alerts = await this.getActiveAlerts();
    
    return new Response(JSON.stringify({
      metrics: metrics.threats,
      activeAlerts: alerts.length,
      alertsByType: this.groupAlertsByType(alerts),
      timestamp: Date.now()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  }

  /**
   * Get rate limiting metrics
   */
  async getRateLimitMetrics(): Promise<Response> {
    const metrics = await this.collectMetrics();
    
    return new Response(JSON.stringify({
      metrics: metrics.rateLimiting,
      timestamp: Date.now()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  }

  /**
   * Get financial transaction metrics
   */
  async getFinancialMetrics(): Promise<Response> {
    const metrics = await this.collectMetrics();
    
    return new Response(JSON.stringify({
      metrics: metrics.financial,
      timestamp: Date.now()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  }

  /**
   * Get performance metrics from collector
   */
  async getPerformanceMetrics(collector: PerformanceCollector): Promise<Response> {
    const aggregator = new PerformanceSummaryAggregator(collector);
    const summary = await aggregator.getPerformanceSummary();
    
    return new Response(JSON.stringify({
      performance: summary,
      timestamp: Date.now()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  }

  /**
   * Get all alerts as JSON
   */
  async getAlertsJson(): Promise<Response> {
    const alertsList = await this.config.kvNamespace.list({
      prefix: 'alert:',
      limit: 1000
    });

    const alerts: ThreatAlert[] = [];
    
    for (const key of alertsList.keys) {
      const alert = await this.config.kvNamespace.get(key.name, 'json') as ThreatAlert | null;
      if (alert) {
        alerts.push(alert);
      }
    }

    return new Response(JSON.stringify({
      alerts: alerts.sort((a, b) => b.timestamp - a.timestamp),
      total: alerts.length,
      active: alerts.filter(a => a.status === 'active').length,
      timestamp: Date.now()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  }

  /**
   * Get active alerts as JSON
   */
  async getActiveAlertsJson(): Promise<Response> {
    const alerts = await this.getActiveAlerts();
    
    return new Response(JSON.stringify({
      alerts,
      total: alerts.length,
      byType: this.groupAlertsByType(alerts),
      timestamp: Date.now()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(request: Request): Promise<Response> {
    try {
      const body = await request.json() as { alertId: string; resolution?: string };
      
      if (!body.alertId) {
        return new Response('Alert ID required', { status: 400 });
      }

      const alertKey = `alert:active:${body.alertId}`;
      const alert = await this.config.kvNamespace.get(alertKey, 'json') as ThreatAlert | null;
      
      if (!alert) {
        return new Response('Alert not found', { status: 404 });
      }

      // Update alert status
      alert.status = 'resolved';
      alert.metadata.resolution = body.resolution || 'Manually resolved';
      alert.metadata.resolvedAt = Date.now();

      // Move to resolved alerts
      await this.config.kvNamespace.put(
        `alert:resolved:${alert.id}`,
        JSON.stringify(alert),
        { expirationTtl: 604800 } // 7 days
      );

      // Remove from active alerts
      await this.config.kvNamespace.delete(alertKey);
      this.activeAlerts.delete(alert.id);

      // Log resolution
      await this.config.auditLogger.log(
        AuditEventType.SUSPICIOUS_ACTIVITY,
        AuditSeverity.INFO,
        {
          action: 'alert_resolved',
          alertId: alert.id,
          alertType: alert.type,
          resolution: body.resolution
        }
      );

      return new Response(JSON.stringify({
        success: true,
        alert
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response('Invalid request', { status: 400 });
    }
  }

  /**
   * WebSocket handler for real-time updates
   */
  async handleWebSocket(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    server.accept();

    // Send initial metrics
    const metrics = await this.collectMetrics();
    server.send(JSON.stringify({
      type: 'metrics',
      data: metrics
    }));

    // Set up periodic updates
    const interval = setInterval(async () => {
      try {
        const updatedMetrics = await this.collectMetrics();
        server.send(JSON.stringify({
          type: 'metrics',
          data: updatedMetrics
        }));

        // Send any new alerts
        const alerts = await this.getActiveAlerts();
        if (alerts.length > 0) {
          server.send(JSON.stringify({
            type: 'alerts',
            data: alerts
          }));
        }
      } catch (error) {
        console.error('Error sending metrics update:', error);
      }
    }, 5000); // Update every 5 seconds

    server.addEventListener('close', () => {
      clearInterval(interval);
    });

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  /**
   * Group alerts by type
   */
  private groupAlertsByType(alerts: ThreatAlert[]): Record<string, number> {
    const grouped: Record<string, number> = {};
    
    for (const alert of alerts) {
      if (!grouped[alert.type]) {
        grouped[alert.type] = 0;
      }
      grouped[alert.type]++;
    }
    
    return grouped;
  }

  /**
   * Private helper methods
   */
  private async detectThreats(
    metrics: SecurityMetrics,
    events: any[]
  ): Promise<void> {
    // Brute force detection
    if (metrics.authentication.failedLogins >= this.config.alertThresholds.failedLoginAttempts!) {
      await this.createAlert({
        type: ThreatType.BRUTE_FORCE,
        severity: ThreatSeverity.HIGH,
        description: `Detected ${metrics.authentication.failedLogins} failed login attempts in the last ${this.config.metricsInterval} seconds`,
        metadata: {
          failedAttempts: metrics.authentication.failedLogins,
          timeWindow: this.config.metricsInterval
        }
      });
    }

    // Rate limit abuse detection
    if (metrics.rateLimiting.blockedRequests >= this.config.alertThresholds.rateLimitViolations!) {
      await this.createAlert({
        type: ThreatType.RATE_LIMIT_ABUSE,
        severity: ThreatSeverity.MEDIUM,
        description: `Excessive rate limit violations detected: ${metrics.rateLimiting.blockedRequests} blocked requests`,
        metadata: {
          blockedRequests: metrics.rateLimiting.blockedRequests,
          topOffenders: metrics.rateLimiting.topOffenders
        }
      });
    }

    // Financial fraud detection
    const largeTransactions = events.filter(e => 
      [AuditEventType.DEPOSIT, AuditEventType.WITHDRAWAL, AuditEventType.TRANSFER].includes(e.type) &&
      e.metadata.amount > this.config.alertThresholds.suspiciousTransactionAmount!
    );

    if (largeTransactions.length > 0) {
      for (const transaction of largeTransactions) {
        await this.createAlert({
          type: ThreatType.FINANCIAL_FRAUD,
          severity: ThreatSeverity.HIGH,
          description: `Large transaction detected: $${transaction.metadata.amount}`,
          metadata: {
            transactionType: transaction.type,
            amount: transaction.metadata.amount,
            userId: transaction.userId
          }
        });
      }
    }
  }

  private async createAlert(alert: Omit<ThreatAlert, 'id' | 'timestamp' | 'status'>): Promise<void> {
    const fullAlert: ThreatAlert = {
      ...alert,
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      status: 'active'
    };

    // Store in KV
    await this.config.kvNamespace.put(
      `alert:active:${fullAlert.id}`,
      JSON.stringify(fullAlert),
      { expirationTtl: 86400 } // 24 hour TTL
    );

    // Add to memory cache
    this.activeAlerts.set(fullAlert.id, fullAlert);

    // Log the alert
    await this.config.auditLogger.log(
      AuditEventType.SUSPICIOUS_ACTIVITY,
      AuditSeverity.WARNING,
      {
        alertId: fullAlert.id,
        alertType: fullAlert.type,
        severity: fullAlert.severity,
        description: fullAlert.description
      }
    );
  }
}

/**
 * Create security dashboard router
 */
export function createSecurityDashboardRouter(
  dashboard: SecurityMonitoringDashboard,
  options?: {
    basePath?: string;
    requireAuth?: (request: Request) => Promise<boolean>;
    performanceCollector?: PerformanceCollector;
  }
) {
  const basePath = options?.basePath || '/security';

  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    
    if (!url.pathname.startsWith(basePath)) {
      return null;
    }

    // Check authentication if required
    if (options?.requireAuth) {
      const authorized = await options.requireAuth(request);
      if (!authorized) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    const path = url.pathname.substring(basePath.length);

    switch (path) {
      case '':
      case '/':
      case '/dashboard':
        return dashboard.renderDashboard();
      
      case '/api/metrics':
        return dashboard.getMetricsJson();
      
      case '/api/metrics/authentication':
        return dashboard.getAuthenticationMetrics();
      
      case '/api/metrics/threats':
        return dashboard.getThreatMetrics();
      
      case '/api/metrics/rate-limiting':
        return dashboard.getRateLimitMetrics();
      
      case '/api/metrics/financial':
        return dashboard.getFinancialMetrics();
      
      case '/api/metrics/performance':
        if (options?.performanceCollector) {
          return dashboard.getPerformanceMetrics(options.performanceCollector);
        }
        return new Response('Performance collector not configured', { status: 501 });
      
      case '/api/alerts':
        return dashboard.getAlertsJson();
      
      case '/api/alerts/active':
        return dashboard.getActiveAlertsJson();
      
      case '/api/alerts/resolve':
        if (request.method === 'POST') {
          return dashboard.resolveAlert(request);
        }
        return new Response('Method not allowed', { status: 405 });
      
      case '/ws':
        return dashboard.handleWebSocket(request);
      
      default:
        return new Response('Not Found', { status: 404 });
    }
  };
}