// WebSocket message types based on backend implementation
export interface WebSocketMessage {
  id?: string;           // Unique message ID (optional for backward compatibility)
  version?: number;      // Protocol version (optional, defaults to 1)
  type: string;          // Message type
  payload: any;          // Message data (standardized field name)
  timestamp: number;     // Unix timestamp in milliseconds
  sequenceId?: number;   // For message ordering (optional)
  requiresAck?: boolean; // Whether acknowledgment is required
  correlationId?: string; // For request/response pairing (optional)
}

export interface PlayerActionMessage extends WebSocketMessage {
  type: 'player_action';
  payload: {
    playerId: string;
    action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in';
    amount?: number;
    tableId: string;
  };
}

export interface GameUpdateMessage extends WebSocketMessage {
  type: 'game_update';
  payload: {
    tableId: string;
    gameState: any; // Will match the GameState from PokerTable component
    players: any[];
    phase: string;
    pot: number;
    currentBet: number;
    activePlayerId?: string;
    communityCards: Array<{ suit: string; rank: string }>;
  };
}

export interface ChatMessage extends WebSocketMessage {
  type: 'chat';
  payload: {
    playerId: string;
    username: string;
    message: string;
    isSystem: boolean;
  };
}

export interface ConnectionEstablishedMessage extends WebSocketMessage {
  type: 'connection_established';
  payload: {
    playerId: string;
    tableId: string;
  };
}

export interface ErrorMessage extends WebSocketMessage {
  type: 'error';
  payload: {
    message: string;
    code?: string;
  };
}

export type IncomingMessage = 
  | GameUpdateMessage 
  | ChatMessage 
  | ConnectionEstablishedMessage 
  | ErrorMessage
  | { type: 'pong'; payload: {}; timestamp: string };

export type OutgoingMessage = 
  | PlayerActionMessage 
  | ChatMessage
  | { type: 'ping'; payload: {}; timestamp: string }
  | { type: 'join_table'; payload: {}; timestamp: string }
  | { type: 'leave_table'; payload: {}; timestamp: string };

export interface WebSocketClientOptions {
  url: string;
  token: string;
  tableId: string;
  onMessage?: (message: IncomingMessage) => void;
  onError?: (error: Error) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private options: WebSocketClientOptions;
  private reconnectCount = 0;
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private isDestroyed = false;

  constructor(options: WebSocketClientOptions) {
    this.options = {
      reconnectAttempts: 5,
      reconnectDelay: 3000,
      ...options
    };
  }

  async connect(): Promise<void> {
    if (this.isConnecting || this.isDestroyed) return;
    
    this.isConnecting = true;
    
    try {
      const wsUrl = this.buildWebSocketUrl();
      console.log('Connecting to WebSocket:', wsUrl);
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      
    } catch (error) {
      this.isConnecting = false;
      console.error('Failed to create WebSocket connection:', error);
      this.options.onError?.(error as Error);
      this.scheduleReconnect();
    }
  }

  private buildWebSocketUrl(): string {
    const url = new URL(this.options.url);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws'; // WebSocket endpoint on the backend
    url.searchParams.set('token', this.options.token);
    url.searchParams.set('tableId', this.options.tableId);
    return url.toString();
  }

  private handleOpen(): void {
    console.log('WebSocket connected');
    this.isConnecting = false;
    this.reconnectCount = 0;
    
    // Start ping/pong to keep connection alive
    this.startPingPong();
    
    // Send join table message
    this.sendMessage({
      type: 'join_table',
      payload: {},
      timestamp: new Date().toISOString()
    });
    
    this.options.onConnect?.();
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message: IncomingMessage = JSON.parse(event.data);
      console.log('WebSocket message received:', message.type, message);
      
      // Handle pong responses
      if (message.type === 'pong') {
        return; // Just acknowledge the pong
      }
      
      this.options.onMessage?.(message);
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  private handleError(event: Event): void {
    console.error('WebSocket error:', event);
    this.options.onError?.(new Error('WebSocket connection error'));
  }

  private handleClose(event: CloseEvent): void {
    console.log('WebSocket closed:', event.code, event.reason);
    this.isConnecting = false;
    this.stopPingPong();
    
    this.options.onDisconnect?.();
    
    if (!this.isDestroyed && event.code !== 1000) {
      // Reconnect unless it was a normal closure
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.isDestroyed) return;
    
    if (this.reconnectCount < (this.options.reconnectAttempts || 5)) {
      this.reconnectCount++;
      const delay = this.options.reconnectDelay || 3000;
      
      console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectCount})`);
      
      this.reconnectTimeout = setTimeout(() => {
        this.connect();
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
      this.options.onError?.(new Error('Max reconnection attempts reached'));
    }
  }

  private startPingPong(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendMessage({
          type: 'ping',
          payload: {},
          timestamp: new Date().toISOString()
        });
      }
    }, 30000); // Ping every 30 seconds
  }

  private stopPingPong(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  sendMessage(message: OutgoingMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      console.log('WebSocket message sent:', message.type, message);
    } else {
      console.warn('WebSocket not connected, message not sent:', message);
    }
  }

  sendPlayerAction(action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in', amount?: number): void {
    const message: PlayerActionMessage = {
      type: 'player_action',
      payload: {
        playerId: '', // Will be set by the caller
        action,
        amount,
        tableId: this.options.tableId
      },
      timestamp: new Date().toISOString()
    };
    
    this.sendMessage(message);
  }

  sendChatMessage(message: string, playerId: string, username: string): void {
    const chatMessage: ChatMessage = {
      type: 'chat',
      payload: {
        playerId,
        username,
        message,
        isSystem: false
      },
      timestamp: new Date().toISOString()
    };
    
    this.sendMessage(chatMessage);
  }

  disconnect(): void {
    this.isDestroyed = true;
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    this.stopPingPong();
    
    if (this.ws) {
      // Send leave table message before disconnecting
      if (this.ws.readyState === WebSocket.OPEN) {
        this.sendMessage({
          type: 'leave_table',
          payload: {},
          timestamp: new Date().toISOString()
        });
      }
      
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get connectionState(): string {
    if (!this.ws) return 'disconnected';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CLOSING: return 'closing';
      case WebSocket.CLOSED: return 'disconnected';
      default: return 'unknown';
    }
  }
}