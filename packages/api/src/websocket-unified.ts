import { 
  MessageFactory, 
  ConnectionStateManager, 
  createWebSocketBroadcaster,
  WSMessage,
  MessageQueue
} from '@primo-poker/shared';
import {
  BaseError,
  createErrorHandler,
  ConnectionError,
  ErrorCode,
} from '@primo-poker/shared';
import { WebSocketEventType, GameEventType } from '@primo-poker/shared';
import { validateJWT } from '@primo-poker/security';

// Environment interface
interface Env {
  DB: D1Database;
  SESSION_STORE: KVNamespace;
  METRICS_NAMESPACE: KVNamespace;
  HAND_HISTORY_BUCKET: R2Bucket;
  AUDIT_BUCKET: R2Bucket;
  TABLE_OBJECTS: DurableObjectNamespace;
  GAME_TABLES: DurableObjectNamespace;
  SECURE_RNG_DO: DurableObjectNamespace;
  RATE_LIMIT_DO: DurableObjectNamespace;
  GAME_TABLE_DO: DurableObjectNamespace;
  TOURNAMENT_QUEUE: Queue;
  ANALYTICS: AnalyticsEngineDataset;
  JWT_SECRET: string;
  DATABASE_ENCRYPTION_KEY: string;
  ANTHROPIC_API_KEY?: string;
  ENVIRONMENT: string;
  NODE_ENV?: string;
  ALLOWED_ORIGINS?: string;
}

export interface UnifiedWebSocketConfig {
  heartbeatInterval?: number;
  reconnectGracePeriod?: number;
  maxMessageQueueSize?: number;
  onError?: (error: Error) => void;
}

export class UnifiedWebSocketManager {
  private connectionManager: ConnectionStateManager;
  private messageQueues: Map<string, MessageQueue>;
  private webSockets: Map<string, WebSocket>;
  private broadcaster: ReturnType<typeof createWebSocketBroadcaster>;
  private heartbeatIntervals: Map<string, number>;
  private reconnectTimers: Map<string, number>;
  private errorHandler: ReturnType<typeof createErrorHandler>;
  private config: Required<UnifiedWebSocketConfig>;

  constructor(
    private env: Env,
    config?: UnifiedWebSocketConfig
  ) {
    this.config = {
      heartbeatInterval: config?.heartbeatInterval || 30000,
      reconnectGracePeriod: config?.reconnectGracePeriod || 60000,
      maxMessageQueueSize: config?.maxMessageQueueSize || 100,
      onError: config?.onError || (() => {}),
    };

    this.connectionManager = new ConnectionStateManager();
    this.messageQueues = new Map();
    this.webSockets = new Map();
    this.heartbeatIntervals = new Map();
    this.reconnectTimers = new Map();
    
    this.broadcaster = createWebSocketBroadcaster((connectionId, message) => {
      this.sendToConnection(connectionId, message);
    });

    this.errorHandler = createErrorHandler({
      onError: this.config.onError,
    });

    this.startCleanupInterval();
  }

  async handleConnection(
    webSocket: WebSocket,
    request: Request
  ): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const connectionId = this.generateConnectionId();
    const authHeader = request.headers.get('Authorization');

