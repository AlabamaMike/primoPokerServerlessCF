/**
 * WebSocket Mock Utility - Phase 2
 * 
 * Comprehensive WebSocket mocking for:
 * - Real-time lobby updates
 * - Chat messages
 * - Game state updates
 * - Spectator mode
 */

import { EventEmitter } from 'events';

export interface MockWebSocketOptions {
  url: string;
  protocols?: string | string[];
  autoConnect?: boolean;
  latency?: number;
  failConnection?: boolean;
  dropRate?: number; // Percentage of messages to drop (0-100)
}

export class MockWebSocket extends EventEmitter {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  public readyState: number = MockWebSocket.CONNECTING;
  public url: string;
  public protocols?: string | string[];
  public binaryType: 'blob' | 'arraybuffer' = 'blob';
  
  private messageQueue: any[] = [];
  private sentMessages: any[] = [];
  private latency: number;
  private dropRate: number;
  private connectionTimer?: NodeJS.Timeout;
  private messageHandlers: ((event: MessageEvent) => void)[] = [];
  private errorHandlers: ((event: Event) => void)[] = [];
  private closeHandlers: ((event: CloseEvent) => void)[] = [];
  private openHandlers: ((event: Event) => void)[] = [];

  constructor(url: string, protocols?: string | string[]) {
    super();
    this.url = url;
    this.protocols = protocols;
    this.latency = 10;
    this.dropRate = 0;

    // Auto-connect after a short delay
    this.connectionTimer = setTimeout(() => {
      this.connect();
    }, 50);
  }

  private connect() {
    if (this.readyState !== MockWebSocket.CONNECTING) return;

    // Simulate connection success
    this.readyState = MockWebSocket.OPEN;
    const openEvent = new Event('open');
    this.dispatchEvent(openEvent);
    this.openHandlers.forEach(handler => handler(openEvent));
    this.emit('open');

    // Send initial connection message if it's a lobby WebSocket
    if (this.url.includes('/ws/lobby')) {
      this.simulateServerMessage({
        type: 'connection_established',
        payload: {
          connectionId: `conn-${Date.now()}`,
          serverTime: new Date().toISOString()
        }
      });

      // Send initial table state
      this.simulateServerMessage({
        type: 'initial_state',
        payload: {
          tables: this.generateMockTables(),
          stats: {
            totalTables: 5,
            totalPlayers: 23,
            activeTables: 4
          }
        }
      });
    }
  }

