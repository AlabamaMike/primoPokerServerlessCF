import { CacheDO } from '../cache-do';

// Mock logger
jest.mock('@primo-poker/core', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock DurableObjectState
class MockDurableObjectState {
  storage = {
    put: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(true),
    setAlarm: jest.fn().mockResolvedValue(undefined),
    getAlarm: jest.fn().mockResolvedValue(null),
  };
}

// Mock Environment
const mockEnv = {} as any;

describe('CacheDO', () => {
  let cacheDO: CacheDO;
  let mockState: MockDurableObjectState;

  beforeEach(() => {
    jest.clearAllMocks();
    mockState = new MockDurableObjectState();
    cacheDO = new CacheDO(mockState as any, mockEnv);
  });

  describe('Basic Operations', () => {
    it('should set and get a value', async () => {
      // Set value
      const setRequest = new Request('http://localhost/set', {
        method: 'POST',
        body: JSON.stringify({ key: 'test-key', value: 'test-value' }),
      });
      
      const setResponse = await cacheDO.fetch(setRequest);
      const setResult = await setResponse.json();
      expect(setResult).toEqual({ success: true });

      // Get value
      const getRequest = new Request('http://localhost/get', {
        method: 'POST',
        body: JSON.stringify({ key: 'test-key' }),
      });
      
      const getResponse = await cacheDO.fetch(getRequest);
      const getResult = await getResponse.json();
      expect(getResult).toEqual({ value: 'test-value', found: true });
    });

    it('should return null for non-existent key', async () => {
      const request = new Request('http://localhost/get', {
        method: 'POST',
        body: JSON.stringify({ key: 'non-existent' }),
      });
      
      const response = await cacheDO.fetch(request);
      const result = await response.json();
      expect(result).toEqual({ value: null, found: false });
    });

    it('should delete a value', async () => {
      // Set value first
      await cacheDO.fetch(new Request('http://localhost/set', {
        method: 'POST',
        body: JSON.stringify({ key: 'test-key', value: 'test-value' }),
      }));

      // Delete value
      const deleteRequest = new Request('http://localhost/delete', {
        method: 'POST',
        body: JSON.stringify({ key: 'test-key' }),
      });
      
      const deleteResponse = await cacheDO.fetch(deleteRequest);
      const deleteResult = await deleteResponse.json();
      expect(deleteResult).toEqual({ deleted: true });

      // Verify it's gone
      const getRequest = new Request('http://localhost/get', {
        method: 'POST',
        body: JSON.stringify({ key: 'test-key' }),
      });
      
      const getResponse = await cacheDO.fetch(getRequest);
      const getResult = await getResponse.json();
      expect(getResult).toEqual({ value: null, found: false });
    });

    it('should check if key exists', async () => {
      // Set value
      await cacheDO.fetch(new Request('http://localhost/set', {
        method: 'POST',
        body: JSON.stringify({ key: 'test-key', value: 'test-value' }),
      }));

      // Check exists
      const hasRequest = new Request('http://localhost/has', {
        method: 'POST',
        body: JSON.stringify({ key: 'test-key' }),
      });
      
      const hasResponse = await cacheDO.fetch(hasRequest);
      const hasResult = await hasResponse.json();
      expect(hasResult).toEqual({ exists: true });

      // Check non-existent
      const notExistsRequest = new Request('http://localhost/has', {
        method: 'POST',
        body: JSON.stringify({ key: 'non-existent' }),
      });
      
      const notExistsResponse = await cacheDO.fetch(notExistsRequest);
      const notExistsResult = await notExistsResponse.json();
      expect(notExistsResult).toEqual({ exists: false });
    });

    it('should clear all entries', async () => {
      // Set multiple values
      await cacheDO.fetch(new Request('http://localhost/set', {
        method: 'POST',
        body: JSON.stringify({ key: 'key1', value: 'value1' }),
      }));
      await cacheDO.fetch(new Request('http://localhost/set', {
        method: 'POST',
        body: JSON.stringify({ key: 'key2', value: 'value2' }),
      }));

      // Clear all
      const clearRequest = new Request('http://localhost/clear', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      
      const clearResponse = await cacheDO.fetch(clearRequest);
      const clearResult = await clearResponse.json();
      expect(clearResult).toEqual({ success: true });

      // Verify both are gone
      const get1 = await cacheDO.fetch(new Request('http://localhost/get', {
        method: 'POST',
        body: JSON.stringify({ key: 'key1' }),
      }));
      const result1 = await get1.json();
      expect(result1.found).toBe(false);

      const get2 = await cacheDO.fetch(new Request('http://localhost/get', {
        method: 'POST',
        body: JSON.stringify({ key: 'key2' }),
      }));
      const result2 = await get2.json();
      expect(result2.found).toBe(false);
    });
  });

  describe('TTL Support', () => {
    it('should respect custom TTL', async () => {
      // Set with 100ms TTL
      await cacheDO.fetch(new Request('http://localhost/set', {
        method: 'POST',
        body: JSON.stringify({ key: 'ttl-key', value: 'ttl-value', ttl: 100 }),
      }));

      // Should exist immediately
      const get1 = await cacheDO.fetch(new Request('http://localhost/get', {
        method: 'POST',
        body: JSON.stringify({ key: 'ttl-key' }),
      }));
      const result1 = await get1.json();
      expect(result1.found).toBe(true);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be expired
      const get2 = await cacheDO.fetch(new Request('http://localhost/get', {
        method: 'POST',
        body: JSON.stringify({ key: 'ttl-key' }),
      }));
      const result2 = await get2.json();
      expect(result2.found).toBe(false);
    });
  });

  describe('Namespace Support', () => {
    it('should isolate values by namespace', async () => {
      // Set same key in different namespaces
      await cacheDO.fetch(new Request('http://localhost/set', {
        method: 'POST',
        body: JSON.stringify({ key: 'test-key', value: 'ns1-value', namespace: 'ns1' }),
      }));
      await cacheDO.fetch(new Request('http://localhost/set', {
        method: 'POST',
        body: JSON.stringify({ key: 'test-key', value: 'ns2-value', namespace: 'ns2' }),
      }));

      // Get from ns1
      const get1 = await cacheDO.fetch(new Request('http://localhost/get', {
        method: 'POST',
        body: JSON.stringify({ key: 'test-key', namespace: 'ns1' }),
      }));
      const result1 = await get1.json();
      expect(result1.value).toBe('ns1-value');

      // Get from ns2
      const get2 = await cacheDO.fetch(new Request('http://localhost/get', {
        method: 'POST',
        body: JSON.stringify({ key: 'test-key', namespace: 'ns2' }),
      }));
      const result2 = await get2.json();
      expect(result2.value).toBe('ns2-value');
    });

    it('should clear only namespace entries', async () => {
      // Set values in different namespaces
      await cacheDO.fetch(new Request('http://localhost/set', {
        method: 'POST',
        body: JSON.stringify({ key: 'key1', value: 'value1', namespace: 'ns1' }),
      }));
      await cacheDO.fetch(new Request('http://localhost/set', {
        method: 'POST',
        body: JSON.stringify({ key: 'key2', value: 'value2', namespace: 'ns2' }),
      }));

      // Clear ns1
      await cacheDO.fetch(new Request('http://localhost/clear', {
        method: 'POST',
        body: JSON.stringify({ namespace: 'ns1' }),
      }));

      // ns1 should be gone
      const get1 = await cacheDO.fetch(new Request('http://localhost/get', {
        method: 'POST',
        body: JSON.stringify({ key: 'key1', namespace: 'ns1' }),
      }));
      const result1 = await get1.json();
      expect(result1.found).toBe(false);

      // ns2 should still exist
      const get2 = await cacheDO.fetch(new Request('http://localhost/get', {
        method: 'POST',
        body: JSON.stringify({ key: 'key2', namespace: 'ns2' }),
      }));
      const result2 = await get2.json();
      expect(result2.found).toBe(true);
    });
  });

  describe('Batch Operations', () => {
    it('should handle batch set and get operations', async () => {
      const batchRequest = new Request('http://localhost/batch', {
        method: 'POST',
        body: JSON.stringify({
          operations: [
            { key: 'batch1', value: 'value1' },
            { key: 'batch2', value: 'value2' },
            { key: 'batch3', value: 'value3' },
          ],
        }),
      });

      const batchResponse = await cacheDO.fetch(batchRequest);
      const batchResult = await batchResponse.json();
      
      expect(batchResult.results).toHaveLength(3);
      expect(batchResult.results[0]).toEqual({ key: 'batch1', success: true });
      expect(batchResult.results[1]).toEqual({ key: 'batch2', success: true });
      expect(batchResult.results[2]).toEqual({ key: 'batch3', success: true });

      // Batch get
      const getBatchRequest = new Request('http://localhost/batch', {
        method: 'POST',
        body: JSON.stringify({
          operations: [
            { key: 'batch1' },
            { key: 'batch2' },
            { key: 'non-existent' },
          ],
        }),
      });

      const getBatchResponse = await cacheDO.fetch(getBatchRequest);
      const getBatchResult = await getBatchResponse.json();
      
      expect(getBatchResult.results).toHaveLength(3);
      expect(getBatchResult.results[0]).toEqual({ key: 'batch1', value: 'value1', found: true });
      expect(getBatchResult.results[1]).toEqual({ key: 'batch2', value: 'value2', found: true });
      expect(getBatchResult.results[2]).toEqual({ key: 'non-existent', value: null, found: false });
    });
  });

  describe('Cache Warming', () => {
    it('should warm lobby cache with 5 minute TTL', async () => {
      const warmRequest = new Request('http://localhost/warm', {
        method: 'POST',
        body: JSON.stringify({
          type: 'lobby',
          data: [
            { id: 'table1', name: 'Table 1' },
            { id: 'table2', name: 'Table 2' },
          ],
        }),
      });

      const warmResponse = await cacheDO.fetch(warmRequest);
      const warmResult = await warmResponse.json();
      expect(warmResult).toEqual({ success: true, warmed: 2 });

      // Verify data is cached
      const getRequest = new Request('http://localhost/get', {
        method: 'POST',
        body: JSON.stringify({ key: 'lobby:table1' }),
      });
      
      const getResponse = await cacheDO.fetch(getRequest);
      const getResult = await getResponse.json();
      expect(getResult.value).toEqual({ id: 'table1', name: 'Table 1' });
    });

    it('should warm player cache with 1 hour TTL', async () => {
      const warmRequest = new Request('http://localhost/warm', {
        method: 'POST',
        body: JSON.stringify({
          type: 'player',
          data: [
            { id: 'player1', username: 'Player 1' },
            { id: 'player2', username: 'Player 2' },
          ],
        }),
      });

      const warmResponse = await cacheDO.fetch(warmRequest);
      const warmResult = await warmResponse.json();
      expect(warmResult).toEqual({ success: true, warmed: 2 });

      // Verify data is cached
      const getRequest = new Request('http://localhost/get', {
        method: 'POST',
        body: JSON.stringify({ key: 'player:player1' }),
      });
      
      const getResponse = await cacheDO.fetch(getRequest);
      const getResult = await getResponse.json();
      expect(getResult.value).toEqual({ id: 'player1', username: 'Player 1' });
    });
  });

  describe('Statistics', () => {
    it('should return cache statistics', async () => {
      // Set some values
      await cacheDO.fetch(new Request('http://localhost/set', {
        method: 'POST',
        body: JSON.stringify({ key: 'key1', value: 'value1', namespace: 'ns1' }),
      }));
      await cacheDO.fetch(new Request('http://localhost/set', {
        method: 'POST',
        body: JSON.stringify({ key: 'key2', value: 'value2', namespace: 'ns1' }),
      }));
      await cacheDO.fetch(new Request('http://localhost/set', {
        method: 'POST',
        body: JSON.stringify({ key: 'key3', value: 'value3', namespace: 'ns2' }),
      }));

      // Some hits and misses
      await cacheDO.fetch(new Request('http://localhost/get', {
        method: 'POST',
        body: JSON.stringify({ key: 'key1', namespace: 'ns1' }),
      }));
      await cacheDO.fetch(new Request('http://localhost/get', {
        method: 'POST',
        body: JSON.stringify({ key: 'non-existent' }),
      }));

      const statsRequest = new Request('http://localhost/stats', {
        method: 'GET',
      });
      
      const statsResponse = await cacheDO.fetch(statsRequest);
      const stats = await statsResponse.json();
      
      expect(stats.totalEntries).toBe(3);
      expect(stats.namespaceStats).toEqual({ ns1: 2, ns2: 1 });
      expect(stats.hitRate).toBeGreaterThan(0);
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid routes', async () => {
      const request = new Request('http://localhost/invalid', {
        method: 'POST',
      });
      
      const response = await cacheDO.fetch(request);
      expect(response.status).toBe(404);
    });

    it('should handle invalid JSON', async () => {
      const request = new Request('http://localhost/set', {
        method: 'POST',
        body: 'invalid json',
      });
      
      const response = await cacheDO.fetch(request);
      expect(response.status).toBe(500);
    });
  });

  describe('Persistence', () => {
    it('should persist state', async () => {
      // Set a value
      await cacheDO.fetch(new Request('http://localhost/set', {
        method: 'POST',
        body: JSON.stringify({ key: 'persist-key', value: 'persist-value' }),
      }));

      // Verify storage.put was called
      expect(mockState.storage.put).toHaveBeenCalled();
    });

    it('should load persisted state on initialize', async () => {
      // Mock persisted data
      mockState.storage.get.mockImplementation((key) => {
        if (key === 'cache') {
          return Promise.resolve([['test-key', {
            value: 'test-value',
            ttl: 300000,
            createdAt: Date.now(),
            lastAccessed: Date.now(),
          }]]);
        }
        return Promise.resolve(null);
      });

      await cacheDO.initialize();

      // Verify data is loaded
      const getRequest = new Request('http://localhost/get', {
        method: 'POST',
        body: JSON.stringify({ key: 'test-key' }),
      });
      
      const getResponse = await cacheDO.fetch(getRequest);
      const getResult = await getResponse.json();
      expect(getResult.value).toBe('test-value');
    });
  });

  describe('Alarm (Cleanup)', () => {
    it('should clean up expired entries', async () => {
      // Set values with short TTL
      await cacheDO.fetch(new Request('http://localhost/set', {
        method: 'POST',
        body: JSON.stringify({ key: 'expire1', value: 'value1', ttl: 1 }),
      }));
      await cacheDO.fetch(new Request('http://localhost/set', {
        method: 'POST',
        body: JSON.stringify({ key: 'keep', value: 'value2', ttl: 300000 }),
      }));

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      // Run alarm
      await cacheDO.alarm();

      // Expired entry should be gone
      const get1 = await cacheDO.fetch(new Request('http://localhost/get', {
        method: 'POST',
        body: JSON.stringify({ key: 'expire1' }),
      }));
      const result1 = await get1.json();
      expect(result1.found).toBe(false);

      // Non-expired entry should remain
      const get2 = await cacheDO.fetch(new Request('http://localhost/get', {
        method: 'POST',
        body: JSON.stringify({ key: 'keep' }),
      }));
      const result2 = await get2.json();
      expect(result2.found).toBe(true);

      // Should schedule next alarm
      expect(mockState.storage.setAlarm).toHaveBeenCalled();
    });
  });
});