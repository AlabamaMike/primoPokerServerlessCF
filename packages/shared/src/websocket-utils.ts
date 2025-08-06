import { z } from 'zod';

// WebSocket event types
export enum WebSocketEventType {
  CONNECTION_ACK = 'CONNECTION_ACK',
  PING = 'PING',
  PONG = 'PONG',
  GAME_EVENT = 'GAME_EVENT',
  PLAYER_ACTION = 'PLAYER_ACTION',
  CHAT_MESSAGE = 'CHAT_MESSAGE',
  ERROR = 'ERROR',
  RECONNECT = 'RECONNECT',
  DISCONNECT = 'DISCONNECT',
}

export enum GameEventType {
  PLAYER_JOINED = 'PLAYER_JOINED',
  PLAYER_LEFT = 'PLAYER_LEFT',
  GAME_STARTED = 'GAME_STARTED',
  GAME_ENDED = 'GAME_ENDED',
  ACTION_PERFORMED = 'ACTION_PERFORMED',
  CARDS_DEALT = 'CARDS_DEALT',
  COMMUNITY_CARDS_DEALT = 'COMMUNITY_CARDS_DEALT',
  BLINDS_POSTED = 'BLINDS_POSTED',
  NEW_BETTING_ROUND = 'NEW_BETTING_ROUND',
  HAND_COMPLETED = 'HAND_COMPLETED',
  NEW_HAND_STARTING = 'NEW_HAND_STARTING',
}

export const WSMessageSchema = z.object({
  type: z.nativeEnum(WebSocketEventType),
  payload: z.any(),
  timestamp: z.number().optional(),
  messageId: z.string().optional(),
  correlationId: z.string().optional(),
});

export const GameEventMessageSchema = z.object({
  type: z.literal(WebSocketEventType.GAME_EVENT),
  payload: z.object({
    eventType: z.nativeEnum(GameEventType),
    gameState: z.any().optional(),
    playerId: z.string().optional(),
    data: z.any().optional(),
  }),
  timestamp: z.number().optional(),
  messageId: z.string().optional(),
  correlationId: z.string().optional(),
});

export type WSMessage = z.infer<typeof WSMessageSchema>;
export type GameEventMessage = z.infer<typeof GameEventMessageSchema>;

export class MessageFactory {
  private static generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  static createMessage(
    type: WebSocketEventType,
    payload: any,
    options?: {
      messageId?: string;
      correlationId?: string;
      timestamp?: number;
    }
  ): WSMessage {
    return {
      type,
      payload,
      messageId: options?.messageId || this.generateMessageId(),
      correlationId: options?.correlationId,
      timestamp: options?.timestamp || Date.now(),
    };
  }

  static createGameEvent(
    eventType: GameEventType,
    data?: {
      gameState?: any;
      playerId?: string;
      data?: any;
    },
    options?: {
      messageId?: string;
      correlationId?: string;
      timestamp?: number;
    }
  ): GameEventMessage {
    return {
      type: WebSocketEventType.GAME_EVENT,
      payload: {
        eventType,
        gameState: data?.gameState,
        playerId: data?.playerId,
        data: data?.data,
      },
      messageId: options?.messageId || this.generateMessageId(),
      correlationId: options?.correlationId,
      timestamp: options?.timestamp || Date.now(),
    };
  }

  static createError(
    error: Error | string,
    options?: {
      messageId?: string;
      correlationId?: string;
      timestamp?: number;
      code?: string;
      details?: any;
    }
  ): WSMessage {
    return {
      type: WebSocketEventType.ERROR,
      payload: {
        message: typeof error === 'string' ? error : error.message,
        code: options?.code || 'UNKNOWN_ERROR',
        details: options?.details,
      },
      messageId: options?.messageId || this.generateMessageId(),
      correlationId: options?.correlationId,
      timestamp: options?.timestamp || Date.now(),
    };
  }

  static createPing(): WSMessage {
    return this.createMessage(WebSocketEventType.PING, null);
  }

  static createPong(): WSMessage {
    return this.createMessage(WebSocketEventType.PONG, null);
  }

  static createConnectionAck(connectionId: string): WSMessage {
    return this.createMessage(WebSocketEventType.CONNECTION_ACK, {
      connectionId,
      status: 'connected',
    });
  }

  static parseMessage(data: string | ArrayBuffer): WSMessage | null {
    try {
      let jsonString: string;
      if (typeof data === 'string') {
        jsonString = data;
      } else {
        jsonString = new TextDecoder().decode(data as ArrayBuffer);
      }
      const parsed = JSON.parse(jsonString);
      return WSMessageSchema.parse(parsed);
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
      return null;
    }
  }

  static stringify(message: WSMessage): string {
    return JSON.stringify(message);
  }
}

