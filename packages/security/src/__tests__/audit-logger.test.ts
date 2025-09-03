import { 
  SecurityAuditLogger, 
  AuditEventType, 
  AuditSeverity 
} from '../audit/logger';

describe('Security Audit Logger', () => {
  let mockKV: any;
  let mockR2: any;
  let logger: SecurityAuditLogger;

  beforeEach(() => {
    mockKV = {
      put: jest.fn(),
      get: jest.fn(),
      list: jest.fn().mockResolvedValue({ keys: [] })
    };

    mockR2 = {
      put: jest.fn()
    };

    logger = new SecurityAuditLogger({
      kvNamespace: mockKV,
      r2Bucket: mockR2,
      retentionDays: 7,
      archiveRetentionDays: 365,
      batchSize: 10,
      flushIntervalMs: 1000
    });
  });

  describe('log', () => {
    it('should log events with all metadata', async () => {
      await logger.log(
        AuditEventType.LOGIN_SUCCESS,
        AuditSeverity.INFO,
        { email: 'user@example.com' },
        {
          userId: 'user123',
          request: new Request('https://example.com', {
            headers: {
              'CF-Connecting-IP': '192.168.1.1',
              'User-Agent': 'Mozilla/5.0'
            }
          }),
          requestId: 'req123',
          sessionId: 'session123'
        }
      );

      // Wait for batch to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockKV.put).toHaveBeenCalledWith(
        expect.stringContaining('audit:'),
        expect.stringContaining('"type":"auth.login.success"'),
        expect.objectContaining({ expirationTtl: 604800 }) // 7 days
      );
    });

    it('should flush critical events immediately', async () => {
      await logger.log(
        AuditEventType.SUSPICIOUS_ACTIVITY,
        AuditSeverity.CRITICAL,
        { reason: 'Multiple failed login attempts' }
      );

      expect(mockKV.put).toHaveBeenCalled();
    });

    it('should batch non-critical events', async () => {
      // Log 5 events (less than batch size of 10)
      for (let i = 0; i < 5; i++) {
        await logger.log(
          AuditEventType.LOGIN_SUCCESS,
          AuditSeverity.INFO,
          { attempt: i }
        );
      }

      // Should not have flushed yet
      expect(mockKV.put).not.toHaveBeenCalled();

      // Wait for flush interval
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should have flushed after interval
      expect(mockKV.put).toHaveBeenCalledTimes(5);
    });

    it('should archive to R2 when configured', async () => {
      await logger.log(
        AuditEventType.DEPOSIT,
        AuditSeverity.INFO,
        { amount: 100 }
      );

      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(mockR2.put).toHaveBeenCalledWith(
        expect.stringMatching(/^audit-logs\/\d{4}\/\d{2}\/\d{2}\/\d+\.json$/),
        expect.any(String),
        expect.objectContaining({
          httpMetadata: { contentType: 'application/json' }
        })
      );
    });
  });

  describe('helper methods', () => {
    it('should log login attempts correctly', async () => {
      await logger.logLoginAttempt(true, 'user@example.com', '192.168.1.1');
      await logger.logLoginAttempt(false, 'user@example.com', '192.168.1.1', 'Invalid password');

      await new Promise(resolve => setTimeout(resolve, 1100));

      const calls = mockKV.put.mock.calls;
      expect(calls[0][1]).toContain('"type":"auth.login.success"');
      expect(calls[1][1]).toContain('"type":"auth.login.failure"');
      expect(calls[1][1]).toContain('"reason":"Invalid password"');
    });

    it('should log financial transactions correctly', async () => {
      await logger.logFinancialTransaction(
        'deposit',
        'user123',
        1000,
        { method: 'credit_card', cardLast4: '1234' }
      );

      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(mockKV.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"type":"finance.deposit"'),
        expect.any(Object)
      );
    });

    it('should log security violations correctly', async () => {
      await logger.logSecurityViolation(
        'rate_limit',
        { endpoint: '/api/login', attempts: 50 },
        new Request('https://example.com')
      );

      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(mockKV.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"type":"security.rate_limit.exceeded"'),
        expect.any(Object)
      );
    });
  });

  describe('query', () => {
    it('should query events with filters', async () => {
      const mockEvents = [
        {
          id: '1',
          timestamp: Date.now() - 1000,
          type: AuditEventType.LOGIN_SUCCESS,
          severity: AuditSeverity.INFO,
          userId: 'user123',
          metadata: {}
        },
        {
          id: '2',
          timestamp: Date.now() - 2000,
          type: AuditEventType.LOGIN_FAILURE,
          severity: AuditSeverity.WARNING,
          userId: 'user456',
          metadata: {}
        }
      ];

      mockKV.list.mockResolvedValue({
        keys: mockEvents.map(e => ({ name: `audit:${e.id}` }))
      });

      mockKV.get.mockImplementation((key) => {
        const id = key.split(':')[1];
        return Promise.resolve(mockEvents.find(e => e.id === id));
      });

      const results = await logger.query({
        type: AuditEventType.LOGIN_SUCCESS,
        userId: 'user123',
        limit: 10
      });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe(AuditEventType.LOGIN_SUCCESS);
      expect(results[0].userId).toBe('user123');
    });
  });

  describe('generateComplianceReport', () => {
    it('should generate comprehensive compliance report', async () => {
      const mockEvents = [
        {
          id: '1',
          timestamp: Date.now() - 1000,
          type: AuditEventType.LOGIN_SUCCESS,
          severity: AuditSeverity.INFO,
          metadata: {}
        },
        {
          id: '2',
          timestamp: Date.now() - 2000,
          type: AuditEventType.LOGIN_FAILURE,
          severity: AuditSeverity.WARNING,
          metadata: {}
        },
        {
          id: '3',
          timestamp: Date.now() - 3000,
          type: AuditEventType.DEPOSIT,
          severity: AuditSeverity.INFO,
          metadata: { amount: 100 }
        },
        {
          id: '4',
          timestamp: Date.now() - 4000,
          type: AuditEventType.RATE_LIMIT_EXCEEDED,
          severity: AuditSeverity.WARNING,
          metadata: {}
        }
      ];

      mockKV.list.mockResolvedValue({
        keys: mockEvents.map(e => ({ name: `audit:${e.id}` }))
      });

      mockKV.get.mockImplementation((key) => {
        const id = key.split(':')[1];
        return Promise.resolve(mockEvents.find(e => e.id === id));
      });

      const startDate = new Date(Date.now() - 86400000); // 1 day ago
      const endDate = new Date();

      const report = await logger.generateComplianceReport(startDate, endDate);

      expect(report.summary.totalEvents).toBe(4);
      expect(report.summary.byType[AuditEventType.LOGIN_SUCCESS]).toBe(1);
      expect(report.summary.byType[AuditEventType.LOGIN_FAILURE]).toBe(1);
      expect(report.summary.bySeverity[AuditSeverity.INFO]).toBe(2);
      expect(report.summary.bySeverity[AuditSeverity.WARNING]).toBe(2);
      expect(report.summary.securityViolations).toBe(1);
      expect(report.summary.financialTransactions).toBe(1);
      
      expect(report.details.loginAttempts.successful).toBe(1);
      expect(report.details.loginAttempts.failed).toBe(1);
      expect(report.details.financialActivity.deposits.count).toBe(1);
      expect(report.details.financialActivity.deposits.total).toBe(100);
      expect(report.details.securityEvents).toHaveLength(1);
    });
  });
});