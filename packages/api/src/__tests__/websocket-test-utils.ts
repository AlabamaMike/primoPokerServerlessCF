// Shared test utilities
export class MockWebSocket {
  readyState = 1; // OPEN
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: Event) => void) | null = null;
  
  private listeners = new Map<string, Set<Function>>();
  public sentMessages: string[] = [];
  public id = Math.random().toString(36);
  public extensions = '';

  send(data: string | ArrayBuffer) {
    if (typeof data !== 'string') {
      this.sentMessages.push('[Binary Data]');
    } else {
      this.sentMessages.push(data);
    }
  }

  close(code?: number, reason?: string) {
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose();
    this.dispatchEvent('close');
  }

  addEventListener(event: string, handler: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  removeEventListener(event: string, handler: Function) {
    this.listeners.get(event)?.delete(handler);
  }

  dispatchEvent(event: string, data?: any) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  // Helper to simulate receiving a message
  receiveMessage(data: string | ArrayBuffer) {
    const event = { data } as MessageEvent;
    if (this.onmessage) this.onmessage(event);
    this.dispatchEvent('message', event);
  }
}

export class MockCompressedWebSocket extends MockWebSocket {
  extensions = 'permessage-deflate'; // Compression enabled
  compressionEnabled = true;
  public sentData: (string | ArrayBuffer)[] = [];

  send(data: string | ArrayBuffer) {
    this.sentData.push(data);
    super.send(data);
  }
}