export class MessageQueue {
  private queue: WSMessage[] = [];
  private maxSize: number;
  private processedIds = new Set<string>();
  private maxProcessedIds: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.maxProcessedIds = maxSize * 2; // Keep track of more IDs to catch duplicates
  }

  enqueue(message: WSMessage): boolean {
    if (message.messageId && this.processedIds.has(message.messageId)) {
      return false;
    }

    this.queue.push(message);
    if (message.messageId) {
      this.processedIds.add(message.messageId);
      
      // Prevent unbounded growth of processedIds
      if (this.processedIds.size > this.maxProcessedIds) {
        const idsToRemove = this.processedIds.size - this.maxProcessedIds;
        const iterator = this.processedIds.values();
        for (let i = 0; i < idsToRemove; i++) {
          const oldestId = iterator.next().value;
          if (oldestId) {
            this.processedIds.delete(oldestId);
          }
        }
      }
    }

    if (this.queue.length > this.maxSize) {
      this.queue.shift();
    }

    return true;
  }

  dequeue(): WSMessage | undefined {
    return this.queue.shift();
  }

  peek(): WSMessage | undefined {
    return this.queue[0];
  }

  size(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
    this.processedIds.clear();
  }

  isDuplicate(messageId: string): boolean {
    return this.processedIds.has(messageId);
  }
}

interface ConnectionInfo {
  id: string;
  state: 'connecting' | 'connected' | 'disconnected' | 'error';
  playerId?: string;
  lastActivity: number;
  metadata?: Record<string, any>;
}

export class ConnectionStateManager {
  private connections = new Map<string, ConnectionInfo>();
  private reconnectionAttempts = new Map<string, number>();
  private maxReconnectAttempts = 5;
  private baseReconnectDelay = 1000;

  addConnection(id: string, info: Partial<ConnectionInfo>): void {
    this.connections.set(id, {
      id,
      state: 'connecting',
      lastActivity: Date.now(),
      ...info,
    });
  }

  updateConnectionState(id: string, state: ConnectionInfo['state']): void {
    const connection = this.connections.get(id);
    if (connection) {
      connection.state = state;
      connection.lastActivity = Date.now();
    }
  }

  updateLastActivity(id: string): void {
    const connection = this.connections.get(id);
    if (connection) {
      connection.lastActivity = Date.now();
    }
  }

  removeConnection(id: string): void {
    this.connections.delete(id);
    this.reconnectionAttempts.delete(id);
  }

  getConnection(id: string): ConnectionInfo | undefined {
    return this.connections.get(id);
  }

  getAllConnections(): ConnectionInfo[] {
    return Array.from(this.connections.values());
  }

  getActiveConnections(): ConnectionInfo[] {
    return this.getAllConnections().filter(conn => conn.state === 'connected');
  }

  calculateReconnectDelay(connectionId: string): number {
    const attempts = this.reconnectionAttempts.get(connectionId) || 0;
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, attempts),
      30000
    );
    this.reconnectionAttempts.set(connectionId, attempts + 1);
    return delay;
  }

  resetReconnectAttempts(connectionId: string): void {
    this.reconnectionAttempts.delete(connectionId);
  }

  shouldReconnect(connectionId: string): boolean {
    const attempts = this.reconnectionAttempts.get(connectionId) || 0;
    return attempts < this.maxReconnectAttempts;
  }

  cleanupStaleConnections(maxIdleTime = 300000): string[] {
    const now = Date.now();
    const staleIds: string[] = [];

    for (const [id, connection] of this.connections) {
      if (now - connection.lastActivity > maxIdleTime) {
        staleIds.push(id);
        this.removeConnection(id);
      }
    }

    return staleIds;
  }
}

export function createWebSocketBroadcaster(
  sendToConnection: (connectionId: string, message: string) => void
) {
  return {
    broadcast(connections: string[], message: WSMessage): void {
      const serialized = MessageFactory.stringify(message);
      connections.forEach(connectionId => {
        try {
          sendToConnection(connectionId, serialized);
        } catch (error) {
          console.error(`Failed to send to connection ${connectionId}:`, error);
        }
      });
    },

    broadcastToAll(
      connectionManager: ConnectionStateManager,
      message: WSMessage,
      excludeIds?: string[]
    ): void {
      const activeConnections = connectionManager.getActiveConnections()
        .filter(conn => !excludeIds?.includes(conn.id));
      
      this.broadcast(
        activeConnections.map(conn => conn.id),
        message
      );
    },

    broadcastToPlayers(
      connectionManager: ConnectionStateManager,
      playerIds: string[],
      message: WSMessage
    ): void {
      const connections = connectionManager.getAllConnections()
        .filter(conn => conn.playerId && playerIds.includes(conn.playerId))
        .map(conn => conn.id);
      
      this.broadcast(connections, message);
    },
  };
}