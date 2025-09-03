import { 
  SecurityMonitoringDashboard, 
  ThreatType, 
  ThreatSeverity 
} from '../monitoring/dashboard';
import { SecurityAuditLogger, AuditEventType, AuditSeverity } from '../audit/logger';

describe('Security Monitoring Dashboard', () => {
  let mockKV: any;
  let mockAuditLogger: any;
  let dashboard: SecurityMonitoringDashboard;

  beforeEach(() => {
    mockKV = {
      put: jest.fn(),
      get: jest.fn(),
      list: jest.fn().mockResolvedValue({ keys: [] })
    };

    mockAuditLogger = {
      query: jest.fn().mockResolvedValue([]),
      log: jest.fn()
    };

    dashboard = new SecurityMonitoringDashboard({
      kvNamespace: mockKV,
      auditLogger: mockAuditLogger,
      metricsInterval: 60,
      alertThresholds: {
        failedLoginAttempts: 5,
        rateLimitViolations: 10,
        suspiciousTransactionAmount: 10000
      }
    });
  });

  describe('collectMetrics', () => {
    it('should collect and aggregate security metrics', async () => {
      const mockEvents = [
        { type: AuditEventType.LOGIN_SUCCESS, metadata: {} },
        { type: AuditEventType.LOGIN_SUCCESS, metadata: {} },
        { type: AuditEventType.LOGIN_FAILURE, metadata: {} },
        { type: AuditEventType.REGISTER, metadata: {} },
        { type: AuditEventType.RATE_LIMIT_EXCEEDED, metadata: { identifier: 'ip1' } },
        { type: AuditEventType.RATE_LIMIT_EXCEEDED, metadata: { identifier: 'ip1' } },
        { type: AuditEventType.RATE_LIMIT_EXCEEDED, metadata: { identifier: 'ip2' } },
        { type: AuditEventType.DEPOSIT, metadata: { amount: 100 } },
        { type: AuditEventType.WITHDRAWAL, metadata: { amount: 50 } },
        { type: AuditEventType.SUSPICIOUS_ACTIVITY, metadata: {} },
        { type: AuditEventType.CSRF_VIOLATION, metadata: {} }
      ];

      mockAuditLogger.query.mockResolvedValue(mockEvents);

      const metrics = await dashboard.collectMetrics();

      expect(metrics.authentication.successfulLogins).toBe(2);
      expect(metrics.authentication.failedLogins).toBe(1);
      expect(metrics.authentication.registrations).toBe(1);
      expect(metrics.rateLimiting.blockedRequests).toBe(3);
      expect(metrics.rateLimiting.topOffenders).toEqual([
        { identifier: 'ip1', count: 2 },
        { identifier: 'ip2', count: 1 }
      ]);
      expect(metrics.threats.suspiciousActivities).toBe(1);
      expect(metrics.threats.csrfViolations).toBe(1);
      expect(metrics.financial.deposits.count).toBe(1);
      expect(metrics.financial.deposits.total).toBe(100);
      expect(metrics.financial.withdrawals.count).toBe(1);
      expect(metrics.financial.withdrawals.total).toBe(50);
    });

    it('should cache metrics within interval', async () => {
      mockAuditLogger.query.mockResolvedValue([]);

      const metrics1 = await dashboard.collectMetrics();
      const metrics2 = await dashboard.collectMetrics();

      expect(mockAuditLogger.query).toHaveBeenCalledTimes(1);
      expect(metrics1).toBe(metrics2); // Same reference due to caching
    });

    it('should detect brute force threats', async () => {
      const mockEvents = Array(6).fill(null).map(() => ({
        type: AuditEventType.LOGIN_FAILURE,
        metadata: {}
      }));

      mockAuditLogger.query.mockResolvedValue(mockEvents);

      await dashboard.collectMetrics();

      expect(mockKV.put).toHaveBeenCalledWith(
        expect.stringContaining('alert:active:'),
        expect.stringContaining(ThreatType.BRUTE_FORCE),
        expect.any(Object)
      );
    });

    it('should detect rate limit abuse', async () => {
      const mockEvents = Array(11).fill(null).map(() => ({
        type: AuditEventType.RATE_LIMIT_EXCEEDED,
        metadata: { identifier: 'ip1' }
      }));

      mockAuditLogger.query.mockResolvedValue(mockEvents);

      await dashboard.collectMetrics();

      expect(mockKV.put).toHaveBeenCalledWith(
        expect.stringContaining('alert:active:'),
        expect.stringContaining(ThreatType.RATE_LIMIT_ABUSE),
        expect.any(Object)
      );
    });

    it('should detect suspicious financial transactions', async () => {
      const mockEvents = [
        {
          type: AuditEventType.WITHDRAWAL,
          metadata: { amount: 15000 },
          userId: 'user123'
        }
      ];

      mockAuditLogger.query.mockResolvedValue(mockEvents);

      await dashboard.collectMetrics();

      expect(mockKV.put).toHaveBeenCalledWith(
        expect.stringContaining('alert:active:'),
        expect.stringContaining(ThreatType.FINANCIAL_FRAUD),
        expect.any(Object)
      );
    });
  });

  describe('getActiveAlerts', () => {
    it('should retrieve active alerts from storage', async () => {
      const mockAlerts = [
        {
          id: 'alert1',
          timestamp: Date.now() - 1000,
          type: ThreatType.BRUTE_FORCE,
          severity: ThreatSeverity.HIGH,
          description: 'Test alert 1',
          metadata: {},
          status: 'active'
        },
        {
          id: 'alert2',
          timestamp: Date.now() - 2000,
          type: ThreatType.RATE_LIMIT_ABUSE,
          severity: ThreatSeverity.MEDIUM,
          description: 'Test alert 2',
          metadata: {},
          status: 'active'
        }
      ];

      mockKV.list.mockResolvedValue({
        keys: mockAlerts.map(a => ({ name: `alert:active:${a.id}` }))
      });

      mockKV.get.mockImplementation((key) => {
        const id = key.split(':')[2];
        return Promise.resolve(mockAlerts.find(a => a.id === id));
      });

      const alerts = await dashboard.getActiveAlerts();

      expect(alerts).toHaveLength(2);
      expect(alerts[0].id).toBe('alert1'); // Sorted by timestamp desc
      expect(alerts[1].id).toBe('alert2');
    });
  });

  describe('renderDashboard', () => {
    it('should render HTML dashboard', async () => {
      mockAuditLogger.query.mockResolvedValue([]);
      mockKV.list.mockResolvedValue({ keys: [] });

      const response = await dashboard.renderDashboard();

      expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');

      const html = await response.text();
      expect(html).toContain('Security Monitoring Dashboard');
      expect(html).toContain('Authentication');
      expect(html).toContain('Rate Limiting');
      expect(html).toContain('Security Threats');
      expect(html).toContain('Financial Activity');
    });
  });

  describe('getMetricsJson', () => {
    it('should return metrics as JSON', async () => {
      mockAuditLogger.query.mockResolvedValue([]);
      mockKV.list.mockResolvedValue({ keys: [] });

      const response = await dashboard.getMetricsJson();

      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Cache-Control')).toBe('no-cache');

      const data = await response.json();
      expect(data).toHaveProperty('metrics');
      expect(data).toHaveProperty('alerts');
      expect(data).toHaveProperty('timestamp');
    });
  });

  describe('handleWebSocket', () => {
    it('should reject non-websocket requests', async () => {
      const request = new Request('https://example.com/ws');
      
      const response = await dashboard.handleWebSocket(request);

      expect(response.status).toBe(426);
      expect(await response.text()).toBe('Expected Upgrade: websocket');
    });

    it('should accept websocket upgrade requests', async () => {
      const request = new Request('https://example.com/ws', {
        headers: { 'Upgrade': 'websocket' }
      });

      // Mock WebSocketPair
      const mockClient = {};
      const mockServer = {
        accept: jest.fn(),
        send: jest.fn(),
        addEventListener: jest.fn()
      };

      global.WebSocketPair = jest.fn().mockReturnValue({
        0: mockClient,
        1: mockServer
      }) as any;

      mockAuditLogger.query.mockResolvedValue([]);

      const response = await dashboard.handleWebSocket(request);

      expect(response.status).toBe(101);
      expect(response.webSocket).toBe(mockClient);
      expect(mockServer.accept).toHaveBeenCalled();
      expect(mockServer.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"metrics"')
      );
    });
  });
});