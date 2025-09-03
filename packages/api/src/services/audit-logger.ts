/**
 * Audit Logger Service
 * 
 * Provides persistent audit logging for wallet operations
 * using Cloudflare KV for storage
 */

import { logger } from '@primo-poker/core';

export interface AuditLogEntry {
  timestamp: number;
  userId: string;
  username?: string;
  action: string;
  amount: number;
  status: 'pending' | 'success' | 'failed';
  ip: string;
  userAgent: string;
  correlationId: string;
  details?: Record<string, any>;
}

export class AuditLogger {
  private kv: KVNamespace | null = null;
  private buffer: AuditLogEntry[] = [];
  private flushInterval: number = 5000; // 5 seconds
  private maxBufferSize: number = 100;

  constructor(kv?: KVNamespace) {
    this.kv = kv || null;
  }

  /**
   * Log an audit entry
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      // Always log to console for immediate visibility
      logger.info('Wallet audit log', entry);

      // Add to buffer for batch persistence
      this.buffer.push(entry);

      // If we have KV storage available, persist the log
      if (this.kv) {
        // Check if buffer should be flushed
        if (this.buffer.length >= this.maxBufferSize) {
          await this.flush();
        }
      }
    } catch (error) {
      logger.error('Failed to write audit log', error as Error);
    }
  }

  /**
   * Flush buffered logs to persistent storage
   */
  async flush(): Promise<void> {
    if (!this.kv || this.buffer.length === 0) {
      return;
    }

    try {
      const timestamp = Date.now();
      const key = `audit:wallet:${timestamp}`;
      
      // Store logs in KV with 90 day retention
      await this.kv.put(key, JSON.stringify(this.buffer), {
        expirationTtl: 90 * 24 * 60 * 60, // 90 days
        metadata: {
          count: this.buffer.length,
          firstTimestamp: this.buffer[0].timestamp,
          lastTimestamp: this.buffer[this.buffer.length - 1].timestamp
        }
      });

      logger.debug('Flushed audit logs to KV', { count: this.buffer.length });
      
      // Clear buffer after successful flush
      this.buffer = [];
    } catch (error) {
      logger.error('Failed to flush audit logs', error as Error);
    }
  }

  /**
   * Query audit logs by user ID with pagination and date filtering
   */
  async queryByUser(
    userId: string, 
    options: {
      limit?: number;
      page?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{ logs: AuditLogEntry[]; totalCount: number; hasMore: boolean }> {
    if (!this.kv) {
      return { logs: [], totalCount: 0, hasMore: false };
    }

    const { 
      limit = 100, 
      page = 1,
      startDate,
      endDate = new Date()
    } = options;

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    try {
      // List all audit keys
      const list = await this.kv.list({ prefix: 'audit:wallet:' });
      const allUserEntries: AuditLogEntry[] = [];

      // Fetch and filter logs
      for (const key of list.keys) {
        // Extract timestamp from key
        const keyTimestamp = parseInt(key.name.split(':')[2]);
        
        // Skip if outside date range
        if (startDate && keyTimestamp < startDate.getTime()) {
          continue;
        }
        if (endDate && keyTimestamp > endDate.getTime()) {
          continue;
        }

        const data = await this.kv.get(key.name, { type: 'json' }) as AuditLogEntry[];
        if (data) {
          const userLogs = data.filter(log => {
            // Filter by user ID
            if (log.userId !== userId) return false;
            
            // Additional date filtering on individual entries
            if (startDate && log.timestamp < startDate.getTime()) return false;
            if (endDate && log.timestamp > endDate.getTime()) return false;
            
            return true;
          });
          allUserEntries.push(...userLogs);
        }
      }

      // Sort by timestamp descending
      allUserEntries.sort((a, b) => b.timestamp - a.timestamp);

      // Calculate total count before pagination
      const totalCount = allUserEntries.length;

      // Apply pagination
      const paginatedEntries = allUserEntries.slice(offset, offset + limit);

      return {
        logs: paginatedEntries,
        totalCount,
        hasMore: (offset + limit) < totalCount
      };
    } catch (error) {
      logger.error('Failed to query audit logs', error as Error);
      return { logs: [], totalCount: 0, hasMore: false };
    }
  }

  /**
   * Query audit logs by date range
   */
  async queryByDateRange(startDate: Date, endDate: Date): Promise<AuditLogEntry[]> {
    if (!this.kv) {
      return [];
    }

    const startTimestamp = startDate.getTime();
    const endTimestamp = endDate.getTime();

    try {
      const list = await this.kv.list({ 
        prefix: 'audit:wallet:',
        // KV list doesn't support range queries, so we filter after fetch
      });

      const entries: AuditLogEntry[] = [];

      for (const key of list.keys) {
        // Extract timestamp from key
        const keyTimestamp = parseInt(key.name.split(':')[2]);
        
        // Skip if outside date range
        if (keyTimestamp < startTimestamp || keyTimestamp > endTimestamp) {
          continue;
        }

        const data = await this.kv.get(key.name, { type: 'json' }) as AuditLogEntry[];
        if (data) {
          entries.push(...data);
        }
      }

      return entries.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      logger.error('Failed to query audit logs by date range', error as Error);
      return [];
    }
  }

  /**
   * Get audit statistics
   */
  async getStats(): Promise<{
    totalEntries: number;
    pendingFlush: number;
    oldestEntry?: Date;
    newestEntry?: Date;
  }> {
    const stats = {
      totalEntries: 0,
      pendingFlush: this.buffer.length,
      oldestEntry: undefined as Date | undefined,
      newestEntry: undefined as Date | undefined
    };

    if (!this.kv) {
      return stats;
    }

    try {
      const list = await this.kv.list({ prefix: 'audit:wallet:' });
      
      if (list.keys.length > 0) {
        // Get oldest (first) and newest (last) keys
        const oldestKey = list.keys[0].name;
        const newestKey = list.keys[list.keys.length - 1].name;
        
        const oldestTimestamp = parseInt(oldestKey.split(':')[2]);
        const newestTimestamp = parseInt(newestKey.split(':')[2]);
        
        stats.oldestEntry = new Date(oldestTimestamp);
        stats.newestEntry = new Date(newestTimestamp);
        
        // Count total entries
        for (const key of list.keys) {
          if (key.metadata && typeof key.metadata.count === 'number') {
            stats.totalEntries += key.metadata.count;
          }
        }
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get audit stats', error as Error);
      return stats;
    }
  }
}