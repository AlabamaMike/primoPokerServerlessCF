// Mock WebSocket for Node.js test environment
(globalThis as any).WebSocket = class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  
  readyState = 1;
  
  constructor(url: string, protocols?: string | string[]) {
    // Mock implementation
  }
  
  send(data: string | ArrayBuffer | Blob) {
    // Mock implementation
  }
  
  close(code?: number, reason?: string) {
    this.readyState = 3;
  }
  
  addEventListener(type: string, listener: EventListener) {
    // Mock implementation
  }
  
  removeEventListener(type: string, listener: EventListener) {
    // Mock implementation
  }
};