  send(data: string | ArrayBuffer | Blob) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new DOMException('WebSocket is not open');
    }

    // Parse and store sent message
    const message = typeof data === 'string' ? JSON.parse(data) : data;
    this.sentMessages.push(message);
    this.emit('message-sent', message);

    // Simulate server response based on message type
    if (typeof data === 'string') {
      const parsed = JSON.parse(data);
      this.handleClientMessage(parsed);
    }
  }

  close(code?: number, reason?: string) {
    if (this.readyState === MockWebSocket.CLOSED) return;

    this.readyState = MockWebSocket.CLOSING;
    
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      const closeEvent = new CloseEvent('close', {
        code: code || 1000,
        reason: reason || '',
        wasClean: true
      });
      this.dispatchEvent(closeEvent);
      this.closeHandlers.forEach(handler => handler(closeEvent));
      this.emit('close', code, reason);
    }, 10);
  }

  // Event handler properties
  set onopen(handler: ((event: Event) => void) | null) {
    this.openHandlers = handler ? [handler] : [];
  }

  set onmessage(handler: ((event: MessageEvent) => void) | null) {
    this.messageHandlers = handler ? [handler] : [];
  }

  set onerror(handler: ((event: Event) => void) | null) {
    this.errorHandlers = handler ? [handler] : [];
  }

  set onclose(handler: ((event: CloseEvent) => void) | null) {
    this.closeHandlers = handler ? [handler] : [];
  }

  addEventListener(type: string, listener: EventListener) {
    switch (type) {
      case 'open':
        this.openHandlers.push(listener as any);
        break;
      case 'message':
        this.messageHandlers.push(listener as any);
        break;
      case 'error':
        this.errorHandlers.push(listener as any);
        break;
      case 'close':
        this.closeHandlers.push(listener as any);
        break;
    }
  }

  removeEventListener(type: string, listener: EventListener) {
    switch (type) {
      case 'open':
        this.openHandlers = this.openHandlers.filter(h => h !== listener);
        break;
      case 'message':
        this.messageHandlers = this.messageHandlers.filter(h => h !== listener);
        break;
      case 'error':
        this.errorHandlers = this.errorHandlers.filter(h => h !== listener);
        break;
      case 'close':
        this.closeHandlers = this.closeHandlers.filter(h => h !== listener);
        break;
    }
  }

  dispatchEvent(event: Event): boolean {
    this.emit(event.type, event);
    return true;
  }

  // Mock-specific methods
  simulateServerMessage(data: any) {
    if (this.readyState !== MockWebSocket.OPEN) return;

    // Simulate network latency
    setTimeout(() => {
      // Simulate message drop
      if (Math.random() * 100 < this.dropRate) {
        this.emit('message-dropped', data);
        return;
      }

      const messageEvent = new MessageEvent('message', {
        data: JSON.stringify(data),
        origin: new URL(this.url).origin
      });
      
      this.messageHandlers.forEach(handler => handler(messageEvent));
      this.emit('message', messageEvent);
    }, this.latency);
  }

  simulateError(error: string) {
    const errorEvent = new Event('error');
    (errorEvent as any).message = error;
    this.errorHandlers.forEach(handler => handler(errorEvent));
    this.emit('error', errorEvent);
  }

  simulateDisconnect(code: number = 1006, reason: string = 'Connection lost') {
    this.close(code, reason);
  }

  // Configuration methods
  setLatency(ms: number) {
    this.latency = ms;
  }

  setDropRate(rate: number) {
    this.dropRate = Math.max(0, Math.min(100, rate));
  }

  // Test helper methods
  getSentMessages() {
    return [...this.sentMessages];
  }

  clearSentMessages() {
    this.sentMessages = [];
  }

  getLastSentMessage() {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  // Handle client messages and generate appropriate responses
  private handleClientMessage(message: any) {
    switch (message.type) {
      case 'subscribe':
        this.simulateServerMessage({
          type: 'subscription_confirmed',
          payload: { channel: message.channel }
        });
        break;

      case 'join_table':
        this.simulateServerMessage({
          type: 'table_joined',
          payload: {
            tableId: message.tableId,
            seat: message.seat,
            buyIn: message.buyIn
          }
        });
        break;

      case 'chat_message':
        this.simulateServerMessage({
          type: 'chat_message',
          payload: {
            id: `msg-${Date.now()}`,
            playerId: message.playerId,
            message: message.message,
            timestamp: new Date().toISOString()
          }
        });
        break;

      case 'spectate_table':
        this.simulateServerMessage({
          type: 'spectator_joined',
          payload: {
            tableId: message.tableId,
            spectatorCount: Math.floor(Math.random() * 20) + 1
          }
        });
        break;
    }
  }

  // Generate mock table data
  private generateMockTables() {
    const tables = [];
    for (let i = 1; i <= 5; i++) {
      tables.push({
        id: `table-${i}`,
        name: `Table ${i}`,
        gameType: 'cash',
        stakes: i <= 3 ? '1/2' : '2/5',
        players: Math.floor(Math.random() * 9),
        maxPlayers: 9,
        avgPot: Math.random() * 200 + 50,
        handsPerHour: Math.floor(Math.random() * 30) + 20,
        waitlist: Math.random() > 0.7 ? Math.floor(Math.random() * 5) : 0,
        isPrivate: false
      });
    }
    return tables;
  }

  // Simulate various lobby events
  simulateLobbyUpdate(updateType: string, data?: any) {
    switch (updateType) {
      case 'table_update':
        this.simulateServerMessage({
          type: 'table_updated',
          payload: {
            id: data?.tableId || 'table-1',
            players: data?.players || Math.floor(Math.random() * 9),
            avgPot: data?.avgPot || Math.random() * 300
          }
        });
        break;

      case 'table_created':
        this.simulateServerMessage({
          type: 'table_added',
          payload: {
            id: `table-${Date.now()}`,
            name: data?.name || 'New Table',
            gameType: 'cash',
            stakes: '1/2',
            players: 0,
            maxPlayers: 9,
            avgPot: 0,
            handsPerHour: 0,
            waitlist: 0,
            isPrivate: false
          }
        });
        break;

      case 'table_removed':
        this.simulateServerMessage({
          type: 'table_removed',
          payload: {
            tableId: data?.tableId || 'table-1'
          }
        });
        break;

      case 'stats_update':
        this.simulateServerMessage({
          type: 'stats_update',
          payload: {
            totalTables: data?.totalTables || 5,
            totalPlayers: data?.totalPlayers || 32,
            activeTables: data?.activeTables || 4,
            timestamp: Date.now()
          }
        });
        break;

      case 'waitlist_update':
        this.simulateServerMessage({
          type: 'waitlist_update',
          payload: {
            tableId: data?.tableId || 'table-1',
            waitlistCount: data?.count || 0,
            estimatedWaitTime: data?.waitTime || 0
          }
        });
        break;
    }
  }

  // Simulate rapid updates for performance testing
  simulateRapidUpdates(count: number, intervalMs: number = 10) {
    let sent = 0;
    const interval = setInterval(() => {
      const tableId = `table-${Math.floor(Math.random() * 5) + 1}`;
      this.simulateLobbyUpdate('table_update', {
        tableId,
        players: Math.floor(Math.random() * 9),
        avgPot: Math.random() * 500
      });

      sent++;
      if (sent >= count) {
        clearInterval(interval);
        this.emit('rapid-updates-complete', count);
      }
    }, intervalMs);
  }

  // Clean up
  destroy() {
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
    }
    this.removeAllListeners();
    this.messageHandlers = [];
    this.errorHandlers = [];
    this.closeHandlers = [];
    this.openHandlers = [];
  }
}

