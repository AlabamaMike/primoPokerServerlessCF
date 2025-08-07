import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { BatchingWebSocketManager, BatchingOptions } from '../websocket-batched';
import { createWebSocketMessage } from '@primo-poker/shared';
import { MockWebSocket } from './websocket-test-utils';

// Mock authentication
jest.mock('@primo-poker/security', () => ({
  AuthenticationManager: jest.fn().mockImplementation(() => ({
    verifyAccessToken: jest.fn().mockResolvedValue({
      valid: true,
      payload: {
        userId: 'test-user-id',
        username: 'testuser',
      },
    }),
  })),
}));

describe('WebSocket Message Batching', () => {
  let manager: BatchingWebSocketManager;
  let mockWs: MockWebSocket;
  let mockRequest: Request;

  beforeEach(() => {
    jest.useFakeTimers();
    const options: BatchingOptions = {
      batchWindow: 100, // 100ms
      maxBatchSize: 10,
      enableAdaptiveBatching: true,
    };
    manager = new BatchingWebSocketManager('test-secret', options);
    mockWs = new MockWebSocket() as any;
    mockRequest = new Request('ws://localhost?token=test-token&tableId=table-1');
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Basic Batching', () => {
    it('should batch multiple messages within the batch window', async () => {
      await manager.handleConnection(mockWs as any, mockRequest);
      
      // Send multiple messages quickly
      manager.queueMessage(mockWs as any, createWebSocketMessage('update1', { data: 1 }));
      manager.queueMessage(mockWs as any, createWebSocketMessage('update2', { data: 2 }));
      manager.queueMessage(mockWs as any, createWebSocketMessage('update3', { data: 3 }));
      
      // No messages sent yet
      expect(mockWs.sentMessages.length).toBe(0);
      
      // Advance time to trigger batch
      jest.advanceTimersByTime(100);
      
      // Should have sent one batched message
      expect(mockWs.sentMessages.length).toBe(1);
      
      const batch = JSON.parse(mockWs.sentMessages[0]);
      expect(batch.type).toBe('batch');
      expect(batch.payload.messages).toHaveLength(3);
      expect(batch.payload.messages[0].type).toBe('update1');
      expect(batch.payload.messages[1].type).toBe('update2');
      expect(batch.payload.messages[2].type).toBe('update3');
    });

    it('should respect max batch size', async () => {
      await manager.handleConnection(mockWs as any, mockRequest);
      
      // Send more messages than max batch size
      for (let i = 0; i < 15; i++) {
        manager.queueMessage(mockWs as any, createWebSocketMessage(`update${i}`, { data: i }));
      }
      
      // Should trigger immediate send when max size reached
      expect(mockWs.sentMessages.length).toBe(1);
      
      const firstBatch = JSON.parse(mockWs.sentMessages[0]);
      expect(firstBatch.payload.messages).toHaveLength(10); // max batch size
      
      // Advance time to send remaining messages
      jest.advanceTimersByTime(100);
      
      expect(mockWs.sentMessages.length).toBe(2);
      const secondBatch = JSON.parse(mockWs.sentMessages[1]);
      expect(secondBatch.payload.messages).toHaveLength(5); // remaining messages
    });

    it('should handle high-priority messages immediately', async () => {
      await manager.handleConnection(mockWs as any, mockRequest);
      
      // Queue some normal messages
      manager.queueMessage(mockWs as any, createWebSocketMessage('update1', { data: 1 }));
      manager.queueMessage(mockWs as any, createWebSocketMessage('update2', { data: 2 }));
      
      // Send high-priority message
      manager.sendImmediate(mockWs as any, createWebSocketMessage('player_action', {
        action: 'bet',
        amount: 100,
      }));
      
      // High-priority message sent immediately
      expect(mockWs.sentMessages.length).toBe(1);
      const immediateMsg = JSON.parse(mockWs.sentMessages[0]);
      expect(immediateMsg.type).toBe('player_action');
      
      // Advance time to send batched messages
      jest.advanceTimersByTime(100);
      
      expect(mockWs.sentMessages.length).toBe(2);
      const batch = JSON.parse(mockWs.sentMessages[1]);
      expect(batch.payload.messages).toHaveLength(2);
    });
  });

  describe('Adaptive Batching', () => {
    it('should adjust batch window based on message frequency', async () => {
      await manager.handleConnection(mockWs as any, mockRequest);
      
      // Send messages at high frequency
      for (let i = 0; i < 20; i++) {
        manager.queueMessage(mockWs as any, createWebSocketMessage(`update${i}`, { data: i }));
        jest.advanceTimersByTime(5); // 5ms between messages
      }
      
      // Get current batching config
      const config = manager.getBatchingConfig(mockWs as any);
      expect(config.currentWindow).toBeLessThan(100); // Should have decreased
    });

    it('should increase batch window for low frequency messages', async () => {
      await manager.handleConnection(mockWs as any, mockRequest);
      
      // Send messages at low frequency
      for (let i = 0; i < 5; i++) {
        manager.queueMessage(mockWs as any, createWebSocketMessage(`update${i}`, { data: i }));
        jest.advanceTimersByTime(500); // 500ms between messages
      }
      
      const config = manager.getBatchingConfig(mockWs as any);
      expect(config.currentWindow).toBeGreaterThan(100); // Should have increased
    });

    it('should optimize batching per connection', async () => {
      const mockWs1 = new MockWebSocket() as any;
      const mockWs2 = new MockWebSocket() as any;
      
      await manager.handleConnection(mockWs1, mockRequest);
      await manager.handleConnection(mockWs2, new Request('ws://localhost?token=test-token2&tableId=table-1'));
      
      // WS1: High frequency messages
      for (let i = 0; i < 10; i++) {
        manager.queueMessage(mockWs1, createWebSocketMessage(`update${i}`, { data: i }));
      }
      
      // WS2: Low frequency messages
      manager.queueMessage(mockWs2, createWebSocketMessage('update1', { data: 1 }));
      jest.advanceTimersByTime(200);
      manager.queueMessage(mockWs2, createWebSocketMessage('update2', { data: 2 }));
      
      // Check different batching configs
      const config1 = manager.getBatchingConfig(mockWs1);
      const config2 = manager.getBatchingConfig(mockWs2);
      
      expect(config1.currentWindow).not.toEqual(config2.currentWindow);
    });
  });

  describe('Message Priority', () => {
    it('should handle priority levels correctly', async () => {
      await manager.handleConnection(mockWs as any, mockRequest);
      
      // Queue messages with different priorities
      manager.queueMessage(mockWs as any, createWebSocketMessage('chat', { message: 'hello' }), { priority: 1 });
      manager.queueMessage(mockWs as any, createWebSocketMessage('game_update', { pot: 100 }), { priority: 3 });
      manager.queueMessage(mockWs as any, createWebSocketMessage('player_action', { action: 'bet' }), { priority: 5 });
      
      // Advance time to trigger batch
      jest.advanceTimersByTime(100);
      
      // Messages should be ordered by priority (highest first)
      const batch = JSON.parse(mockWs.sentMessages[0]);
      expect(batch.payload.messages[0].type).toBe('player_action'); // priority 5
      expect(batch.payload.messages[1].type).toBe('game_update');   // priority 3
      expect(batch.payload.messages[2].type).toBe('chat');          // priority 1
    });

    it('should flush high-priority messages immediately', async () => {
      await manager.handleConnection(mockWs as any, mockRequest);
      
      // Queue low priority messages
      manager.queueMessage(mockWs as any, createWebSocketMessage('chat1', { message: 'hi' }), { priority: 1 });
      manager.queueMessage(mockWs as any, createWebSocketMessage('chat2', { message: 'bye' }), { priority: 1 });
      
      // Queue critical priority message
      manager.queueMessage(mockWs as any, createWebSocketMessage('disconnect_warning', {
        reason: 'timeout'
      }), { priority: 10 }); // Critical priority
      
      // Should flush all messages immediately
      expect(mockWs.sentMessages.length).toBe(1);
      const batch = JSON.parse(mockWs.sentMessages[0]);
      expect(batch.payload.messages).toHaveLength(3);
      expect(batch.payload.messages[0].type).toBe('disconnect_warning');
    });
  });

  describe('Batch Deduplication', () => {
    it('should deduplicate identical messages in a batch', async () => {
      manager = new BatchingWebSocketManager('test-secret', {
        batchWindow: 100,
        enableDeduplication: true,
      });
      
      await manager.handleConnection(mockWs as any, mockRequest);
      
      // Queue duplicate messages
      const gameUpdate = createWebSocketMessage('game_update', { pot: 100 });
      manager.queueMessage(mockWs as any, gameUpdate);
      manager.queueMessage(mockWs as any, gameUpdate);
      manager.queueMessage(mockWs as any, gameUpdate);
      
      // Different message
      manager.queueMessage(mockWs as any, createWebSocketMessage('game_update', { pot: 200 }));
      
      jest.advanceTimersByTime(100);
      
      // Should have deduplicated
      const batch = JSON.parse(mockWs.sentMessages[0]);
      expect(batch.payload.messages).toHaveLength(2); // Only unique messages
    });

    it('should preserve order when deduplicating', async () => {
      manager = new BatchingWebSocketManager('test-secret', {
        batchWindow: 100,
        enableDeduplication: true,
      });
      
      await manager.handleConnection(mockWs as any, mockRequest);
      
      // Queue messages with duplicates
      manager.queueMessage(mockWs as any, createWebSocketMessage('update1', { data: 1 }));
      manager.queueMessage(mockWs as any, createWebSocketMessage('update2', { data: 2 }));
      manager.queueMessage(mockWs as any, createWebSocketMessage('update1', { data: 1 })); // duplicate
      manager.queueMessage(mockWs as any, createWebSocketMessage('update3', { data: 3 }));
      
      jest.advanceTimersByTime(100);
      
      const batch = JSON.parse(mockWs.sentMessages[0]);
      expect(batch.payload.messages).toHaveLength(3);
      expect(batch.payload.messages[0].type).toBe('update1');
      expect(batch.payload.messages[1].type).toBe('update2');
      expect(batch.payload.messages[2].type).toBe('update3');
    });
  });

  describe('Batch Metrics', () => {
    it('should track batching statistics', async () => {
      await manager.handleConnection(mockWs as any, mockRequest);
      
      // Send various messages
      for (let i = 0; i < 20; i++) {
        manager.queueMessage(mockWs as any, createWebSocketMessage(`update${i}`, { data: i }));
        if (i % 5 === 0) {
          jest.advanceTimersByTime(100); // Trigger batch
        }
      }
      
      const stats = manager.getBatchingStats();
      expect(stats.totalMessages).toBe(20);
      expect(stats.totalBatches).toBeGreaterThan(0);
      expect(stats.averageBatchSize).toBeGreaterThan(1);
      expect(stats.compressionRatio).toBeDefined();
    });

    it('should track per-connection batching metrics', async () => {
      const mockWs1 = new MockWebSocket() as any;
      const mockWs2 = new MockWebSocket() as any;
      
      await manager.handleConnection(mockWs1, mockRequest);
      await manager.handleConnection(mockWs2, new Request('ws://localhost?token=test-token2&tableId=table-1'));
      
      // Different patterns for each connection
      for (let i = 0; i < 10; i++) {
        manager.queueMessage(mockWs1, createWebSocketMessage(`update${i}`, { data: i }));
      }
      jest.advanceTimersByTime(100);
      
      manager.queueMessage(mockWs2, createWebSocketMessage('single', { data: 1 }));
      jest.advanceTimersByTime(100);
      
      const stats1 = manager.getConnectionBatchingStats(mockWs1);
      const stats2 = manager.getConnectionBatchingStats(mockWs2);
      
      expect(stats1.averageBatchSize).toBeGreaterThan(stats2.averageBatchSize);
    });
  });

  describe('Error Handling', () => {
    it('should handle send failures gracefully', async () => {
      await manager.handleConnection(mockWs as any, mockRequest);
      
      // Mock send failure
      mockWs.send = jest.fn().mockImplementation(() => {
        throw new Error('Send failed');
      });
      
      // Queue messages
      manager.queueMessage(mockWs as any, createWebSocketMessage('update1', { data: 1 }));
      manager.queueMessage(mockWs as any, createWebSocketMessage('update2', { data: 2 }));
      
      // Trigger batch
      jest.advanceTimersByTime(100);
      
      // Should have attempted to send
      expect(mockWs.send).toHaveBeenCalled();
      
      // Check error was handled
      const errors = manager.getErrorStats();
      expect(errors.sendFailures).toBeGreaterThan(0);
    });

    it('should handle connection close during batching', async () => {
      await manager.handleConnection(mockWs as any, mockRequest);
      
      // Queue messages
      manager.queueMessage(mockWs as any, createWebSocketMessage('update1', { data: 1 }));
      manager.queueMessage(mockWs as any, createWebSocketMessage('update2', { data: 2 }));
      
      // Close connection
      mockWs.readyState = 3; // CLOSED
      mockWs.dispatchEvent('close');
      
      // Trigger batch timer
      jest.advanceTimersByTime(100);
      
      // Should not attempt to send
      expect(mockWs.sentMessages.length).toBe(0);
    });
  });
});