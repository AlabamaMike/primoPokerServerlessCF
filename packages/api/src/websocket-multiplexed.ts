import {
  WebSocketMessage,
  GameUpdateMessage,
  PlayerActionMessage,
  ChatMessage,
  createWebSocketMessage,
  ValidationUtils,
  RandomUtils,
} from '@primo-poker/shared';
import { AuthenticationManager, TokenPayload } from '@primo-poker/security';
import { WebSocketManager, WebSocketConnection } from './websocket';

export enum WebSocketChannel {
  GAME = 'game',
  LOBBY = 'lobby',
  CHAT = 'chat',
  SPECTATOR = 'spectator',
  ADMIN = 'admin',
}

export interface ChannelSubscription {
  channel: WebSocketChannel;
  tableId?: string | null;
  subscribedAt: Date;
  permissions: ChannelPermission[];
}

export interface ChannelPermission {
  action: 'read' | 'write' | 'broadcast';
  channel: WebSocketChannel;
}

export interface MultiplexedConnection extends WebSocketConnection {
  subscriptions: Map<string, ChannelSubscription>;
  role: 'player' | 'spectator' | 'admin';
  rateLimits: Map<string, RateLimitInfo>;
}

interface RateLimitInfo {
  count: number;
  windowStart: number;
}

interface ChannelConfig {
  maxSubscriptions: number;
  rateLimitPerMinute?: number;
  requiresTableId?: boolean;
  permissions: {
    player: ChannelPermission[];
    spectator: ChannelPermission[];
    admin: ChannelPermission[];
  };
}

export class MultiplexedWebSocketManager extends WebSocketManager {
  private multiplexedConnections = new Map<string, MultiplexedConnection>();
  private channelSubscribers = new Map<string, Set<string>>(); // channel:tableId -> connectionIds
  private channelConfigs: Map<WebSocketChannel, ChannelConfig>;
  private maxChannelsPerConnection = 10;

  constructor(jwtSecret: string) {
    super(jwtSecret);
    this.channelConfigs = this.initializeChannelConfigs();
  }

  private initializeChannelConfigs(): Map<WebSocketChannel, ChannelConfig> {
    const configs = new Map<WebSocketChannel, ChannelConfig>();

    configs.set(WebSocketChannel.GAME, {
      maxSubscriptions: 1,
      requiresTableId: true,
      permissions: {
        player: [
          { action: 'read', channel: WebSocketChannel.GAME },
          { action: 'write', channel: WebSocketChannel.GAME },
        ],
        spectator: [],
        admin: [
          { action: 'read', channel: WebSocketChannel.GAME },
          { action: 'write', channel: WebSocketChannel.GAME },
        ],
      },
    });

    configs.set(WebSocketChannel.LOBBY, {
      maxSubscriptions: 1,
      requiresTableId: false,
      permissions: {
        player: [{ action: 'read', channel: WebSocketChannel.LOBBY }],
        spectator: [{ action: 'read', channel: WebSocketChannel.LOBBY }],
        admin: [
          { action: 'read', channel: WebSocketChannel.LOBBY },
          { action: 'write', channel: WebSocketChannel.LOBBY },
        ],
      },
    });

    configs.set(WebSocketChannel.CHAT, {
      maxSubscriptions: 5,
      rateLimitPerMinute: 30,
      requiresTableId: true,
      permissions: {
        player: [
          { action: 'read', channel: WebSocketChannel.CHAT },
          { action: 'write', channel: WebSocketChannel.CHAT },
        ],
        spectator: [{ action: 'read', channel: WebSocketChannel.CHAT }],
        admin: [
          { action: 'read', channel: WebSocketChannel.CHAT },
          { action: 'write', channel: WebSocketChannel.CHAT },
        ],
      },
    });

    configs.set(WebSocketChannel.SPECTATOR, {
      maxSubscriptions: 3,
      requiresTableId: true,
      permissions: {
        player: [],
        spectator: [{ action: 'read', channel: WebSocketChannel.SPECTATOR }],
        admin: [{ action: 'read', channel: WebSocketChannel.SPECTATOR }],
      },
    });

    configs.set(WebSocketChannel.ADMIN, {
      maxSubscriptions: 1,
      requiresTableId: false,
      permissions: {
        player: [],
        spectator: [],
        admin: [
          { action: 'read', channel: WebSocketChannel.ADMIN },
          { action: 'write', channel: WebSocketChannel.ADMIN },
          { action: 'broadcast', channel: WebSocketChannel.ADMIN },
        ],
      },
    });

    return configs;
  }

