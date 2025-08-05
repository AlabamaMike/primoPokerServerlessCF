// Mock WebSocket for testing lobby real-time updates
export class MockWebSocket {
  CONNECTING = 0;
  OPEN = 1;
  CLOSING = 2;
  CLOSED = 3;

  readyState: number = this.CONNECTING;
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  private messageInterval?: NodeJS.Timeout;

  constructor(url: string) {
    this.url = url;
    
    // Simulate connection opening
    setTimeout(() => {
      this.readyState = this.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
      this.startSendingUpdates();
    }, 100);
  }

  private startSendingUpdates() {
    // Send initial stats update
    setTimeout(() => {
      this.sendMessage({
        type: 'stats_update',
        payload: {
          playersOnline: 8888,
          activeTables: 88,
          totalPot: 888888
        }
      });
    }, 200);

    // Send periodic table updates
    let updateCount = 0;
    this.messageInterval = setInterval(() => {
      updateCount++;
      
      // Simulate different types of updates
      if (updateCount % 3 === 0) {
        // Update player count
        this.sendMessage({
          type: 'table_updated',
          payload: {
            id: 'table-123',
            players: Math.floor(Math.random() * 6) + 1,
            avgPot: Math.floor(Math.random() * 200) + 50
          }
        });
      } else if (updateCount % 5 === 0) {
        // Update waitlist
        this.sendMessage({
          type: 'table_updated',
          payload: {
            id: 'table-456',
            waitlist: Math.floor(Math.random() * 5)
          }
        });
      } else {
        // Update stats
        this.sendMessage({
          type: 'stats_update',
          payload: {
            playersOnline: 8000 + Math.floor(Math.random() * 2000),
            activeTables: 80 + Math.floor(Math.random() * 20),
            totalPot: 800000 + Math.floor(Math.random() * 200000)
          }
        });
      }
    }, 5000);
  }

  private sendMessage(data: any) {
    if (this.onmessage && this.readyState === this.OPEN) {
      const event = new MessageEvent('message', {
        data: JSON.stringify(data)
      });
      this.onmessage(event);
    }
  }

  send(data: string | ArrayBuffer | Blob) {
    // Handle sent messages if needed
    console.log('MockWebSocket send:', data);
  }

  close(code?: number, reason?: string) {
    this.readyState = this.CLOSING;
    if (this.messageInterval) {
      clearInterval(this.messageInterval);
    }
    
    setTimeout(() => {
      this.readyState = this.CLOSED;
      if (this.onclose) {
        this.onclose(new CloseEvent('close', { code, reason }));
      }
    }, 50);
  }
}

// Replace global WebSocket in test environment
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'test') {
  (window as any).WebSocket = MockWebSocket;
}