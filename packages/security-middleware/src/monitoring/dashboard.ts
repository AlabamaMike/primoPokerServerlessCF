import { AuditLogger } from '../audit/logger';
import { TokenBucketRateLimiter } from '../rate-limiting/token-bucket';

interface SecurityMetrics {
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
    topBlockedIPs: Array<{ ip: string; count: number }>;
    limitsByEndpoint: Record<string, { allowed: number; blocked: number }>;
  };
  threats: {
    suspiciousActivities: number;
    blockedIPs: number;
    csrfViolations: number;
    invalidSignatures: number;
    sqlInjectionAttempts: number;
    xssAttempts: number;
  };
  financial: {
    totalTransactions: number;
    suspiciousTransactions: number;
    largeTransactions: number;
    failedTransactions: number;
  };
}

interface ThreatAlert {
  id: string;
  timestamp: number;
  type: 'brute_force' | 'suspicious_pattern' | 'rate_limit_abuse' | 'injection_attempt' | 'unauthorized_access';
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export class SecurityMonitoringDashboard {
  constructor(
    private auditLogger: AuditLogger,
    private storage: KVNamespace,
    private config: {
      alertThresholds: {
        failedLoginsPerMinute: number;
        rateLimitViolationsPerMinute: number;
        suspiciousPatternCount: number;
      };
      retentionDays: number;
    } = {
      alertThresholds: {
        failedLoginsPerMinute: 10,
        rateLimitViolationsPerMinute: 50,
        suspiciousPatternCount: 5,
      },
      retentionDays: 30,
    }
  ) {}

  async collectMetrics(timeRange: { start: number; end: number }): Promise<SecurityMetrics> {
    // Query audit logs
    const events = await this.auditLogger.query({
      startTime: timeRange.start,
      endTime: timeRange.end,
      limit: 10000,
    });

    const metrics: SecurityMetrics = {
      authentication: {
        successfulLogins: 0,
        failedLogins: 0,
        registrations: 0,
        passwordResets: 0,
        activeSessions: 0,
      },
      rateLimiting: {
        totalRequests: 0,
        blockedRequests: 0,
        topBlockedIPs: [],
        limitsByEndpoint: {},
      },
      threats: {
        suspiciousActivities: 0,
        blockedIPs: 0,
        csrfViolations: 0,
        invalidSignatures: 0,
        sqlInjectionAttempts: 0,
        xssAttempts: 0,
      },
      financial: {
        totalTransactions: 0,
        suspiciousTransactions: 0,
        largeTransactions: 0,
        failedTransactions: 0,
      },
    };

    // Process events
    const blockedIPCounts = new Map<string, number>();
    
    for (const event of events) {
      // Authentication metrics
      if (event.eventType === 'authentication') {
        switch (event.action) {
          case 'login':
            metrics.authentication.successfulLogins++;
            break;
          case 'failed_login':
            metrics.authentication.failedLogins++;
            break;
          case 'register':
            metrics.authentication.registrations++;
            break;
          case 'password_reset':
            metrics.authentication.passwordResets++;
            break;
        }
      }

      // Rate limiting metrics
      if (event.eventType === 'rate_limit') {
        metrics.rateLimiting.totalRequests++;
        if (event.result === 'failure') {
          metrics.rateLimiting.blockedRequests++;
          if (event.ipAddress) {
            blockedIPCounts.set(event.ipAddress, (blockedIPCounts.get(event.ipAddress) || 0) + 1);
          }
          
          const endpoint = event.resource;
          if (!metrics.rateLimiting.limitsByEndpoint[endpoint]) {
            metrics.rateLimiting.limitsByEndpoint[endpoint] = { allowed: 0, blocked: 0 };
          }
          metrics.rateLimiting.limitsByEndpoint[endpoint].blocked++;
        } else {
          const endpoint = event.resource;
          if (!metrics.rateLimiting.limitsByEndpoint[endpoint]) {
            metrics.rateLimiting.limitsByEndpoint[endpoint] = { allowed: 0, blocked: 0 };
          }
          metrics.rateLimiting.limitsByEndpoint[endpoint].allowed++;
        }
      }

      // Threat metrics
      if (event.eventType === 'security_threat') {
        metrics.threats.suspiciousActivities++;
        
        if (event.metadata?.threatType === 'csrf') {
          metrics.threats.csrfViolations++;
        } else if (event.metadata?.threatType === 'invalid_signature') {
          metrics.threats.invalidSignatures++;
        } else if (event.metadata?.threatType === 'sql_injection') {
          metrics.threats.sqlInjectionAttempts++;
        } else if (event.metadata?.threatType === 'xss') {
          metrics.threats.xssAttempts++;
        }
      }

      // Financial metrics
      if (event.eventType === 'wallet') {
        metrics.financial.totalTransactions++;
        if (event.result === 'failure') {
          metrics.financial.failedTransactions++;
        }
        if (event.metadata?.amount && Number(event.metadata.amount) > 1000) {
          metrics.financial.largeTransactions++;
        }
        if (event.metadata?.suspicious) {
          metrics.financial.suspiciousTransactions++;
        }
      }
    }

    // Get active sessions count
    const sessionCount = await this.storage.get('metrics:active_sessions');
    metrics.authentication.activeSessions = sessionCount ? parseInt(sessionCount, 10) : 0;

    // Get blocked IPs count
    const blockedIPsList = await this.storage.get('security:blocked_ips');
    metrics.threats.blockedIPs = blockedIPsList ? JSON.parse(blockedIPsList).length : 0;

    // Top blocked IPs
    metrics.rateLimiting.topBlockedIPs = Array.from(blockedIPCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count }));