  async handleConnection(ws: WebSocket, request: Request): Promise<void> {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    const tableId = url.searchParams.get('tableId');
    const spectatorMode = url.searchParams.get('spectator') === 'true';
    const role = url.searchParams.get('role') || (spectatorMode ? 'spectator' : 'player');

    if (!token) {
      ws.close(1008, 'Missing token');
      return;
    }

    // Verify authentication
    const authResult = await this.authManager.verifyAccessToken(token);
    if (!authResult.valid || !authResult.payload) {
      ws.close(1008, 'Invalid authentication token');
      return;
    }

    const connectionId = RandomUtils.generateUUID();
    const connection: MultiplexedConnection = {
      ws,
      playerId: authResult.payload.userId,
      tableId: tableId || '',
      username: authResult.payload.username,
      isAuthenticated: true,
      lastActivity: new Date(),
      subscriptions: new Map(),
      role: (authResult.payload.role || role) as 'player' | 'spectator' | 'admin',
      rateLimits: new Map(),
    };

    // Store connection
    this.multiplexedConnections.set(connectionId, connection);

    // Set up event handlers
    ws.addEventListener('message', (event) => {
      this.handleMultiplexedMessage(connectionId, event.data as string);
    });

    ws.addEventListener('close', () => {
      this.handleMultiplexedDisconnection(connectionId);
    });

    ws.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
      this.handleMultiplexedDisconnection(connectionId);
    });

    // Send welcome message
    this.sendToConnection(connectionId, createWebSocketMessage(
      'connection_established',
      {
        playerId: connection.playerId,
        tableId: connection.tableId,
        role: connection.role,
      }
    ));
  }

  private async handleMultiplexedMessage(connectionId: string, messageData: string): Promise<void> {
    const connection = this.multiplexedConnections.get(connectionId);
    if (!connection) return;

    try {
      const message: WebSocketMessage = JSON.parse(messageData);
      connection.lastActivity = new Date();

      switch (message.type) {
        case 'subscribe':
          await this.handleSubscribe(connectionId, message.payload);
          break;
        case 'unsubscribe':
          await this.handleUnsubscribe(connectionId, message.payload);
          break;
        case 'player_action':
          await this.handleChannelMessage(connectionId, WebSocketChannel.GAME, message);
          break;
        case 'chat':
          await this.handleChannelMessage(connectionId, WebSocketChannel.CHAT, message);
          break;
        case 'ping':
          this.sendToConnection(connectionId, createWebSocketMessage('pong', {}));
          break;
        default:
          this.sendError(connectionId, 'Unknown message type');
      }
    } catch (error) {
      this.sendError(connectionId, 'Invalid message format');
    }
  }

  private async handleSubscribe(connectionId: string, payload: any): Promise<void> {
    const connection = this.multiplexedConnections.get(connectionId);
    if (!connection) return;

    const { channel, tableId } = payload;
    const channelEnum = channel as WebSocketChannel;
    const config = this.channelConfigs.get(channelEnum);

    if (!config) {
      this.sendError(connectionId, 'Invalid channel');
      return;
    }

    // Check permissions
    const hasPermission = this.checkChannelPermission(connection, channelEnum, 'read');
    if (!hasPermission) {
      this.sendError(connectionId, 'Insufficient permissions for channel');
      return;
    }

    // Check if tableId is required
    if (config.requiresTableId && !tableId) {
      this.sendError(connectionId, 'Table ID required for this channel');
      return;
    }

    // Check subscription limits
    const channelSubs = Array.from(connection.subscriptions.values())
      .filter(sub => sub.channel === channelEnum);
    if (channelSubs.length >= config.maxSubscriptions) {
      this.sendError(connectionId, 'Maximum subscriptions for channel reached');
      return;
    }

    // Check total subscription limit
    if (connection.subscriptions.size >= this.maxChannelsPerConnection) {
      this.sendError(connectionId, 'Maximum channel subscriptions exceeded');
      return;
    }

    // Create subscription
    const subscriptionKey = this.getSubscriptionKey(channelEnum, tableId);
    const subscription: ChannelSubscription = {
      channel: channelEnum,
      tableId,
      subscribedAt: new Date(),
      permissions: config.permissions[connection.role] || [],
    };

    connection.subscriptions.set(subscriptionKey, subscription);

    // Add to channel subscribers
    const channelKey = this.getChannelKey(channelEnum, tableId);
    if (!this.channelSubscribers.has(channelKey)) {
      this.channelSubscribers.set(channelKey, new Set());
    }
    this.channelSubscribers.get(channelKey)!.add(connectionId);

    // Send confirmation
    this.sendToConnection(connectionId, createWebSocketMessage('subscription_confirmed', {
      channel: channelEnum,
      tableId,
      permissions: subscription.permissions,
    }));
  }

  private async handleUnsubscribe(connectionId: string, payload: any): Promise<void> {
    const connection = this.multiplexedConnections.get(connectionId);
    if (!connection) return;

    const { channel, tableId } = payload;
    const channelEnum = channel as WebSocketChannel;
    const subscriptionKey = this.getSubscriptionKey(channelEnum, tableId);

    if (!connection.subscriptions.has(subscriptionKey)) {
      this.sendError(connectionId, 'Not subscribed to channel');
      return;
    }

    // Remove subscription
    connection.subscriptions.delete(subscriptionKey);

    // Remove from channel subscribers
    const channelKey = this.getChannelKey(channelEnum, tableId);
    const subscribers = this.channelSubscribers.get(channelKey);
    if (subscribers) {
      subscribers.delete(connectionId);
      if (subscribers.size === 0) {
        this.channelSubscribers.delete(channelKey);
      }
    }

    // Send confirmation
    this.sendToConnection(connectionId, createWebSocketMessage('unsubscription_confirmed', {
      channel: channelEnum,
      tableId,
    }));
  }

  private async handleChannelMessage(
    connectionId: string,
    channel: WebSocketChannel,
    message: WebSocketMessage
  ): Promise<void> {
    const connection = this.multiplexedConnections.get(connectionId);
    if (!connection) return;

    // Check write permission
    if (!this.checkChannelPermission(connection, channel, 'write')) {
      this.sendError(connectionId, 'Spectators cannot perform game actions');
      return;
    }

    // Apply rate limiting for chat
    if (channel === WebSocketChannel.CHAT) {
      if (!this.checkRateLimit(connectionId, channel)) {
        this.sendError(connectionId, 'Rate limit exceeded');
        return;
      }
    }

    // Process message based on channel
    switch (channel) {
      case WebSocketChannel.GAME:
        await this.processGameMessage(connectionId, message as PlayerActionMessage);
        break;
      case WebSocketChannel.CHAT:
        await this.processChatMessage(connectionId, message as ChatMessage);
        break;
    }
  }

  private checkChannelPermission(
    connection: MultiplexedConnection,
    channel: WebSocketChannel,
    action: 'read' | 'write' | 'broadcast'
  ): boolean {
    const config = this.channelConfigs.get(channel);
    if (!config) return false;

    const permissions = config.permissions[connection.role] || [];
    return permissions.some(p => p.channel === channel && p.action === action);
  }

  private checkRateLimit(connectionId: string, channel: WebSocketChannel): boolean {
    const connection = this.multiplexedConnections.get(connectionId);
    if (!connection) return false;

    const config = this.channelConfigs.get(channel);
    if (!config?.rateLimitPerMinute) return true;

    const now = Date.now();
    const windowKey = `${channel}:rate`;
    const rateInfo = connection.rateLimits.get(windowKey) || { count: 0, windowStart: now };

    // Reset window if expired
    if (now - rateInfo.windowStart > 60000) {
      rateInfo.count = 0;
      rateInfo.windowStart = now;
    }

    rateInfo.count++;
    connection.rateLimits.set(windowKey, rateInfo);

    return rateInfo.count <= config.rateLimitPerMinute;
  }

  private async processGameMessage(connectionId: string, message: PlayerActionMessage): Promise<void> {
    // Forward to game processing
    // In real implementation, would interact with table durable object
    const connection = this.multiplexedConnections.get(connectionId);
    if (!connection) return;

    const gameUpdate: GameUpdateMessage = createWebSocketMessage(
      'game_update',
      {} // Would be actual game state
    ) as GameUpdateMessage;

    // Broadcast to game channel subscribers
    this.broadcastToChannel(WebSocketChannel.GAME, connection.tableId, gameUpdate);
  }

  private async processChatMessage(connectionId: string, message: ChatMessage): Promise<void> {
    const connection = this.multiplexedConnections.get(connectionId);
    if (!connection) return;

    // Sanitize and broadcast chat message
    const sanitizedMessage = ValidationUtils.sanitizeChatMessage(message.payload.message);
    
    const chatMessage: ChatMessage = createWebSocketMessage(
      'chat',
      {
        playerId: connection.playerId,
        username: connection.username,
        message: sanitizedMessage,
        isSystem: false,
      }
    ) as ChatMessage;

    // Broadcast to chat channel subscribers
    const tableId = (message.payload as any).tableId || connection.tableId;
    this.broadcastToChannel(WebSocketChannel.CHAT, tableId, chatMessage);
  }

  public broadcastToChannel(
    channel: WebSocketChannel,
    tableId: string | null,
    message: WebSocketMessage
  ): void {
    const channelKey = this.getChannelKey(channel, tableId);
    const subscribers = this.channelSubscribers.get(channelKey);
    
    if (!subscribers) return;

    for (const connectionId of subscribers) {
      this.sendToConnection(connectionId, message);
    }
  }

  protected sendToConnection(connectionId: string, message: WebSocketMessage): void {
    const connection = this.multiplexedConnections.get(connectionId);
    if (!connection || connection.ws.readyState !== 1) return; // 1 = OPEN

    try {
      connection.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send message:', error);
      this.handleMultiplexedDisconnection(connectionId);
    }
  }

  protected sendError(connectionId: string, message: string): void {
    this.sendToConnection(connectionId, createWebSocketMessage('error', { message }));
  }

  private handleMultiplexedDisconnection(connectionId: string): void {
    const connection = this.multiplexedConnections.get(connectionId);
    if (!connection) return;

    // Remove from all channel subscriptions
    for (const [key, subscription] of connection.subscriptions) {
      const channelKey = this.getChannelKey(subscription.channel, subscription.tableId);
      const subscribers = this.channelSubscribers.get(channelKey);
      if (subscribers) {
        subscribers.delete(connectionId);
        if (subscribers.size === 0) {
          this.channelSubscribers.delete(channelKey);
        }
      }
    }

    // Remove connection
    this.multiplexedConnections.delete(connectionId);
  }

  private getSubscriptionKey(channel: WebSocketChannel, tableId?: string | null): string {
    return tableId ? `${channel}:${tableId}` : channel;
  }

  private getChannelKey(channel: WebSocketChannel, tableId?: string | null): string {
    return tableId ? `${channel}:${tableId}` : `${channel}:global`;
  }

  // Public API for getting connection info
  public getConnectionInfo(ws: WebSocket): MultiplexedConnection | undefined {
    for (const [_, connection] of this.multiplexedConnections) {
      if (connection.ws === ws) {
        return connection;
      }
    }
    return undefined;
  }
}