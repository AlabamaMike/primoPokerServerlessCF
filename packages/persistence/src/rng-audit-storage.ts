/**
 * RNG Audit Storage
 * 
 * Provides comprehensive audit logging for RNG operations in R2 storage.
 * Supports both real-time logging and batch uploads for efficiency.
 */

import { AuditLog, RNGStatus } from './secure-rng-do';

export interface AuditBatch {
  tableId: string;
  batchId: string;
  timestamp: number;
  logs: AuditLog[];
  summary: {
    operationCount: number;
    totalEntropyUsed: number;
    operationTypes: Record<string, number>;
    timeRange: {
      start: number;
      end: number;
    };
  };
}

export interface AuditIndex {
  tableId: string;
  date: string;
  batches: Array<{
    batchId: string;
    timestamp: number;
    logCount: number;
    key: string;
  }>;
}

export interface SecurityAlert {
  id: string;
  tableId: string;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  description: string;
  details: any;
}

export class RNGAuditStorage {
  private static readonly BATCH_SIZE = 100;
  private static readonly INDEX_PREFIX = 'audit-index/';
  private static readonly BATCH_PREFIX = 'audit-batch/';
  private static readonly ALERT_PREFIX = 'security-alert/';
  private static readonly RETENTION_DAYS = 90;

  constructor(private bucket: R2Bucket) {}

  /**
   * Store a batch of audit logs
   */
  async storeBatch(tableId: string, logs: AuditLog[]): Promise<string> {
    if (logs.length === 0) return '';

    const batchId = `${Date.now()}-${crypto.randomUUID()}`;
    const batch: AuditBatch = {
      tableId,
      batchId,
      timestamp: Date.now(),
      logs,
      summary: this.generateBatchSummary(logs)
    };

    // Store the batch
    const key = `${RNGAuditStorage.BATCH_PREFIX}${tableId}/${batchId}.json`;
    await this.bucket.put(key, JSON.stringify(batch), {
      httpMetadata: {
        contentType: 'application/json',
        cacheControl: 'no-cache'
      },
      customMetadata: {
        tableId,
        batchId,
        logCount: logs.length.toString(),
        timestamp: batch.timestamp.toString()
      }
    });

    // Update the index
    await this.updateIndex(tableId, batchId, logs.length, key);

    return batchId;
  }

