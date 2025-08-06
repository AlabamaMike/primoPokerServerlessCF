import { Logger } from '../logger';
import { LogAggregator, LogEntry } from '../types';

describe('Logger Race Condition Tests', () => {
  let logger: Logger;
  let mockAggregator: LogAggregator;
  let sentEntries: LogEntry[][] = [];

  beforeEach(() => {
    sentEntries = [];
    mockAggregator = {
      send: jest.fn(async (entries: LogEntry[]) => {
        // Simulate async delay to make race conditions more likely
        await new Promise(resolve => setTimeout(resolve, 10));
        sentEntries.push([...entries]);
      }),
    };

    logger = new Logger({ minLevel: 'info' });
    logger.setAggregator(mockAggregator);
  });

  it('should handle concurrent flush calls without duplicating entries', async () => {
    // Add some log entries
    logger.info('Message 1');
    logger.info('Message 2');
    logger.info('Message 3');

    // Call flush concurrently multiple times
    const flushPromises = [
      logger.flush(),
      logger.flush(),
      logger.flush(),
      logger.flush(),
      logger.flush(),
    ];

    // Wait for all flushes to complete
    await Promise.all(flushPromises);

    // Verify that entries were sent exactly once
    const allSentEntries = sentEntries.flat();
    expect(allSentEntries).toHaveLength(3);
    expect(allSentEntries.map(e => e.message)).toEqual([
      'Message 1',
      'Message 2',
      'Message 3',
    ]);
  });

  it('should not lose entries added during flush', async () => {
    // Add initial entries
    logger.info('Initial 1');
    logger.info('Initial 2');

    // Start flush and add more entries during it
    const flushPromise = logger.flush();
    
    // Add entries while flush is in progress
    logger.info('During flush 1');
    logger.info('During flush 2');

    await flushPromise;

    // Flush again to get the entries added during the first flush
    await logger.flush();

    // Verify all entries were eventually sent
    const allSentEntries = sentEntries.flat();
    expect(allSentEntries).toHaveLength(4);
    expect(allSentEntries.map(e => e.message).sort()).toEqual([
      'During flush 1',
      'During flush 2',
      'Initial 1',
      'Initial 2',
    ]);
  });

  it('should handle rapid logging and flushing', async () => {
    const operations: Promise<any>[] = [];

    // Simulate rapid concurrent operations
    for (let i = 0; i < 10; i++) {
      operations.push((async () => {
        logger.info(`Log ${i}`);
        if (i % 3 === 0) {
          await logger.flush();
        }
      })());
    }

    await Promise.all(operations);
    
    // Final flush to ensure all entries are sent
    await logger.flush();

    // Verify no entries were lost or duplicated
    const allSentEntries = sentEntries.flat();
    const uniqueMessages = new Set(allSentEntries.map(e => e.message));
    
    expect(uniqueMessages.size).toBe(10);
    expect(allSentEntries.length).toBe(10);
  });

  it('should return early if flush is already in progress', async () => {
    logger.info('Test message');

    // Mock aggregator with delay
    const slowAggregator: LogAggregator = {
      send: jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      }),
    };
    logger.setAggregator(slowAggregator);

    // Start first flush
    const firstFlush = logger.flush();

    // Try second flush immediately (should return early)
    const secondFlush = logger.flush();

    // Second flush should complete quickly
    const start = Date.now();
    await secondFlush;
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(50); // Should return immediately

    // Wait for first flush to complete
    await firstFlush;

    // Verify send was called only once
    expect(slowAggregator.send).toHaveBeenCalledTimes(1);
  });
});