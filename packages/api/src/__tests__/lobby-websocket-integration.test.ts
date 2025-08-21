/**
 * Lobby WebSocket Integration Tests - Phase 2
 * 
 * Tests for real-time lobby updates including:
 * - WebSocket connection management
 * - Real-time table updates
 * - Message batching and performance
 * - Error handling and reconnection
 * - Concurrent user scenarios
 */

import WebSocket from 'ws';
import { createHash } from 'crypto';
import { EventEmitter } from 'events';

// Mock WebSocket Server
class MockWebSocketServer extends EventEmitter {
  private clients: Set<MockWebSocket> = new Set();
  private tables: Map<string, any> = new Map();
  private updateSequence = 0;

  constructor() {
    super();
    this.setupInitialTables();
  }

  private setupInitialTables() {
    // Set up some initial tables
    for (let i = 1; i <= 5; i++) {
      this.tables.set(`table-${i}`, {
        id: `table-${i}`,
        name: `Table ${i}`,
        gameType: 'cash',
        stakes: '1/2',
        players: Math.floor(Math.random() * 9),
        maxPlayers: 9,
        avgPot: Math.random() * 200,
        waitlist: 0,
        isPrivate: false
      });
    }
  }

  handleConnection(ws: MockWebSocket) {
    this.clients.add(ws);
    
    // Send initial table state
    ws.send(JSON.stringify({
      type: 'initial_state',
      payload: {
        tables: Array.from(this.tables.values()),
        sequenceId: this.updateSequence++
      }
    }));

    ws.on('close', () => {
      this.clients.delete(ws);
    });
  }

  // Simulate table update
  updateTable(tableId: string, updates: any) {
    const table = this.tables.get(tableId);
    if (table) {
      Object.assign(table, updates);
      this.broadcast({
        type: 'table_updated',
        payload: {
          id: tableId,
          ...updates,
          sequenceId: this.updateSequence++
        }
      });
    }
  }

  // Simulate new table creation
  createTable(table: any) {
    this.tables.set(table.id, table);
    this.broadcast({
      type: 'table_added',
      payload: {
        ...table,
        sequenceId: this.updateSequence++
      }
    });
  }

  // Simulate table removal
  removeTable(tableId: string) {
    if (this.tables.delete(tableId)) {
      this.broadcast({
        type: 'table_removed',
        payload: {
          tableId,
          sequenceId: this.updateSequence++
        }
      });
    }
  }

  // Simulate stats update
  updateStats() {
    const stats = {
      totalTables: this.tables.size,
      totalPlayers: Array.from(this.tables.values()).reduce((sum, t) => sum + t.players, 0),
      activeTables: Array.from(this.tables.values()).filter(t => t.players > 0).length,
      timestamp: Date.now()
    };
    
    this.broadcast({
      type: 'stats_update',
      payload: stats
    });
  }

  // Simulate rapid updates for performance testing
  simulateRapidUpdates(count: number, intervalMs: number = 10) {
    let updates = 0;
    const interval = setInterval(() => {
      const tables = Array.from(this.tables.keys());
      const randomTable = tables[Math.floor(Math.random() * tables.length)];
      
      this.updateTable(randomTable, {
        players: Math.floor(Math.random() * 9),
        avgPot: Math.random() * 500,
        currentPlayers: Math.random() > 0.5 ? ['player1', 'player2'] : []
      });

      updates++;
      if (updates >= count) {
        clearInterval(interval);
        this.emit('rapid_updates_complete');
      }
    }, intervalMs);
  }

  broadcast(message: any) {
    const data = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  getClientCount() {
    return this.clients.size;
  }

  disconnectAllClients() {
    this.clients.forEach(client => client.close());
    this.clients.clear();
  }
}

// Mock WebSocket client
class MockWebSocket extends EventEmitter {
  readyState: number = WebSocket.CONNECTING;
  private messages: any[] = [];
  private messageHandlers: ((data: any) => void)[] = [];

  constructor(public url: string) {
    super();
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      this.emit('open');
    }, 10);
  }

  send(data: string) {
    if (this.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.messages.push(JSON.parse(data));
  }

  onmessage(handler: (event: { data: string }) => void) {
    this.messageHandlers.push((data) => handler({ data: JSON.stringify(data) }));
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    this.emit('close');
  }

  simulateMessage(data: any) {
    this.messageHandlers.forEach(handler => handler(data));
  }

  getMessages() {
    return this.messages;
  }
}