// WebSocket mock factory
export class WebSocketMockFactory {
  private static instances: Map<string, MockWebSocket> = new Map();
  private static defaultOptions: Partial<MockWebSocketOptions> = {
    autoConnect: true,
    latency: 10,
    failConnection: false,
    dropRate: 0
  };

  static create(url: string, options?: MockWebSocketOptions): MockWebSocket {
    const ws = new MockWebSocket(url, options?.protocols);
    
    if (options?.latency !== undefined) {
      ws.setLatency(options.latency);
    }
    
    if (options?.dropRate !== undefined) {
      ws.setDropRate(options.dropRate);
    }
    
    if (options?.failConnection) {
      setTimeout(() => {
        ws.simulateError('Connection failed');
        ws.simulateDisconnect(1006, 'Connection failed');
      }, 100);
    }
    
    this.instances.set(url, ws);
    return ws;
  }

  static getInstance(url: string): MockWebSocket | undefined {
    return this.instances.get(url);
  }

  static getAllInstances(): MockWebSocket[] {
    return Array.from(this.instances.values());
  }

  static cleanup() {
    this.instances.forEach(ws => ws.destroy());
    this.instances.clear();
  }

  static setDefaultOptions(options: Partial<MockWebSocketOptions>) {
    Object.assign(this.defaultOptions, options);
  }
}

// Global WebSocket mock for tests
export function setupWebSocketMock() {
  (global as any).WebSocket = MockWebSocket;
  return WebSocketMockFactory;
}

export function cleanupWebSocketMock() {
  WebSocketMockFactory.cleanup();
  delete (global as any).WebSocket;
}