    return metrics;
  }

  async detectThreats(metrics: SecurityMetrics, timeWindowMinutes: number = 5): Promise<ThreatAlert[]> {
    const alerts: ThreatAlert[] = [];
    const now = Date.now();

    // Check for brute force attacks
    const failedLoginsPerMinute = metrics.authentication.failedLogins / timeWindowMinutes;
    if (failedLoginsPerMinute > this.config.alertThresholds.failedLoginsPerMinute) {
      alerts.push({
        id: crypto.randomUUID(),
        timestamp: now,
        type: 'brute_force',
        severity: 'high',
        source: 'authentication',
        description: `High rate of failed login attempts detected: ${failedLoginsPerMinute.toFixed(1)} per minute`,
        metadata: { rate: failedLoginsPerMinute },
      });
    }

    // Check for rate limit abuse
    const rateLimitViolationsPerMinute = metrics.rateLimiting.blockedRequests / timeWindowMinutes;
    if (rateLimitViolationsPerMinute > this.config.alertThresholds.rateLimitViolationsPerMinute) {
      alerts.push({
        id: crypto.randomUUID(),
        timestamp: now,
        type: 'rate_limit_abuse',
        severity: 'medium',
        source: 'rate_limiting',
        description: `Excessive rate limit violations: ${rateLimitViolationsPerMinute.toFixed(1)} per minute`,
        metadata: { 
          rate: rateLimitViolationsPerMinute,
          topOffenders: metrics.rateLimiting.topBlockedIPs.slice(0, 3),
        },
      });
    }

    // Check for injection attempts
    const injectionAttempts = metrics.threats.sqlInjectionAttempts + metrics.threats.xssAttempts;
    if (injectionAttempts > 0) {
      alerts.push({
        id: crypto.randomUUID(),
        timestamp: now,
        type: 'injection_attempt',
        severity: 'critical',
        source: 'input_validation',
        description: `Injection attempts detected: ${injectionAttempts} total (${metrics.threats.sqlInjectionAttempts} SQL, ${metrics.threats.xssAttempts} XSS)`,
        metadata: { 
          sqlInjections: metrics.threats.sqlInjectionAttempts,
          xssAttempts: metrics.threats.xssAttempts,
        },
      });
    }

    // Check for suspicious patterns
    if (metrics.threats.suspiciousActivities > this.config.alertThresholds.suspiciousPatternCount) {
      alerts.push({
        id: crypto.randomUUID(),
        timestamp: now,
        type: 'suspicious_pattern',
        severity: 'medium',
        source: 'behavior_analysis',
        description: `Suspicious activity pattern detected: ${metrics.threats.suspiciousActivities} incidents`,
        metadata: { count: metrics.threats.suspiciousActivities },
      });
    }

    // Store alerts
    for (const alert of alerts) {
      await this.storage.put(
        `alert:${alert.timestamp}:${alert.id}`,
        JSON.stringify(alert),
        { expirationTtl: this.config.retentionDays * 24 * 60 * 60 }
      );
    }

    return alerts;
  }

  async getActiveAlerts(limit: number = 50): Promise<ThreatAlert[]> {
    const { keys } = await this.storage.list({
      prefix: 'alert:',
      limit,
    });

    const alerts: ThreatAlert[] = [];
    for (const key of keys) {
      const data = await this.storage.get(key.name);
      if (data) {
        alerts.push(JSON.parse(data));
      }
    }

    return alerts.sort((a, b) => b.timestamp - a.timestamp);
  }

  async generateSecurityReport(): Promise<{
    summary: SecurityMetrics;
    alerts: ThreatAlert[];
    recommendations: string[];
    riskScore: number;
  }> {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    
    const summary = await this.collectMetrics({ start: dayAgo, end: now });
    const alerts = await this.detectThreats(summary, 24 * 60);
    const activeAlerts = await this.getActiveAlerts();

    // Calculate risk score (0-100)
    let riskScore = 0;
    
    // Authentication risks
    const failureRate = summary.authentication.failedLogins / 
      (summary.authentication.successfulLogins + summary.authentication.failedLogins || 1);
    riskScore += Math.min(failureRate * 30, 30);

    // Rate limiting risks
    const blockRate = summary.rateLimiting.blockedRequests / 
      (summary.rateLimiting.totalRequests || 1);
    riskScore += Math.min(blockRate * 20, 20);

    // Threat risks
    riskScore += Math.min(summary.threats.suspiciousActivities * 2, 20);
    riskScore += Math.min((summary.threats.sqlInjectionAttempts + summary.threats.xssAttempts) * 5, 20);

    // Alert severity
    for (const alert of activeAlerts) {
      switch (alert.severity) {
        case 'critical': riskScore += 10; break;
        case 'high': riskScore += 5; break;
        case 'medium': riskScore += 2; break;
        case 'low': riskScore += 1; break;
      }
    }

    riskScore = Math.min(riskScore, 100);

    // Generate recommendations
    const recommendations: string[] = [];

    if (failureRate > 0.1) {
      recommendations.push('Consider implementing CAPTCHA for login attempts after failures');
    }

    if (summary.rateLimiting.topBlockedIPs.length > 5) {
      recommendations.push('Review top blocked IPs for potential permanent banning');
    }

    if (summary.threats.sqlInjectionAttempts > 0 || summary.threats.xssAttempts > 0) {
      recommendations.push('Review and strengthen input validation on affected endpoints');
    }

    if (riskScore > 70) {
      recommendations.push('Enable enhanced monitoring and alerting');
      recommendations.push('Consider implementing additional authentication factors');
    }

    if (summary.financial.suspiciousTransactions > 0) {
      recommendations.push('Review suspicious financial transactions for potential fraud');
    }

    return {
      summary,
      alerts,
      recommendations,
      riskScore,
    };
  }

  // WebSocket endpoint for real-time monitoring
  async handleWebSocket(websocket: WebSocket): Promise<void> {
    // Accept the WebSocket connection
    websocket.accept();

    // Send initial data
    const report = await this.generateSecurityReport();
    websocket.send(JSON.stringify({
      type: 'initial',
      data: report,
    }));

    // Set up periodic updates
    const interval = setInterval(async () => {
      try {
        const now = Date.now();
        const fiveMinutesAgo = now - 5 * 60 * 1000;
        
        const metrics = await this.collectMetrics({ start: fiveMinutesAgo, end: now });
        const alerts = await this.detectThreats(metrics, 5);

        if (websocket.readyState === WebSocket.READY_STATE_OPEN) {
          websocket.send(JSON.stringify({
            type: 'update',
            data: { metrics, alerts },
          }));
        } else {
          clearInterval(interval);
        }
      } catch (error) {
        console.error('Error sending update:', error);
      }
    }, 30000); // Update every 30 seconds

    // Clean up on close
    websocket.addEventListener('close', () => {
      clearInterval(interval);
    });
  }
}

