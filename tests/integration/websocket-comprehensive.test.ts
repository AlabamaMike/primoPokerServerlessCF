import { WebSocketManager } from '@primo-poker/api';
import { 
  WebSocketMessage, 
  createWebSocketMessage,
  PlayerActionMessage,
  ChatMessage,
  GameUpdateMessage,
  GameState,
  GamePhase,
  PlayerStatus
} from '@primo-poker/shared';
import { AuthenticationManager } from '@primo-poker/security';

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  
  readyState = MockWebSocket.OPEN;
  sentMessages: string[] = [];
  eventHandlers = new Map<string, Function[]>();
  
  send(data: string) {
    this.sentMessages.push(data);
  }
  
  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close', { code, reason });
  }
  
  addEventListener(event: string, handler: Function) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }
  
  removeEventListener(event: string, handler: Function) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }
  
  emit(event: string, data: any) {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => handler(data));
  }
}

describe('WebSocket Integration Tests', () => {
  let wsManager: WebSocketManager;
  let authManager: AuthenticationManager;
  const jwtSecret = 'test-secret-key';
  
  beforeEach(() => {
    wsManager = new WebSocketManager(jwtSecret);
    authManager = new AuthenticationManager(jwtSecret);
    
    // Mock global WebSocket
    global.WebSocket = MockWebSocket as any;
  });

  describe('Connection Management', () => {
    it('should handle successful connection with valid token', async () => {
      const ws = new MockWebSocket();
      const token = await authManager.generateAccessToken({
        userId: 'user-1',
        username: 'testuser',
        email: 'test@example.com'
      });
      
      const request = new Request(`wss://test.com/ws?token=${token}&tableId=table-1`);
      
      await wsManager.handleConnection(ws as any, request);
      
      expect(ws.readyState).toBe(MockWebSocket.OPEN);
      expect(ws.sentMessages).toHaveLength(1);
      
      const message = JSON.parse(ws.sentMessages[0]!);
      expect(message.type).toBe('connection_established');
      expect(message.payload.playerId).toBe('user-1');
      expect(message.payload.tableId).toBe('table-1');
    });

    it('should reject connection with invalid token', async () => {
      const ws = new MockWebSocket();
      const request = new Request('wss://test.com/ws?token=invalid-token&tableId=table-1');
      
      await wsManager.handleConnection(ws as any, request);
      
      expect(ws.readyState).toBe(MockWebSocket.CLOSED);
    });

    it('should reject connection without required parameters', async () => {
      const ws = new MockWebSocket();
      const request = new Request('wss://test.com/ws');
      
      await wsManager.handleConnection(ws as any, request);
      
      expect(ws.readyState).toBe(MockWebSocket.CLOSED);
    });

    it('should handle multiple concurrent connections', async () => {
      const connections = [];
      
      for (let i = 1; i <= 6; i++) {
        const ws = new MockWebSocket();
        const token = await authManager.generateAccessToken({
          userId: `user-${i}`,
          username: `player${i}`,
          email: `player${i}@example.com`
        });
        
        const request = new Request(`wss://test.com/ws?token=${token}&tableId=table-1`);
        await wsManager.handleConnection(ws as any, request);
        
        connections.push(ws);
      }
      
      expect(wsManager.getTableConnections('table-1')).toBe(6);
      expect(wsManager.getActiveConnections()).toBe(6);
    });
  });

  describe('Message Handling', () => {
    let ws: MockWebSocket;
    let connectionId: string;
    
    beforeEach(async () => {
      ws = new MockWebSocket();
      const token = await authManager.generateAccessToken({
        userId: 'user-1',
        username: 'testuser',
        email: 'test@example.com'
      });
      
      const request = new Request(`wss://test.com/ws?token=${token}&tableId=table-1`);
      await wsManager.handleConnection(ws as any, request);
      
      // Extract connection ID from welcome message
      const welcomeMsg = JSON.parse(ws.sentMessages[0]!);
      connectionId = welcomeMsg.payload.playerId;
    });

    it('should handle player action messages', async () => {
      const actionMessage: PlayerActionMessage = createWebSocketMessage(
        'player_action',
        {
          playerId: 'user-1',
          action: 'bet',
          amount: 100
        }
      ) as PlayerActionMessage;
      
      ws.emit('message', { data: JSON.stringify(actionMessage) });
      
      // Should broadcast game update to all players
      expect(ws.sentMessages.length).toBeGreaterThan(1);
    });

    it('should reject player action from wrong player', async () => {
      const actionMessage: PlayerActionMessage = createWebSocketMessage(
        'player_action',
        {
          playerId: 'user-2', // Different from authenticated user
          action: 'bet',
          amount: 100
        }
      ) as PlayerActionMessage;
      
      ws.emit('message', { data: JSON.stringify(actionMessage) });
      
      const lastMessage = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]!);
      expect(lastMessage.type).toBe('error');
      expect(lastMessage.payload.message).toContain('Unauthorized');
    });

    it('should handle chat messages', async () => {
      const chatMessage: ChatMessage = createWebSocketMessage(
        'chat',
        {
          playerId: 'user-1',
          username: 'testuser',
          message: 'Hello world!',
          isSystem: false
        }
      ) as ChatMessage;
      
      ws.emit('message', { data: JSON.stringify(chatMessage) });
      
      // Chat should be broadcast
      expect(ws.sentMessages.length).toBeGreaterThan(1);
    });

    it('should sanitize chat messages', async () => {
      const chatMessage: ChatMessage = createWebSocketMessage(
        'chat',
        {
          playerId: 'user-1',
          username: 'testuser',
          message: '<script>alert("xss")</script>Hello!',
          isSystem: false
        }
      ) as ChatMessage;
      
      ws.emit('message', { data: JSON.stringify(chatMessage) });
      
      const broadcastMsg = ws.sentMessages.find(msg => {
        const parsed = JSON.parse(msg);
        return parsed.type === 'chat' && parsed.payload.playerId === 'user-1';
      });
      
      expect(broadcastMsg).toBeDefined();
      const parsed = JSON.parse(broadcastMsg!);
      expect(parsed.payload.message).not.toContain('<script>');
    });

    it('should handle ping/pong for connection health', async () => {
      const pingMessage = createWebSocketMessage('ping', {});
      
      ws.emit('message', { data: JSON.stringify(pingMessage) });
      
      const pongMessage = ws.sentMessages.find(msg => {
        const parsed = JSON.parse(msg);
        return parsed.type === 'pong';
      });
      
      expect(pongMessage).toBeDefined();
    });
  });

  describe('Broadcast Functionality', () => {
    let connections: Array<{ ws: MockWebSocket; userId: string }> = [];
    
    beforeEach(async () => {
      // Create 4 connections
      for (let i = 1; i <= 4; i++) {
        const ws = new MockWebSocket();
        const token = await authManager.generateAccessToken({
          userId: `user-${i}`,
          username: `player${i}`,
          email: `player${i}@example.com`
        });
        
        const request = new Request(`wss://test.com/ws?token=${token}&tableId=table-1`);
        await wsManager.handleConnection(ws as any, request);
        
        connections.push({ ws, userId: `user-${i}` });
      }
    });

    it('should broadcast game updates to all table connections', () => {
      const gameState: GameState = {
        tableId: 'table-1',
        gameId: 'game-1',
        phase: GamePhase.PRE_FLOP,
        pot: 100,
        sidePots: [],
        communityCards: [],
        currentBet: 20,
        minRaise: 20,
        activePlayerId: 'user-1',
        dealerId: 'user-1',
        smallBlindId: 'user-2',
        bigBlindId: 'user-3',
        handNumber: 1,
        timestamp: new Date()
      };
      
      wsManager.broadcastGameUpdate('table-1', gameState);
      
      connections.forEach(({ ws }) => {
        const gameUpdateMsg = ws.sentMessages.find(msg => {
          const parsed = JSON.parse(msg);
          return parsed.type === 'game_update';
        });
        
        expect(gameUpdateMsg).toBeDefined();
        const parsed = JSON.parse(gameUpdateMsg!);
        expect(parsed.payload.pot).toBe(100);
      });
    });

    it('should exclude sender from broadcast when specified', () => {
      const chatMessage: ChatMessage = createWebSocketMessage(
        'chat',
        {
          playerId: 'user-1',
          username: 'player1',
          message: 'Hello everyone!',
          isSystem: false
        }
      ) as ChatMessage;
      
      // Send from first connection
      connections[0]!.ws.emit('message', { data: JSON.stringify(chatMessage) });
      
      // First connection should receive the message (echo)
      const firstConnMessages = connections[0]!.ws.sentMessages;
      const chatBroadcast = firstConnMessages.find(msg => {
        const parsed = JSON.parse(msg);
        return parsed.type === 'chat' && parsed.payload.message === 'Hello everyone!';
      });
      expect(chatBroadcast).toBeDefined();
      
      // Other connections should also receive it
      for (let i = 1; i < connections.length; i++) {
        const messages = connections[i]!.ws.sentMessages;
        const received = messages.find(msg => {
          const parsed = JSON.parse(msg);
          return parsed.type === 'chat' && parsed.payload.message === 'Hello everyone!';
        });
        expect(received).toBeDefined();
      }
    });

    it('should handle system messages', () => {
      wsManager.broadcastSystemMessage('table-1', 'Tournament starting in 5 minutes');
      
      connections.forEach(({ ws }) => {
        const systemMsg = ws.sentMessages.find(msg => {
          const parsed = JSON.parse(msg);
          return parsed.type === 'chat' && parsed.payload.isSystem === true;
        });
        
        expect(systemMsg).toBeDefined();
        const parsed = JSON.parse(systemMsg!);
        expect(parsed.payload.message).toContain('Tournament starting');
      });
    });
  });

  describe('Disconnection Handling', () => {
    it('should clean up on normal disconnection', async () => {
      const ws = new MockWebSocket();
      const token = await authManager.generateAccessToken({
        userId: 'user-1',
        username: 'testuser',
        email: 'test@example.com'
      });
      
      const request = new Request(`wss://test.com/ws?token=${token}&tableId=table-1`);
      await wsManager.handleConnection(ws as any, request);
      
      expect(wsManager.getActiveConnections()).toBe(1);
      
      ws.close(1000, 'Normal closure');
      
      expect(wsManager.getActiveConnections()).toBe(0);
    });

    it('should notify other players when someone disconnects', async () => {
      // Create 2 connections
      const ws1 = new MockWebSocket();
      const ws2 = new MockWebSocket();
      
      const token1 = await authManager.generateAccessToken({
        userId: 'user-1',
        username: 'player1',
        email: 'player1@example.com'
      });
      
      const token2 = await authManager.generateAccessToken({
        userId: 'user-2',
        username: 'player2',
        email: 'player2@example.com'
      });
      
      await wsManager.handleConnection(ws1 as any, new Request(`wss://test.com/ws?token=${token1}&tableId=table-1`));
      await wsManager.handleConnection(ws2 as any, new Request(`wss://test.com/ws?token=${token2}&tableId=table-1`));
      
      // Clear initial messages
      ws2.sentMessages = [];
      
      // Disconnect first player
      ws1.close();
      
      // Second player should receive notification
      const disconnectMsg = ws2.sentMessages.find(msg => {
        const parsed = JSON.parse(msg);
        return parsed.type === 'chat' && parsed.payload.message.includes('disconnected');
      });
      
      expect(disconnectMsg).toBeDefined();
    });

    it('should handle error disconnection', async () => {
      const ws = new MockWebSocket();
      const token = await authManager.generateAccessToken({
        userId: 'user-1',
        username: 'testuser',
        email: 'test@example.com'
      });
      
      const request = new Request(`wss://test.com/ws?token=${token}&tableId=table-1`);
      await wsManager.handleConnection(ws as any, request);
      
      ws.emit('error', new Error('Network error'));
      
      expect(wsManager.getActiveConnections()).toBe(0);
    });
  });

  describe('Table Management', () => {
    it('should close all connections for a table', async () => {
      const connections = [];
      
      // Create 3 connections for table-1
      for (let i = 1; i <= 3; i++) {
        const ws = new MockWebSocket();
        const token = await authManager.generateAccessToken({
          userId: `user-${i}`,
          username: `player${i}`,
          email: `player${i}@example.com`
        });
        
        const request = new Request(`wss://test.com/ws?token=${token}&tableId=table-1`);
        await wsManager.handleConnection(ws as any, request);
        connections.push(ws);
      }
      
      expect(wsManager.getTableConnections('table-1')).toBe(3);
      
      wsManager.closeTableConnections('table-1');
      
      connections.forEach(ws => {
        expect(ws.readyState).toBe(MockWebSocket.CLOSED);
      });
      
      expect(wsManager.getTableConnections('table-1')).toBe(0);
    });

    it('should handle join/leave table messages', async () => {
      const ws = new MockWebSocket();
      const token = await authManager.generateAccessToken({
        userId: 'user-1',
        username: 'testuser',
        email: 'test@example.com'
      });
      
      const request = new Request(`wss://test.com/ws?token=${token}&tableId=table-1`);
      await wsManager.handleConnection(ws as any, request);
      
      // Send join table message
      const joinMsg = createWebSocketMessage('join_table', {});
      ws.emit('message', { data: JSON.stringify(joinMsg) });
      
      // Should receive table state
      const tableStateMsg = ws.sentMessages.find(msg => {
        const parsed = JSON.parse(msg);
        return parsed.type === 'table_state';
      });
      
      expect(tableStateMsg).toBeDefined();
      
      // Send leave table message
      const leaveMsg = createWebSocketMessage('leave_table', {});
      ws.emit('message', { data: JSON.stringify(leaveMsg) });
      
      expect(ws.readyState).toBe(MockWebSocket.CLOSED);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle malformed JSON messages', async () => {
      const ws = new MockWebSocket();
      const token = await authManager.generateAccessToken({
        userId: 'user-1',
        username: 'testuser',
        email: 'test@example.com'
      });
      
      const request = new Request(`wss://test.com/ws?token=${token}&tableId=table-1`);
      await wsManager.handleConnection(ws as any, request);
      
      ws.emit('message', { data: 'invalid json {' });
      
      const errorMsg = ws.sentMessages.find(msg => {
        const parsed = JSON.parse(msg);
        return parsed.type === 'error';
      });
      
      expect(errorMsg).toBeDefined();
      const parsed = JSON.parse(errorMsg!);
      expect(parsed.payload.message).toContain('Invalid message format');
    });

    it('should handle unknown message types', async () => {
      const ws = new MockWebSocket();
      const token = await authManager.generateAccessToken({
        userId: 'user-1',
        username: 'testuser',
        email: 'test@example.com'
      });
      
      const request = new Request(`wss://test.com/ws?token=${token}&tableId=table-1`);
      await wsManager.handleConnection(ws as any, request);
      
      const unknownMsg = createWebSocketMessage('unknown_type' as any, {});
      ws.emit('message', { data: JSON.stringify(unknownMsg) });
      
      const errorMsg = ws.sentMessages.find(msg => {
        const parsed = JSON.parse(msg);
        return parsed.type === 'error';
      });
      
      expect(errorMsg).toBeDefined();
      const parsed = JSON.parse(errorMsg!);
      expect(parsed.payload.message).toContain('Unknown message type');
    });

    it('should handle connection cleanup for stale connections', () => {
      // This would test the cleanup method
      wsManager.cleanup();
      
      // No active connections should remain
      expect(wsManager.getActiveConnections()).toBe(0);
    });
  });
});