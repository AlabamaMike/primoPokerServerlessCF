import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { MultiplexedWebSocketManager, WebSocketChannel } from '../websocket-multiplexed';
import { createWebSocketMessage } from '@primo-poker/shared';
import { MockWebSocket } from './websocket-test-utils';

// Mock authentication manager
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

describe('WebSocket Multiplexing', () => {
  let manager: MultiplexedWebSocketManager;
  let mockWs: MockWebSocket;
  let mockRequest: Request;

  beforeEach(() => {
    manager = new MultiplexedWebSocketManager('test-secret');
    mockWs = new MockWebSocket() as any;
    mockRequest = new Request('ws://localhost?token=test-token&tableId=table-1');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Channel Management', () => {
    it('should support multiple channels on a single connection', async () => {
      await manager.handleConnection(mockWs as any, mockRequest);
      
      // Subscribe to multiple channels
      const subscribeGame = JSON.stringify(createWebSocketMessage('subscribe', {
        channel: WebSocketChannel.GAME,
        tableId: 'table-1',
      }));
      
      const subscribeLobby = JSON.stringify(createWebSocketMessage('subscribe', {
        channel: WebSocketChannel.LOBBY,
      }));
      
      const subscribeChat = JSON.stringify(createWebSocketMessage('subscribe', {
        channel: WebSocketChannel.CHAT,
        tableId: 'table-1',
      }));

      mockWs.receiveMessage(subscribeGame);
      mockWs.receiveMessage(subscribeLobby);
      mockWs.receiveMessage(subscribeChat);

      // Verify subscription confirmations
      expect(mockWs.sentMessages).toContainEqual(
        expect.stringContaining('"type":"subscription_confirmed"')
      );
      expect(mockWs.sentMessages).toContainEqual(
        expect.stringContaining('"channel":"game"')
      );
      expect(mockWs.sentMessages).toContainEqual(
        expect.stringContaining('"channel":"lobby"')
      );
      expect(mockWs.sentMessages).toContainEqual(
        expect.stringContaining('"channel":"chat"')
      );
    });

    it('should route messages to correct channel subscribers', async () => {
      // Create two connections
      const mockWs1 = new MockWebSocket() as any;
      const mockWs2 = new MockWebSocket() as any;
      
      await manager.handleConnection(mockWs1, mockRequest);
      await manager.handleConnection(mockWs2, new Request('ws://localhost?token=test-token2&tableId=table-1'));

      // WS1 subscribes to game channel only
      mockWs1.receiveMessage(JSON.stringify(createWebSocketMessage('subscribe', {
        channel: WebSocketChannel.GAME,
        tableId: 'table-1',
      })));

      // WS2 subscribes to chat channel only
      mockWs2.receiveMessage(JSON.stringify(createWebSocketMessage('subscribe', {
        channel: WebSocketChannel.CHAT,
        tableId: 'table-1',
      })));

      // Broadcast a game update
      manager.broadcastToChannel(WebSocketChannel.GAME, 'table-1', 
        createWebSocketMessage('game_update', { test: 'data' })
      );

      // Verify only WS1 received the game update
      const ws1GameMessages = mockWs1.sentMessages.filter(msg => 
        msg.includes('game_update')
      );
      const ws2GameMessages = mockWs2.sentMessages.filter(msg => 
        msg.includes('game_update')
      );

      expect(ws1GameMessages.length).toBe(1);
      expect(ws2GameMessages.length).toBe(0);
    });

    it('should handle channel unsubscription', async () => {
      await manager.handleConnection(mockWs as any, mockRequest);
      
      // Subscribe to game channel
      mockWs.receiveMessage(JSON.stringify(createWebSocketMessage('subscribe', {
        channel: WebSocketChannel.GAME,
        tableId: 'table-1',
      })));

      // Clear sent messages to ignore subscription confirmation
      mockWs.sentMessages = [];

      // Unsubscribe from game channel (include tableId for consistency)
      mockWs.receiveMessage(JSON.stringify(createWebSocketMessage('unsubscribe', {
        channel: WebSocketChannel.GAME,
        tableId: 'table-1',
      })));

      // Verify unsubscription confirmation
      expect(mockWs.sentMessages).toContainEqual(
        expect.stringContaining('"type":"unsubscription_confirmed"')
      );

      // Broadcast to game channel
      manager.broadcastToChannel(WebSocketChannel.GAME, 'table-1',
        createWebSocketMessage('game_update', { test: 'data' })
      );

      // Verify no game update received after unsubscription
      const gameMessages = mockWs.sentMessages.filter(msg => 
        msg.includes('game_update')
      );
      expect(gameMessages.length).toBe(0);
    });

    it('should support spectator channel with read-only access', async () => {
      mockRequest = new Request('ws://localhost?token=test-token&tableId=table-1&spectator=true');
      await manager.handleConnection(mockWs as any, mockRequest);

      // Subscribe to spectator channel
      mockWs.receiveMessage(JSON.stringify(createWebSocketMessage('subscribe', {
        channel: WebSocketChannel.SPECTATOR,
        tableId: 'table-1',
      })));

      // Try to send a player action (should be rejected)
      mockWs.receiveMessage(JSON.stringify(createWebSocketMessage('player_action', {
        action: 'bet',
        amount: 100,
      })));

      // Verify error message
      expect(mockWs.sentMessages).toContainEqual(
        expect.stringContaining('"type":"error"')
      );
      expect(mockWs.sentMessages).toContainEqual(
        expect.stringContaining('Spectators cannot perform game actions')
      );
    });

    it('should limit channel subscriptions per connection', async () => {
      await manager.handleConnection(mockWs as any, mockRequest);
      
      // Try to subscribe to more than the allowed number of channels
      const maxChannels = 10; // Assumed limit
      // Subscribe to different channel types to reach limit
      for (let i = 0; i < 5; i++) {
        mockWs.receiveMessage(JSON.stringify(createWebSocketMessage('subscribe', {
          channel: WebSocketChannel.CHAT,
          tableId: `table-${i}`,
        })));
      }
      for (let i = 0; i < 3; i++) {
        mockWs.receiveMessage(JSON.stringify(createWebSocketMessage('subscribe', {
          channel: WebSocketChannel.SPECTATOR,
          tableId: `table-${i}`,
        })));
      }
      // Add more to exceed limit
      for (let i = 0; i < 3; i++) {
        mockWs.receiveMessage(JSON.stringify(createWebSocketMessage('subscribe', {
          channel: WebSocketChannel.CHAT,
          tableId: `table-extra-${i}`,
        })));
      }

      // Verify error for exceeding channel limit
      const errorMessages = mockWs.sentMessages.filter(msg => 
        msg.includes('"type":"error"') && msg.includes('Maximum channel subscriptions exceeded')
      );
      expect(errorMessages.length).toBeGreaterThan(0);
    });
  });

  describe('Channel-specific Features', () => {
    it('should handle lobby updates globally', async () => {
      const mockWs1 = new MockWebSocket() as any;
      const mockWs2 = new MockWebSocket() as any;
      
      await manager.handleConnection(mockWs1, mockRequest);
      await manager.handleConnection(mockWs2, new Request('ws://localhost?token=test-token2&tableId=table-2'));

      // Both subscribe to lobby channel
      mockWs1.receiveMessage(JSON.stringify(createWebSocketMessage('subscribe', {
        channel: WebSocketChannel.LOBBY,
      })));
      mockWs2.receiveMessage(JSON.stringify(createWebSocketMessage('subscribe', {
        channel: WebSocketChannel.LOBBY,
      })));

      // Broadcast lobby update
      manager.broadcastToChannel(WebSocketChannel.LOBBY, null,
        createWebSocketMessage('lobby_update', {
          tables: [
            { id: 'table-1', players: 3, status: 'active' },
            { id: 'table-2', players: 2, status: 'waiting' },
          ],
        })
      );

      // Both connections should receive the update
      const ws1LobbyMessages = mockWs1.sentMessages.filter(msg => 
        msg.includes('lobby_update')
      );
      const ws2LobbyMessages = mockWs2.sentMessages.filter(msg => 
        msg.includes('lobby_update')
      );

      expect(ws1LobbyMessages.length).toBe(1);
      expect(ws2LobbyMessages.length).toBe(1);
    });

    it('should handle chat messages with rate limiting', async () => {
      await manager.handleConnection(mockWs as any, mockRequest);
      
      // Subscribe to chat channel
      mockWs.receiveMessage(JSON.stringify(createWebSocketMessage('subscribe', {
        channel: WebSocketChannel.CHAT,
        tableId: 'table-1',
      })));

      // Clear messages after subscription
      mockWs.sentMessages = [];

      // Send more than rate limit (30 per minute)
      const chatMessages = Array(35).fill(null).map((_, i) => 
        JSON.stringify(createWebSocketMessage('chat', {
          message: `Message ${i}`,
          tableId: 'table-1',
        }))
      );

      chatMessages.forEach(msg => mockWs.receiveMessage(msg));

      // Check for rate limit error
      const rateLimitErrors = mockWs.sentMessages.filter(msg => 
        msg.includes('"type":"error"') && msg.includes('Rate limit exceeded')
      );
      expect(rateLimitErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Channel Permissions', () => {
    it('should enforce channel-specific permissions', async () => {
      // Create a spectator connection
      const spectatorRequest = new Request('ws://localhost?token=spectator-token&tableId=table-1&role=spectator');
      await manager.handleConnection(mockWs as any, spectatorRequest);

      // Try to subscribe to game channel (should be denied)
      mockWs.receiveMessage(JSON.stringify(createWebSocketMessage('subscribe', {
        channel: WebSocketChannel.GAME,
        tableId: 'table-1',
      })));

      // Verify permission denied
      expect(mockWs.sentMessages).toContainEqual(
        expect.stringContaining('"type":"error"')
      );
      expect(mockWs.sentMessages).toContainEqual(
        expect.stringContaining('Insufficient permissions for channel')
      );
    });

    it('should allow admins to subscribe to admin channel', async () => {
      // Mock admin authentication
      const { AuthenticationManager } = jest.requireMock('@primo-poker/security');
      AuthenticationManager.mockImplementation(() => ({
        verifyAccessToken: jest.fn().mockResolvedValue({
          valid: true,
          payload: {
            userId: 'admin-user',
            username: 'admin',
            role: 'admin',
          },
        }),
      }));

      const adminManager = new MultiplexedWebSocketManager('test-secret');
      const adminRequest = new Request('ws://localhost?token=admin-token&tableId=table-1');
      await adminManager.handleConnection(mockWs as any, adminRequest);

      // Subscribe to admin channel
      mockWs.receiveMessage(JSON.stringify(createWebSocketMessage('subscribe', {
        channel: WebSocketChannel.ADMIN,
      })));

      // Verify successful subscription
      expect(mockWs.sentMessages).toContainEqual(
        expect.stringContaining('"channel":"admin"')
      );
      expect(mockWs.sentMessages).toContainEqual(
        expect.stringContaining('"type":"subscription_confirmed"')
      );
    });
  });
});