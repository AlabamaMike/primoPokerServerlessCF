/**
 * Shared WebSocket mock utility for tests
 * Provides a consistent WebSocket mock implementation across test files
 */

export interface MockWebSocketOptions {
  autoConnect?: boolean;
  connectionDelay?: number;
  enableReconnect?: boolean;
}

export class MockWebSocket {
  public url: string;
  public readyState: number;
  public onopen: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  
  private sentMessages: any[] = [];
  private receivedMessages: any[] = [];
  private listeners: Map<string, Function[]> = new Map();
  private options: MockWebSocketOptions;
  
  // WebSocket ready states
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  constructor(url: string, options: MockWebSocketOptions = {}) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.options = {
      autoConnect: true,
      connectionDelay: 0,
      enableReconnect: false,
      ...options
    };
    
    if (this.options.autoConnect) {
      this.simulateConnection();
    }
  }

  private async simulateConnection() {
    if (this.options.connectionDelay) {
      await new Promise(resolve => setTimeout(resolve, this.options.connectionDelay));
    }
    
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen(new Event('open'));
    }
    this.emit('open', new Event('open'));
  }

  send(data: string | ArrayBuffer | Blob): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    
    const message = typeof data === 'string' ? JSON.parse(data) : data;
    this.sentMessages.push(message);
    this.emit('send', message);
  }

  close(code?: number, reason?: string): void {
    if (this.readyState === MockWebSocket.CLOSING || this.readyState === MockWebSocket.CLOSED) {
      return;
    }
    
    this.readyState = MockWebSocket.CLOSING;
    
    // Simulate close event
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      const closeEvent = new CloseEvent('close', { code, reason });
      
      if (this.onclose) {
        this.onclose(closeEvent);
      }
      this.emit('close', closeEvent);
    }, 0);
  }

  addEventListener(event: string, listener: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  removeEventListener(event: string, listener: Function): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(listener => listener(data));
    }
  }

  // Test utilities
  simulateMessage(data: any): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    
    const messageData = typeof data === 'string' ? data : JSON.stringify(data);
    const event = new MessageEvent('message', { data: messageData });
    
    this.receivedMessages.push(data);
    
    if (this.onmessage) {
      this.onmessage(event);
    }
    this.emit('message', event);
  }

  simulateError(error?: any): void {
    const event = new Event('error');
    Object.defineProperty(event, 'error', { value: error });
    
    if (this.onerror) {
      this.onerror(event);
    }
    this.emit('error', event);
  }

  simulateReconnect(): void {
    if (!this.options.enableReconnect) {
      throw new Error('Reconnect not enabled for this mock');
    }
    
    this.close();
    this.readyState = MockWebSocket.CONNECTING;
    this.simulateConnection();
  }

  getSentMessages(): any[] {
    return [...this.sentMessages];
  }

  getReceivedMessages(): any[] {
    return [...this.receivedMessages];
  }

  clearMessages(): void {
    this.sentMessages = [];
    this.receivedMessages = [];
  }
}

/**
 * Factory function to create WebSocket mock
 */
export function createMockWebSocket(options?: MockWebSocketOptions): typeof WebSocket {
  return class extends MockWebSocket {
    constructor(url: string) {
      super(url, options);
    }
  } as any;
}

/**
 * Jest mock setup helper
 */
export function setupWebSocketMock(global: any = globalThis, options?: MockWebSocketOptions): void {
  global.WebSocket = createMockWebSocket(options);
  global.MockWebSocket = MockWebSocket;
}

/**
 * Get the last created WebSocket instance (useful for tests)
 */
let lastInstance: MockWebSocket | null = null;

export function getLastWebSocketInstance(): MockWebSocket | null {
  return lastInstance;
}

// Override constructor to track instances
const OriginalMockWebSocket = MockWebSocket;
(MockWebSocket as any) = class extends OriginalMockWebSocket {
  constructor(url: string, options?: MockWebSocketOptions) {
    super(url, options);
    lastInstance = this;
  }
};