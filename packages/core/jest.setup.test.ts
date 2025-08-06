// Mock WebSocket for tests
global.WebSocket = class WebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = WebSocket.OPEN;
  
  constructor(url: string) {}
  
  send(data: string): void {}
  close(code?: number, reason?: string): void {}
  addEventListener(event: string, handler: Function): void {}
  removeEventListener(event: string, handler: Function): void {}
};