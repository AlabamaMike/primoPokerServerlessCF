/**
 * WebSocket connection events and states
 */

export enum WebSocketState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
}

export interface WebSocketConnectionEvent {
  type: 'connection';
  state: WebSocketState;
  timestamp: number;
  details?: {
    sessionId?: string;
    reconnectAttempt?: number;
    error?: string;
  };
}

export interface WebSocketMetrics {
  messagesReceived: number;
  messagesSent: number;
  bytesReceived: number;
  bytesSent: number;
  connectionTime: number;
  lastMessageTime: number;
  latency: number;
  reconnects: number;
}

export interface WebSocketConfig {
  url: string;
  protocols?: string[];
  reconnect: boolean;
  reconnectInterval: number;
  reconnectMaxAttempts: number;
  heartbeatInterval: number;
  messageTimeout: number;
  compression: boolean;
}

export interface WebSocketSubscription {
  id: string;
  topic: string;
  filters?: Record<string, unknown>;
  callback: (message: any) => void;
}

export interface WebSocketManager {
  connect(): Promise<void>;
  disconnect(): void;
  send(message: any): void;
  subscribe(topic: string, callback: (message: any) => void): string;
  unsubscribe(subscriptionId: string): void;
  getState(): WebSocketState;
  getMetrics(): WebSocketMetrics;
}