    try {
      const token = authHeader?.replace('Bearer ', '');
      const payload = token ? await this.validateToken(token) : null;

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      this.setupConnection(server, connectionId, payload?.userId);

      const ackMessage = MessageFactory.createConnectionAck(connectionId);
      server.send(MessageFactory.stringify(ackMessage));

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    } catch (error) {
      await this.errorHandler(error as Error);
      return new Response('Authentication failed', { status: 401 });
    }
  }

  private setupConnection(
    webSocket: WebSocket,
    connectionId: string,
    playerId?: string
  ): void {
    const messageQueue = new MessageQueue(this.config.maxMessageQueueSize);
    this.messageQueues.set(connectionId, messageQueue);
    this.webSockets.set(connectionId, webSocket);

    this.connectionManager.addConnection(connectionId, {
      id: connectionId,
      state: 'connected',
      playerId,
    });

    webSocket.accept();

    webSocket.addEventListener('message', async (event) => {
      await this.handleMessage(connectionId, event.data);
    });

    webSocket.addEventListener('close', () => {
      this.handleDisconnection(connectionId);
    });

    webSocket.addEventListener('error', async (error) => {
      await this.errorHandler(
        new ConnectionError(
          `WebSocket error for ${connectionId}`,
          ErrorCode.CONNECTION_FAILED,
          { error }
        )
      );
      this.handleDisconnection(connectionId);
    });

    this.startHeartbeat(connectionId, webSocket);
  }

  private async handleMessage(
    connectionId: string,
    data: string | ArrayBuffer
  ): Promise<void> {
    try {
      const message = MessageFactory.parseMessage(data);
      if (!message) {
        throw new Error('Invalid message format');
      }

      const messageQueue = this.messageQueues.get(connectionId);
      if (messageQueue && message.messageId) {
        if (messageQueue.isDuplicate(message.messageId)) {
          return;
        }
        messageQueue.enqueue(message);
      }

      this.connectionManager.updateLastActivity(connectionId);

      switch (message.type) {
        case WebSocketEventType.PING:
          await this.handlePing(connectionId);
          break;
        case WebSocketEventType.PONG:
          break;
        case WebSocketEventType.GAME_EVENT:
          await this.handleGameEvent(connectionId, message);
          break;
        case WebSocketEventType.CHAT_MESSAGE:
          await this.handleChatMessage(connectionId, message);
          break;
        case WebSocketEventType.PLAYER_ACTION:
          await this.handlePlayerAction(connectionId, message);
          break;
        default:
          console.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      await this.errorHandler(error as Error);
      const errorMessage = MessageFactory.createError(error as Error, {
        correlationId: (error as any).correlationId,
      });
      this.sendToConnection(connectionId, MessageFactory.stringify(errorMessage));
    }
  }

  private async handlePing(connectionId: string): Promise<void> {
    const pong = MessageFactory.createPong();
    this.sendToConnection(connectionId, MessageFactory.stringify(pong));
  }

  private async handleGameEvent(
    connectionId: string,
    message: WSMessage
  ): Promise<void> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection?.playerId) {
      throw new Error('Player not authenticated');
    }

    const payload = message.payload as {
      tableId: string;
      eventType: GameEventType;
      data?: any;
    };

    const gameTable = this.env.GAME_TABLE.get(
      this.env.GAME_TABLE.idFromName(payload.tableId)
    );

    const response = await gameTable.fetch(
      new Request('http://internal/game-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Connection-Id': connectionId,
          'X-Player-Id': connection.playerId,
        },
        body: JSON.stringify({
          eventType: payload.eventType,
          data: payload.data,
        }),
      })
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }
  }

  private async handleChatMessage(
    connectionId: string,
    message: WSMessage
  ): Promise<void> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection?.playerId) {
      throw new Error('Player not authenticated');
    }

    const payload = message.payload as {
      tableId: string;
      message: string;
    };

    const chatMessage = MessageFactory.createMessage(
      WebSocketEventType.CHAT_MESSAGE,
      {
        playerId: connection.playerId,
        message: payload.message,
        timestamp: Date.now(),
      }
    );

    await this.broadcastToTable(payload.tableId, chatMessage, [connectionId]);
  }

  private async handlePlayerAction(
    connectionId: string,
    message: WSMessage
  ): Promise<void> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection?.playerId) {
      throw new Error('Player not authenticated');
    }

    const payload = message.payload as {
      tableId: string;
      action: any;
    };

    const gameTable = this.env.GAME_TABLE.get(
      this.env.GAME_TABLE.idFromName(payload.tableId)
    );

    const response = await gameTable.fetch(
      new Request('http://internal/player-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Connection-Id': connectionId,
          'X-Player-Id': connection.playerId,
        },
        body: JSON.stringify(payload.action),
      })
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }
  }

  async broadcastToTable(
    tableId: string,
    message: WSMessage,
    excludeIds?: string[]
  ): Promise<void> {
    const gameTable = this.env.GAME_TABLE.get(
      this.env.GAME_TABLE.idFromName(tableId)
    );

    const response = await gameTable.fetch(
      new Request('http://internal/get-players', {
        method: 'GET',
      })
    );

    if (response.ok) {
      const { playerIds } = await response.json<{ playerIds: string[] }>();
      this.broadcaster.broadcastToPlayers(
        this.connectionManager,
        playerIds.filter(id => !excludeIds?.includes(id)),
        message
      );
    }
  }

  private sendToConnection(connectionId: string, message: string): void {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection || connection.state !== 'connected') {
      console.warn(`Cannot send to disconnected connection: ${connectionId}`);
      return;
    }

    try {
      const webSocket = this.getWebSocket(connectionId);
      if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(message);
      } else {
        const queue = this.messageQueues.get(connectionId);
        if (queue) {
          queue.enqueue(MessageFactory.parseMessage(message)!);
        }
      }
    } catch (error) {
      console.error(`Failed to send message to ${connectionId}:`, error);
      this.connectionManager.updateConnectionState(connectionId, 'error');
    }
  }

  private handleDisconnection(connectionId: string): void {
    this.connectionManager.updateConnectionState(connectionId, 'disconnected');
    
    const heartbeatInterval = this.heartbeatIntervals.get(connectionId);
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      this.heartbeatIntervals.delete(connectionId);
    }

    const reconnectTimer = setTimeout(() => {
      this.connectionManager.removeConnection(connectionId);
      this.messageQueues.delete(connectionId);
      this.webSockets.delete(connectionId);
      this.reconnectTimers.delete(connectionId);
    }, this.config.reconnectGracePeriod);

    this.reconnectTimers.set(connectionId, reconnectTimer);
  }

  private startHeartbeat(connectionId: string, webSocket: WebSocket): void {
    const interval = setInterval(() => {
      const connection = this.connectionManager.getConnection(connectionId);
      if (!connection || connection.state !== 'connected') {
        clearInterval(interval);
        return;
      }

      const ping = MessageFactory.createPing();
      try {
        webSocket.send(MessageFactory.stringify(ping));
      } catch (error) {
        console.error(`Heartbeat failed for ${connectionId}:`, error);
        this.handleDisconnection(connectionId);
      }
    }, this.config.heartbeatInterval);

    this.heartbeatIntervals.set(connectionId, interval);
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      const staleIds = this.connectionManager.cleanupStaleConnections(300000);
      staleIds.forEach(id => {
        this.messageQueues.delete(id);
        this.webSockets.delete(id);
        const heartbeat = this.heartbeatIntervals.get(id);
        if (heartbeat) {
          clearInterval(heartbeat);
          this.heartbeatIntervals.delete(id);
        }
      });
    }, 60000);
  }

  private async validateToken(token: string): Promise<any> {
    try {
      return await validateJWT(token, this.env.JWT_SECRET);
    } catch (error) {
      throw new BaseError(
        'Invalid authentication token',
        ErrorCode.AUTHENTICATION_FAILED,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private generateConnectionId(): string {
    return `ws-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private getWebSocket(connectionId: string): WebSocket | undefined {
    return this.webSockets.get(connectionId);
  }

  async reconnectPlayer(
    playerId: string,
    newConnectionId: string,
    webSocket: WebSocket
  ): Promise<boolean> {
    const oldConnections = this.connectionManager
      .getAllConnections()
      .filter(conn => conn.playerId === playerId && conn.state === 'disconnected');

    if (oldConnections.length === 0) {
      return false;
    }

    const oldConnection = oldConnections[0];
    const reconnectTimer = this.reconnectTimers.get(oldConnection.id);
    
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      this.reconnectTimers.delete(oldConnection.id);
    }

    const oldQueue = this.messageQueues.get(oldConnection.id);
    if (oldQueue) {
      this.messageQueues.set(newConnectionId, oldQueue);
      this.messageQueues.delete(oldConnection.id);
    }

    this.connectionManager.removeConnection(oldConnection.id);
    this.setupConnection(webSocket, newConnectionId, playerId);

    let message;
    while (oldQueue && (message = oldQueue.dequeue())) {
      this.sendToConnection(newConnectionId, MessageFactory.stringify(message));
    }

    return true;
  }

  getConnectionStats(): {
    total: number;
    active: number;
    disconnected: number;
    queuedMessages: number;
  } {
    const connections = this.connectionManager.getAllConnections();
    const active = connections.filter(c => c.state === 'connected').length;
    const disconnected = connections.filter(c => c.state === 'disconnected').length;
    
    let queuedMessages = 0;
    this.messageQueues.forEach(queue => {
      queuedMessages += queue.size();
    });

    return {
      total: connections.length,
      active,
      disconnected,
      queuedMessages,
    };
  }
}