  /**
   * Retrieve audit logs for a table within a time range
   */
  async getAuditLogs(
    tableId: string, 
    startTime: number, 
    endTime: number,
    limit: number = 1000
  ): Promise<AuditLog[]> {
    const logs: AuditLog[] = [];
    
    // Get relevant batches from index
    const batches = await this.getBatchesInRange(tableId, startTime, endTime);
    
    for (const batchInfo of batches) {
      if (logs.length >= limit) break;
      
      const batch = await this.getBatch(batchInfo.key);
      if (batch) {
        const relevantLogs = batch.logs.filter(
          log => log.timestamp >= startTime && log.timestamp <= endTime
        );
        logs.push(...relevantLogs.slice(0, limit - logs.length));
      }
    }

    return logs.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Store a security alert
   */
  async storeSecurityAlert(alert: SecurityAlert): Promise<void> {
    const key = `${RNGAuditStorage.ALERT_PREFIX}${alert.tableId}/${alert.id}.json`;
    
    await this.bucket.put(key, JSON.stringify(alert), {
      httpMetadata: {
        contentType: 'application/json'
      },
      customMetadata: {
        tableId: alert.tableId,
        severity: alert.severity,
        type: alert.type,
        timestamp: alert.timestamp.toString()
      }
    });

    // Also store in a daily index for easy retrieval
    const dateKey = new Date(alert.timestamp).toISOString().split('T')[0];
    const indexKey = `${RNGAuditStorage.ALERT_PREFIX}index/${dateKey}/${alert.id}.json`;
    
    await this.bucket.put(indexKey, JSON.stringify({
      alertId: alert.id,
      tableId: alert.tableId,
      severity: alert.severity,
      timestamp: alert.timestamp,
      key
    }), {
      httpMetadata: {
        contentType: 'application/json'
      }
    });
  }

  /**
   * Generate analytics for a table
   */
  async generateAnalytics(tableId: string, days: number = 7): Promise<{
    totalOperations: number;
    totalEntropyUsed: number;
    operationBreakdown: Record<string, number>;
    dailyStats: Array<{
      date: string;
      operations: number;
      entropyUsed: number;
    }>;
    suspiciousPatterns: string[];
  }> {
    const endTime = Date.now();
    const startTime = endTime - (days * 24 * 60 * 60 * 1000);
    
    const logs = await this.getAuditLogs(tableId, startTime, endTime, 10000);
    
    // Calculate statistics
    const operationBreakdown: Record<string, number> = {};
    const dailyStats: Map<string, { operations: number; entropyUsed: number }> = new Map();
    let totalEntropyUsed = 0;

    for (const log of logs) {
      // Operation breakdown
      operationBreakdown[log.operation] = (operationBreakdown[log.operation] || 0) + 1;
      
      // Entropy total
      totalEntropyUsed += log.entropyUsed || 0;
      
      // Daily stats
      const date = new Date(log.timestamp).toISOString().split('T')[0];
      const dayStats = dailyStats.get(date) || { operations: 0, entropyUsed: 0 };
      dayStats.operations++;
      dayStats.entropyUsed += log.entropyUsed || 0;
      dailyStats.set(date, dayStats);
    }

    // Detect suspicious patterns
    const suspiciousPatterns = this.detectSuspiciousPatterns(logs);

    return {
      totalOperations: logs.length,
      totalEntropyUsed,
      operationBreakdown,
      dailyStats: Array.from(dailyStats.entries()).map(([date, stats]) => ({
        date,
        ...stats
      })),
      suspiciousPatterns
    };
  }

  /**
   * Clean up old audit logs
   */
  async cleanupOldLogs(): Promise<number> {
    const cutoffTime = Date.now() - (RNGAuditStorage.RETENTION_DAYS * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    // List all objects with the batch prefix
    const listed = await this.bucket.list({
      prefix: RNGAuditStorage.BATCH_PREFIX,
      limit: 1000
    });

    for (const object of listed.objects) {
      const metadata = object.customMetadata;
      if (metadata?.timestamp && parseInt(metadata.timestamp) < cutoffTime) {
        await this.bucket.delete(object.key);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Export audit logs for compliance
   */
  async exportForCompliance(
    tableId: string,
    startDate: Date,
    endDate: Date
  ): Promise<string> {
    const logs = await this.getAuditLogs(
      tableId,
      startDate.getTime(),
      endDate.getTime(),
      100000
    );

    const exportData = {
      exportId: crypto.randomUUID(),
      exportDate: new Date().toISOString(),
      tableId,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      logCount: logs.length,
      logs: logs.map(log => ({
        ...log,
        timestamp: new Date(log.timestamp).toISOString()
      }))
    };

    const key = `compliance-export/${tableId}/${exportData.exportId}.json`;
    await this.bucket.put(key, JSON.stringify(exportData), {
      httpMetadata: {
        contentType: 'application/json',
        contentDisposition: `attachment; filename="rng-audit-${tableId}-${exportData.exportId}.json"`
      }
    });

    return key;
  }

  /**
   * Private helper methods
   */
  private generateBatchSummary(logs: AuditLog[]) {
    const operationTypes: Record<string, number> = {};
    let totalEntropyUsed = 0;
    let minTime = Infinity;
    let maxTime = -Infinity;

    for (const log of logs) {
      operationTypes[log.operation] = (operationTypes[log.operation] || 0) + 1;
      totalEntropyUsed += log.entropyUsed || 0;
      minTime = Math.min(minTime, log.timestamp);
      maxTime = Math.max(maxTime, log.timestamp);
    }

    return {
      operationCount: logs.length,
      totalEntropyUsed,
      operationTypes,
      timeRange: {
        start: minTime,
        end: maxTime
      }
    };
  }

  private async updateIndex(
    tableId: string,
    batchId: string,
    logCount: number,
    key: string
  ): Promise<void> {
    const date = new Date().toISOString().split('T')[0];
    const indexKey = `${RNGAuditStorage.INDEX_PREFIX}${tableId}/${date}.json`;

    // Get existing index or create new
    let index: AuditIndex;
    try {
      const existing = await this.bucket.get(indexKey);
      if (existing) {
        const text = await existing.text();
        index = JSON.parse(text);
      } else {
        index = { tableId, date, batches: [] };
      }
    } catch {
      index = { tableId, date, batches: [] };
    }

    // Add new batch
    index.batches.push({
      batchId,
      timestamp: Date.now(),
      logCount,
      key
    });

    // Sort by timestamp
    index.batches.sort((a, b) => a.timestamp - b.timestamp);

    // Store updated index
    await this.bucket.put(indexKey, JSON.stringify(index), {
      httpMetadata: {
        contentType: 'application/json'
      }
    });
  }

  private async getBatchesInRange(
    tableId: string,
    startTime: number,
    endTime: number
  ): Promise<Array<{ key: string; timestamp: number }>> {
    const batches: Array<{ key: string; timestamp: number }> = [];
    
    // Calculate date range
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const indexKey = `${RNGAuditStorage.INDEX_PREFIX}${tableId}/${dateStr}.json`;
      
      try {
        const indexObj = await this.bucket.get(indexKey);
        if (indexObj) {
          const index: AuditIndex = JSON.parse(await indexObj.text());
          
          for (const batch of index.batches) {
            if (batch.timestamp >= startTime && batch.timestamp <= endTime) {
              batches.push({ key: batch.key, timestamp: batch.timestamp });
            }
          }
        }
      } catch {
        // Index doesn't exist for this date
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return batches;
  }

  private async getBatch(key: string): Promise<AuditBatch | null> {
    try {
      const obj = await this.bucket.get(key);
      if (obj) {
        return JSON.parse(await obj.text());
      }
    } catch {
      // Batch doesn't exist or is corrupted
    }
    return null;
  }

  private detectSuspiciousPatterns(logs: AuditLog[]): string[] {
    const patterns: string[] = [];
    
    // Pattern 1: Excessive operations in short time
    const timeWindows = new Map<number, number>();
    for (const log of logs) {
      const window = Math.floor(log.timestamp / 60000); // 1-minute windows
      timeWindows.set(window, (timeWindows.get(window) || 0) + 1);
    }
    
    for (const [window, count] of timeWindows) {
      if (count > 100) {
        patterns.push(`Excessive operations (${count}) in 1-minute window at ${new Date(window * 60000).toISOString()}`);
      }
    }

    // Pattern 2: Unusual entropy consumption
    const entropyByOperation = new Map<string, number[]>();
    for (const log of logs) {
      if (log.entropyUsed) {
        const values = entropyByOperation.get(log.operation) || [];
        values.push(log.entropyUsed);
        entropyByOperation.set(log.operation, values);
      }
    }

    for (const [operation, values] of entropyByOperation) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const outliers = values.filter(v => v > avg * 3 || v < avg / 3);
      if (outliers.length > values.length * 0.1) {
        patterns.push(`Unusual entropy consumption pattern for ${operation} operation`);
      }
    }

    // Pattern 3: Repeated identical operations
    const operationSequences = new Map<string, number>();
    for (let i = 1; i < logs.length; i++) {
      if (logs[i].operation === logs[i-1].operation) {
        const key = logs[i].operation;
        operationSequences.set(key, (operationSequences.get(key) || 0) + 1);
      }
    }

    for (const [operation, count] of operationSequences) {
      if (count > 50) {
        patterns.push(`Repeated ${operation} operations (${count} consecutive occurrences)`);
      }
    }

    return patterns;
  }
}