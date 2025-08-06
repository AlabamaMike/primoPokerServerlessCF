import {
  WebSocketMessage,
  GameUpdateMessage,
  PlayerActionMessage,
  ChatMessage,
  GameState,
  Player,
  ValidationUtils,
  RandomUtils,
  createWebSocketMessage,
} from '@primo-poker/shared';
import { AuthenticationManager, TokenPayload } from '@primo-poker/security';

export interface WebSocketConnection {
  ws: WebSocket;
  playerId: string;
  tableId: string;
  username: string;
  isAuthenticated: boolean;
  lastActivity: Date;
}

export class WebSocketManager {
  private connections = new Map<string, WebSocketConnection>();
  private tableConnections = new Map<string, Set<string>>();
  private authManager: AuthenticationManager;

  constructor(jwtSecret: string) {
    this.authManager = new AuthenticationManager(jwtSecret);
  }

  async handleConnection(ws: WebSocket, request: Request): Promise<void> {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    const tableId = url.searchParams.get('tableId');

    if (!token || !tableId) {
      ws.close(1008, 'Missing token or tableId');
      return;
    }

    // Verify authentication
    const authResult = await this.authManager.verifyAccessToken(token);
    if (!authResult.valid || !authResult.payload) {
      ws.close(1008, 'Invalid authentication token');
      return;
    }

    const connectionId = RandomUtils.generateUUID();
    const connection: WebSocketConnection = {
      ws,
      playerId: authResult.payload.userId,
      tableId,
      username: authResult.payload.username,
      isAuthenticated: true,
      lastActivity: new Date(),
    };

    // Store connection
    this.connections.set(connectionId, connection);
    
    // Add to table connections
    if (!this.tableConnections.has(tableId)) {
      this.tableConnections.set(tableId, new Set());
    }
    this.tableConnections.get(tableId)!.add(connectionId);

    // Set up event handlers
    ws.addEventListener('message', (event) => {
      this.handleMessage(connectionId, event.data as string);
    });

    ws.addEventListener('close', () => {
      this.handleDisconnection(connectionId);
    });

    ws.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
      this.handleDisconnection(connectionId);
    });

    // Send welcome message
    this.sendMessage(connectionId, createWebSocketMessage(
      'connection_established',
      {
        playerId: connection.playerId,
        tableId: connection.tableId,
      }
    ));

    // Set up ping/pong for connection health
    this.setupPingPong(connectionId);
  }

  private async handleMessage(connectionId: string, messageData: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      const message: WebSocketMessage = JSON.parse(messageData);
      connection.lastActivity = new Date();

      switch (message.type) {
        case 'player_action':
          await this.handlePlayerAction(connectionId, message as PlayerActionMessage);
          break;
        case 'chat':
          await this.handleChatMessage(connectionId, message as ChatMessage);
          break;
        case 'ping':
          this.sendMessage(connectionId, createWebSocketMessage('pong', {}));
          break;
        case 'join_table':
          await this.handleJoinTable(connectionId);
          break;
        case 'leave_table':
          await this.handleLeaveTable(connectionId);
          break;
        default:
          this.sendError(connectionId, 'Unknown message type');
      }
    } catch (error) {
      this.sendError(connectionId, 'Invalid message format');
    }
  }

  private async handlePlayerAction(
    connectionId: string,
    message: PlayerActionMessage
  ): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Validate that the action is from the authenticated player
    if (message.payload.playerId !== connection.playerId) {
      this.sendError(connectionId, 'Unauthorized action');
      return;
    }

    try {
      // Forward to the table's durable object
      // In a real implementation, this would interact with the table durable object
      
      // For now, echo back the action as a game update
      const gameUpdate: GameUpdateMessage = createWebSocketMessage(
        'game_update',
        {} as GameState // Would be actual game state
      ) as GameUpdateMessage;

      // Broadcast to all players at the table
      this.broadcastToTable(connection.tableId, gameUpdate);
    } catch (error) {
      this.sendError(connectionId, 'Failed to process action');
    }
  }

  private async handleChatMessage(
    connectionId: string,
    message: ChatMessage
  ): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Validate and sanitize chat message
    const sanitizedMessage = ValidationUtils.sanitizeChatMessage(message.payload.message);
    
    if (!sanitizedMessage.trim()) {
      this.sendError(connectionId, 'Empty message');
      return;
    }

    const chatMessage: ChatMessage = createWebSocketMessage(
      'chat',
      {
        playerId: connection.playerId,
        username: connection.username,
        message: sanitizedMessage,
        isSystem: false,
      }
    ) as ChatMessage;

    // Broadcast to all players at the table
    this.broadcastToTable(connection.tableId, chatMessage);
  }

  private async handleJoinTable(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Send current table state to the new player
    // In a real implementation, fetch from table durable object
    const tableState = {
      players: [] as Player[],
      gameState: null as GameState | null,
    };

    this.sendMessage(connectionId, createWebSocketMessage('table_state', tableState));

    // Notify other players
    const joinNotification: ChatMessage = createWebSocketMessage(
      'chat',
      {
        playerId: 'system',
        username: 'System',
        message: `${connection.username} joined the table`,
        isSystem: true,
      }
    ) as ChatMessage;

    this.broadcastToTable(connection.tableId, joinNotification, connectionId);
  }

  private async handleLeaveTable(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Notify other players
    const leaveNotification: ChatMessage = createWebSocketMessage(
      'chat',
      {
        playerId: 'system',
        username: 'System',
        message: `${connection.username} left the table`,
        isSystem: true,
      }
    ) as ChatMessage;

    this.broadcastToTable(connection.tableId, leaveNotification, connectionId);
    
    // Close connection
    connection.ws.close(1000, 'Player left table');
  }

  private handleDisconnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Remove from connections
    this.connections.delete(connectionId);

    // Remove from table connections
    const tableConnections = this.tableConnections.get(connection.tableId);
    if (tableConnections) {
      tableConnections.delete(connectionId);
      if (tableConnections.size === 0) {
        this.tableConnections.delete(connection.tableId);
      }
    }

    // Notify other players
    const disconnectNotification: ChatMessage = createWebSocketMessage(
      'chat',
      {
        playerId: 'system',
        username: 'System',
        message: `${connection.username} disconnected`,
        isSystem: true,
      }
    ) as ChatMessage;

    this.broadcastToTable(connection.tableId, disconnectNotification);
  }

  private sendMessage(connectionId: string, message: WebSocketMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) return;

    try {
      connection.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send message:', error);
      this.handleDisconnection(connectionId);
    }
  }

  private sendError(connectionId: string, message: string): void {
    this.sendMessage(connectionId, createWebSocketMessage('error', { message }));
  }

  private broadcastToTable(
    tableId: string,
    message: WebSocketMessage,
    excludeConnectionId?: string
  ): void {
    const connectionIds = this.tableConnections.get(tableId);
    if (!connectionIds) return;

    for (const connectionId of connectionIds) {
      if (excludeConnectionId && connectionId === excludeConnectionId) continue;
      this.sendMessage(connectionId, message);
    }
  }

  private setupPingPong(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Send ping every 30 seconds
    const pingInterval = setInterval(() => {
      if (!this.connections.has(connectionId)) {
        clearInterval(pingInterval);
        return;
      }

      this.sendMessage(connectionId, createWebSocketMessage('ping', {}));
    }, 30000);

    // Check for stale connections every minute
    const staleCheckInterval = setInterval(() => {
      const conn = this.connections.get(connectionId);
      if (!conn) {
        clearInterval(staleCheckInterval);
        clearInterval(pingInterval);
        return;
      }

      const now = new Date();
      const timeSinceLastActivity = now.getTime() - conn.lastActivity.getTime();
      
      // Close connection if no activity for 5 minutes
      if (timeSinceLastActivity > 5 * 60 * 1000) {
        conn.ws.close(1000, 'Connection timeout');
        clearInterval(staleCheckInterval);
        clearInterval(pingInterval);
      }
    }, 60000);
  }

  // Public methods for broadcasting game updates
  public broadcastGameUpdate(tableId: string, gameState: GameState): void {
    const gameUpdate: GameUpdateMessage = createWebSocketMessage(
      'game_update',
      gameState
    ) as GameUpdateMessage;

    this.broadcastToTable(tableId, gameUpdate);
  }

  public broadcastSystemMessage(tableId: string, message: string): void {
    const systemMessage: ChatMessage = createWebSocketMessage(
      'chat',
      {
        playerId: 'system',
        username: 'System',
        message,
        isSystem: true,
      }
    ) as ChatMessage;

    this.broadcastToTable(tableId, systemMessage);
  }

  // Connection management
  public getTableConnections(tableId: string): number {
    return this.tableConnections.get(tableId)?.size || 0;
  }

  public getActiveConnections(): number {
    return this.connections.size;
  }

  public closeTableConnections(tableId: string): void {
    const connectionIds = this.tableConnections.get(tableId);
    if (!connectionIds) return;

    for (const connectionId of connectionIds) {
      const connection = this.connections.get(connectionId);
      if (connection) {
        connection.ws.close(1000, 'Table closed');
      }
    }
  }

  // Cleanup stale connections
  public cleanup(): void {
    const now = new Date();
    const connectionsToRemove: string[] = [];

    for (const [connectionId, connection] of this.connections) {
      const timeSinceLastActivity = now.getTime() - connection.lastActivity.getTime();
      
      // Remove connections inactive for more than 10 minutes
      if (timeSinceLastActivity > 10 * 60 * 1000) {
        connectionsToRemove.push(connectionId);
      }
    }

    for (const connectionId of connectionsToRemove) {
      this.handleDisconnection(connectionId);
    }
  }
}