// Express-style router for dashboard endpoints
export function createSecurityDashboardRoutes(dashboard: SecurityMonitoringDashboard, authChecker: (req: Request) => Promise<boolean>) {
  return {
    async '/api/security/metrics': (request: Request) => {
      if (!(await authChecker(request))) {
        return new Response('Unauthorized', { status: 401 });
      }

      const url = new URL(request.url);
      const hours = parseInt(url.searchParams.get('hours') || '24', 10);
      const end = Date.now();
      const start = end - hours * 60 * 60 * 1000;

      const metrics = await dashboard.collectMetrics({ start, end });
      return new Response(JSON.stringify(metrics), {
        headers: { 'Content-Type': 'application/json' },
      });
    },

    async '/api/security/alerts': (request: Request) => {
      if (!(await authChecker(request))) {
        return new Response('Unauthorized', { status: 401 });
      }

      const alerts = await dashboard.getActiveAlerts();
      return new Response(JSON.stringify(alerts), {
        headers: { 'Content-Type': 'application/json' },
      });
    },

    async '/api/security/report': (request: Request) => {
      if (!(await authChecker(request))) {
        return new Response('Unauthorized', { status: 401 });
      }

      const report = await dashboard.generateSecurityReport();
      return new Response(JSON.stringify(report), {
        headers: { 'Content-Type': 'application/json' },
      });
    },

    async '/api/security/ws': (request: Request) => {
      if (!(await authChecker(request))) {
        return new Response('Unauthorized', { status: 401 });
      }

      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }

      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);

      dashboard.handleWebSocket(server);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    },
  };
}