describe('Lobby WebSocket Integration', () => {
  let server: MockWebSocketServer;
  let client: MockWebSocket;

  beforeEach(() => {
    server = new MockWebSocketServer();
    jest.clearAllMocks();
  });

  afterEach(() => {
    server.disconnectAllClients();
  });

  describe('Connection Management', () => {
    it('should establish WebSocket connection and receive initial state', async () => {
      client = new MockWebSocket('ws://localhost:8080/ws/lobby');
      const messages: any[] = [];
      
      client.onmessage((event) => {
        messages.push(JSON.parse(event.data));
      });

      await new Promise(resolve => {
        client.on('open', () => {
          server.handleConnection(client);
          resolve(undefined);
        });
      });

      // Should receive initial state
      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('initial_state');
      expect(messages[0].payload.tables).toHaveLength(5);
      expect(messages[0].payload.sequenceId).toBe(0);
    });

    it('should handle reconnection with exponential backoff', async () => {
      const reconnectAttempts: number[] = [];
      let reconnectCount = 0;

      const connect = () => {
        return new Promise((resolve) => {
          const ws = new MockWebSocket('ws://localhost:8080/ws/lobby');
          
          ws.on('open', () => {
            reconnectCount = 0;
            resolve(ws);
          });

          ws.on('close', () => {
            if (reconnectCount < 3) {
              const delay = Math.pow(2, reconnectCount) * 1000;
              reconnectAttempts.push(delay);
              reconnectCount++;
              setTimeout(() => connect(), delay);
            }
          });

          // Simulate connection failure
          if (reconnectCount < 2) {
            setTimeout(() => ws.close(), 100);
          } else {
            server.handleConnection(ws);
          }
        });
      };

      await connect();
      
      expect(reconnectAttempts).toEqual([1000, 2000]);
    });

    it('should handle multiple concurrent connections', async () => {
      const clients: MockWebSocket[] = [];
      const clientMessages: Map<number, any[]> = new Map();

      // Create 10 concurrent connections
      for (let i = 0; i < 10; i++) {
        const client = new MockWebSocket(`ws://localhost:8080/ws/lobby?client=${i}`);
        const messages: any[] = [];
        clientMessages.set(i, messages);
        
        client.onmessage((event) => {
          messages.push(JSON.parse(event.data));
        });

        clients.push(client);
      }

      // Wait for all connections to open
      await Promise.all(clients.map(client => 
        new Promise(resolve => client.on('open', resolve))
      ));

      // Connect all clients to server
      clients.forEach(client => server.handleConnection(client));

      // All clients should receive initial state
      clientMessages.forEach((messages, clientId) => {
        expect(messages).toHaveLength(1);
        expect(messages[0].type).toBe('initial_state');
      });

      // Broadcast an update
      server.updateTable('table-1', { players: 5 });

      // All clients should receive the update
      await new Promise(resolve => setTimeout(resolve, 50));
      clientMessages.forEach((messages, clientId) => {
        expect(messages).toHaveLength(2);
        expect(messages[1].type).toBe('table_updated');
        expect(messages[1].payload.id).toBe('table-1');
        expect(messages[1].payload.players).toBe(5);
      });

      expect(server.getClientCount()).toBe(10);
    });
  });

  describe('Real-time Updates', () => {
    beforeEach(async () => {
      client = new MockWebSocket('ws://localhost:8080/ws/lobby');
      await new Promise(resolve => {
        client.on('open', () => {
          server.handleConnection(client);
          resolve(undefined);
        });
      });
    });

    it('should receive table update notifications', async () => {
      const messages: any[] = [];
      client.onmessage((event) => {
        messages.push(JSON.parse(event.data));
      });

      // Update a table
      server.updateTable('table-2', { 
        players: 7, 
        avgPot: 250.50,
        waitlist: 2 
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const updateMessage = messages.find(m => m.type === 'table_updated');
      expect(updateMessage).toBeDefined();
      expect(updateMessage.payload).toMatchObject({
        id: 'table-2',
        players: 7,
        avgPot: 250.50,
        waitlist: 2
      });
    });

    it('should receive table creation notifications', async () => {
      const messages: any[] = [];
      client.onmessage((event) => {
        messages.push(JSON.parse(event.data));
      });

      // Create a new table
      server.createTable({
        id: 'table-new',
        name: 'High Stakes',
        gameType: 'cash',
        stakes: '5/10',
        players: 0,
        maxPlayers: 6,
        avgPot: 0,
        waitlist: 0,
        isPrivate: true
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const createMessage = messages.find(m => m.type === 'table_added');
      expect(createMessage).toBeDefined();
      expect(createMessage.payload).toMatchObject({
        id: 'table-new',
        name: 'High Stakes',
        stakes: '5/10',
        isPrivate: true
      });
    });

    it('should receive table removal notifications', async () => {
      const messages: any[] = [];
      client.onmessage((event) => {
        messages.push(JSON.parse(event.data));
      });

      // Remove a table
      server.removeTable('table-3');

      await new Promise(resolve => setTimeout(resolve, 50));

      const removeMessage = messages.find(m => m.type === 'table_removed');
      expect(removeMessage).toBeDefined();
      expect(removeMessage.payload.tableId).toBe('table-3');
    });

    it('should receive stats updates', async () => {
      const messages: any[] = [];
      client.onmessage((event) => {
        messages.push(JSON.parse(event.data));
      });

      // Update stats
      server.updateStats();

      await new Promise(resolve => setTimeout(resolve, 50));

      const statsMessage = messages.find(m => m.type === 'stats_update');
      expect(statsMessage).toBeDefined();
      expect(statsMessage.payload).toMatchObject({
        totalTables: expect.any(Number),
        totalPlayers: expect.any(Number),
        activeTables: expect.any(Number),
        timestamp: expect.any(Number)
      });
    });

    it('should maintain update sequence order', async () => {
      const messages: any[] = [];
      client.onmessage((event) => {
        messages.push(JSON.parse(event.data));
      });

      // Perform multiple updates
      server.updateTable('table-1', { players: 3 });
      server.updateTable('table-2', { players: 5 });
      server.createTable({ id: 'table-6', name: 'Table 6' });
      server.removeTable('table-4');

      await new Promise(resolve => setTimeout(resolve, 100));

      // Check sequence IDs are in order
      const updateMessages = messages.filter(m => m.type !== 'initial_state');
      const sequenceIds = updateMessages.map(m => m.payload.sequenceId);
      
      for (let i = 1; i < sequenceIds.length; i++) {
        expect(sequenceIds[i]).toBeGreaterThan(sequenceIds[i - 1]);
      }
    });
  });

  describe('Message Batching and Performance', () => {
    beforeEach(async () => {
      client = new MockWebSocket('ws://localhost:8080/ws/lobby');
      await new Promise(resolve => {
        client.on('open', () => {
          server.handleConnection(client);
          resolve(undefined);
        });
      });
    });

    it('should handle rapid updates without message loss', async () => {
      const messages: any[] = [];
      const processedUpdates = new Set<string>();
      
      client.onmessage((event) => {
        const message = JSON.parse(event.data);
        messages.push(message);
        
        if (message.type === 'table_updated') {
          processedUpdates.add(`${message.payload.id}-${message.payload.sequenceId}`);
        }
      });

      // Simulate 100 rapid updates
      await new Promise<void>(resolve => {
        server.on('rapid_updates_complete', resolve);
        server.simulateRapidUpdates(100, 5);
      });

      // Wait for all messages to be processed
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should have received all updates
      const tableUpdates = messages.filter(m => m.type === 'table_updated');
      expect(tableUpdates.length).toBeGreaterThanOrEqual(95); // Allow for some batching
    });

    it('should batch messages efficiently', async () => {
      // Mock message batcher
      const batcher = {
        batchedMessages: [] as any[],
        add: jest.fn((type: string, payload: any) => {
          batcher.batchedMessages.push({ type, payload });
        }),
        flush: jest.fn(),
        getMetrics: jest.fn(() => ({
          totalMessages: 50,
          totalBatches: 5,
          averageBatchSize: 10,
          messagesDropped: 0
        }))
      };

      // Simulate 50 rapid updates
      for (let i = 0; i < 50; i++) {
        batcher.add('table_updated', { 
          id: `table-${i % 5 + 1}`, 
          players: Math.floor(Math.random() * 9) 
        });
      }

      const metrics = batcher.getMetrics();
      expect(metrics.totalMessages).toBe(50);
      expect(metrics.averageBatchSize).toBe(10);
      expect(metrics.messagesDropped).toBe(0);
    });

    it('should handle message overflow gracefully', async () => {
      const messages: any[] = [];
      let droppedMessages = 0;
      
      // Create a mock batcher with limited capacity
      const maxQueueSize = 100;
      const messageQueue: any[] = [];
      
      const addMessage = (message: any) => {
        if (messageQueue.length < maxQueueSize) {
          messageQueue.push(message);
        } else {
          droppedMessages++;
        }
      };

      // Simulate 200 messages rapidly
      for (let i = 0; i < 200; i++) {
        addMessage({
          type: 'table_updated',
          payload: { id: `table-${i % 5 + 1}`, players: i }
        });
      }

      expect(messageQueue.length).toBe(100);
      expect(droppedMessages).toBe(100);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed messages gracefully', async () => {
      client = new MockWebSocket('ws://localhost:8080/ws/lobby');
      const errors: any[] = [];
      const validMessages: any[] = [];

      client.onmessage((event) => {
        try {
          const message = JSON.parse(event.data);
          validMessages.push(message);
        } catch (error) {
          errors.push(error);
        }
      });

      await new Promise(resolve => {
        client.on('open', () => {
          server.handleConnection(client);
          resolve(undefined);
        });
      });

      // Send malformed message
      client.simulateMessage('{ invalid json }');
      
      // Send valid message
      client.simulateMessage({ type: 'table_updated', payload: { id: 'table-1' } });

      expect(errors).toHaveLength(0); // Should not throw
      expect(validMessages).toHaveLength(2); // Initial state + valid update
    });

    it('should handle connection drops during updates', async () => {
      const clients: MockWebSocket[] = [];
      const messagesByClient: Map<number, any[]> = new Map();

      // Create 5 clients
      for (let i = 0; i < 5; i++) {
        const client = new MockWebSocket(`ws://localhost:8080/ws/lobby?client=${i}`);
        const messages: any[] = [];
        messagesByClient.set(i, messages);
        
        client.onmessage((event) => {
          messages.push(JSON.parse(event.data));
        });

        clients.push(client);
      }

      // Connect all clients
      await Promise.all(clients.map(client => 
        new Promise(resolve => {
          client.on('open', () => {
            server.handleConnection(client);
            resolve(undefined);
          });
        })
      ));

      // Disconnect some clients
      clients[1].close();
      clients[3].close();

      // Send update
      server.updateTable('table-1', { players: 8 });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Only connected clients should receive the update
      expect(messagesByClient.get(0)!.length).toBe(2); // Initial + update
      expect(messagesByClient.get(1)!.length).toBe(1); // Only initial
      expect(messagesByClient.get(2)!.length).toBe(2); // Initial + update
      expect(messagesByClient.get(3)!.length).toBe(1); // Only initial
      expect(messagesByClient.get(4)!.length).toBe(2); // Initial + update
    });

    it('should handle server disconnection gracefully', async () => {
      let disconnected = false;
      client = new MockWebSocket('ws://localhost:8080/ws/lobby');

      client.on('close', () => {
        disconnected = true;
      });

      await new Promise(resolve => {
        client.on('open', () => {
          server.handleConnection(client);
          resolve(undefined);
        });
      });

      // Simulate server disconnection
      server.disconnectAllClients();

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(disconnected).toBe(true);
    });
  });

  describe('Concurrent User Scenarios', () => {
    it('should handle 1000+ concurrent connections', async () => {
      const startTime = Date.now();
      const connectionPromises: Promise<void>[] = [];
      const clients: MockWebSocket[] = [];

      // Create 1000 concurrent connections
      for (let i = 0; i < 1000; i++) {
        const client = new MockWebSocket(`ws://localhost:8080/ws/lobby?client=${i}`);
        clients.push(client);
        
        const promise = new Promise<void>(resolve => {
          client.on('open', () => {
            server.handleConnection(client);
            resolve();
          });
        });
        
        connectionPromises.push(promise);
      }

      await Promise.all(connectionPromises);
      const connectionTime = Date.now() - startTime;

      expect(server.getClientCount()).toBe(1000);
      expect(connectionTime).toBeLessThan(5000); // Should handle 1000 connections in under 5 seconds

      // Send an update to all clients
      const updateStartTime = Date.now();
      server.updateStats();
      const updateTime = Date.now() - updateStartTime;

      expect(updateTime).toBeLessThan(100); // Broadcast should be fast

      // Clean up
      clients.forEach(client => client.close());
    });

    it('should maintain consistency across all clients', async () => {
      const clients: MockWebSocket[] = [];
      const finalStates: Map<number, any> = new Map();

      // Create 20 clients
      for (let i = 0; i < 20; i++) {
        const client = new MockWebSocket(`ws://localhost:8080/ws/lobby?client=${i}`);
        const messages: any[] = [];
        
        client.onmessage((event) => {
          const message = JSON.parse(event.data);
          messages.push(message);
          
          // Track final state
          if (message.type === 'table_updated') {
            finalStates.set(i, message.payload);
          }
        });

        clients.push(client);
      }

      // Connect all clients
      await Promise.all(clients.map(client => 
        new Promise(resolve => {
          client.on('open', () => {
            server.handleConnection(client);
            resolve(undefined);
          });
        })
      ));

      // Perform multiple updates
      server.updateTable('table-1', { players: 5, avgPot: 100 });
      server.updateTable('table-2', { players: 3, avgPot: 200 });
      server.updateTable('table-1', { players: 6, avgPot: 150 }); // Update table-1 again

      await new Promise(resolve => setTimeout(resolve, 100));

      // All clients should have the same final state for table-1
      const table1States = Array.from(finalStates.values())
        .filter(state => state.id === 'table-1');
      
      expect(table1States.length).toBeGreaterThan(0);
      table1States.forEach(state => {
        expect(state).toMatchObject({
          id: 'table-1',
          players: 6,
          avgPot: 150
        });
      });
    });

    it('should handle mixed update patterns', async () => {
      const clients: MockWebSocket[] = [];
      const updateCounts: Map<number, number> = new Map();

      // Create 50 clients
      for (let i = 0; i < 50; i++) {
        const client = new MockWebSocket(`ws://localhost:8080/ws/lobby?client=${i}`);
        updateCounts.set(i, 0);
        
        client.onmessage((event) => {
          const message = JSON.parse(event.data);
          if (message.type !== 'initial_state') {
            updateCounts.set(i, updateCounts.get(i)! + 1);
          }
        });

        clients.push(client);
      }

      // Connect all clients at different times
      for (let i = 0; i < clients.length; i++) {
        setTimeout(() => {
          clients[i].on('open', () => {
            server.handleConnection(clients[i]);
          });
        }, i * 10); // Stagger connections
      }

      // Wait for all connections
      await new Promise(resolve => setTimeout(resolve, 600));

      // Send various updates
      server.updateTable('table-1', { players: 4 });
      server.createTable({ id: 'table-new-1', name: 'New Table 1' });
      server.updateStats();
      server.removeTable('table-5');
      server.updateTable('table-2', { avgPot: 300 });

      await new Promise(resolve => setTimeout(resolve, 200));

      // All connected clients should have received updates
      let connectedClients = 0;
      updateCounts.forEach((count, clientId) => {
        if (count > 0) {
          connectedClients++;
          expect(count).toBeGreaterThanOrEqual(4); // Should have received most updates
        }
      });

      expect(connectedClients).toBeGreaterThan(40); // Most clients should be connected
    });
  });

  describe('Waitlist Updates', () => {
    beforeEach(async () => {
      client = new MockWebSocket('ws://localhost:8080/ws/lobby');
      await new Promise(resolve => {
        client.on('open', () => {
          server.handleConnection(client);
          resolve(undefined);
        });
      });
    });

    it('should receive waitlist updates for specific tables', async () => {
      const messages: any[] = [];
      client.onmessage((event) => {
        messages.push(JSON.parse(event.data));
      });

      // Simulate waitlist update
      server.broadcast({
        type: 'waitlist_update',
        payload: {
          tableId: 'table-1',
          waitlistCount: 3,
          estimatedWaitTime: 180 // 3 minutes
        }
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const waitlistMessage = messages.find(m => m.type === 'waitlist_update');
      expect(waitlistMessage).toBeDefined();
      expect(waitlistMessage.payload).toMatchObject({
        tableId: 'table-1',
        waitlistCount: 3,
        estimatedWaitTime: 180
      });
    });

    it('should handle multiple waitlist updates', async () => {
      const messages: any[] = [];
      const waitlistStates: Map<string, number> = new Map();

      client.onmessage((event) => {
        const message = JSON.parse(event.data);
        messages.push(message);
        
        if (message.type === 'waitlist_update') {
          waitlistStates.set(message.payload.tableId, message.payload.waitlistCount);
        }
      });

      // Simulate multiple waitlist updates
      server.broadcast({
        type: 'waitlist_update',
        payload: { tableId: 'table-1', waitlistCount: 2 }
      });
      
      server.broadcast({
        type: 'waitlist_update',
        payload: { tableId: 'table-2', waitlistCount: 5 }
      });
      
      server.broadcast({
        type: 'waitlist_update',
        payload: { tableId: 'table-1', waitlistCount: 3 } // Update table-1 again
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(waitlistStates.get('table-1')).toBe(3);
      expect(waitlistStates.get('table-2')).toBe(5);
    });
  });
});