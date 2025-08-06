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
import { 
  ErrorRecoveryManager, 
  OperationContext,
  ConnectionFailureContext,
  GameError
} from '@primo-poker/core';

export interface WebSocketConnection {
  ws: WebSocket;
  playerId: string;
  tableId: string;
  username: string;
  isAuthenticated: boolean;
  lastActivity: Date;
  reconnectAttempts: number;
  connectionEstablished: Date;
}

export class EnhancedWebSocketManager {
  private connections = new Map<string, WebSocketConnection>();
  private tableConnections = new Map<string, Set<string>>();
  private playerConnectionMap = new Map<string, string>(); // playerId -> connectionId
  private authManager: AuthenticationManager;
  private errorRecovery: ErrorRecoveryManager;
  private gracePeriodConnections = new Map<string, NodeJS.Timeout>();

  constructor(jwtSecret: string) {
    this.authManager = new AuthenticationManager(jwtSecret);
    this.errorRecovery = new ErrorRecoveryManager();
    
    // Configure error recovery policies
    this.configureErrorRecovery();
  }

  private configureErrorRecovery(): void {
    // WebSocket-specific retry policy
    this.errorRecovery.configureRetryPolicy('websocket-send', {
      maxAttempts: 3,
      backoffStrategy: 'exponential',
      initialDelay: 100,
      maxDelay: 2000,
      jitter: true,
    });

    // Connection recovery policy
    this.errorRecovery.configureRetryPolicy('websocket-reconnect', {
      maxAttempts: 5,
      backoffStrategy: 'exponential',
      initialDelay: 1000,
      maxDelay: 30000,
      jitter: true,
    });
  }

  async handleConnection(ws: WebSocket, request: Request): Promise<void> {
    const context: OperationContext = {
      operationName: 'websocket-connection',
      resourceType: 'websocket',
      critical: false,
    };

    try {
      await this.errorRecovery.executeWithRecovery(
        async () => this.establishConnection(ws, request),
        context
      );
    } catch (error) {
      console.error('Failed to establish WebSocket connection:', error);
      ws.close(1008, 'Connection failed');
    }
  }

  private async establishConnection(ws: WebSocket, request: Request): Promise<void> {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    const tableId = url.searchParams.get('tableId');

    if (!token || !tableId) {
      throw new Error('Missing token or tableId');
    }

    // Verify authentication
    const authResult = await this.authManager.verifyAccessToken(token);
    if (!authResult.valid || !authResult.payload) {
      throw new Error('Invalid authentication token');
    }

    const playerId = authResult.payload.userId;
    
    // Check for existing connection (possible reconnection)
    const existingConnectionId = this.playerConnectionMap.get(playerId);
    if (existingConnectionId) {
      await this.handleReconnection(existingConnectionId, ws, authResult.payload, tableId);
      return;
    }

    // New connection
    const connectionId = RandomUtils.generateUUID();
    const connection: WebSocketConnection = {
      ws,
      playerId,
      tableId,
      username: authResult.payload.username,
      isAuthenticated: true,
      lastActivity: new Date(),
      reconnectAttempts: 0,
      connectionEstablished: new Date(),
    };

    // Store connection
    this.connections.set(connectionId, connection);
    this.playerConnectionMap.set(playerId, connectionId);
    
    // Add to table connections
    if (!this.tableConnections.has(tableId)) {
      this.tableConnections.set(tableId, new Set());
    }
    this.tableConnections.get(tableId)!.add(connectionId);

    // Cancel any grace period for this player
    this.cancelGracePeriod(playerId);

    // Set up event handlers with error recovery
    this.setupEventHandlers(connectionId, ws);

    // Send welcome message
    await this.sendMessageWithRecovery(connectionId, createWebSocketMessage(
      'connection_established',
      {
        playerId: connection.playerId,
        tableId: connection.tableId,
      }
    ));

    // Set up health monitoring
    this.setupHealthMonitoring(connectionId);
  }

  private async handleReconnection(
    oldConnectionId: string,
    newWs: WebSocket,
    authPayload: TokenPayload,
    tableId: string
  ): Promise<void> {
    const oldConnection = this.connections.get(oldConnectionId);
    if (!oldConnection) return;

    // Update connection with new WebSocket
    oldConnection.ws = newWs;
    oldConnection.lastActivity = new Date();
    oldConnection.reconnectAttempts++;

    // Cancel grace period
    this.cancelGracePeriod(authPayload.userId);

    // Re-establish event handlers
    this.setupEventHandlers(oldConnectionId, newWs);

    // Send reconnection success message
    await this.sendMessageWithRecovery(oldConnectionId, createWebSocketMessage(
      'reconnection_successful',
      {
        playerId: authPayload.userId,
        tableId,
        missedUpdates: [], // In real implementation, fetch from state synchronizer
      }
    ));

    // Notify table of reconnection
    const reconnectNotification: ChatMessage = createWebSocketMessage(
      'chat',
      {
        playerId: 'system',
        username: 'System',
        message: `${authPayload.username} reconnected`,
        isSystem: true,
      }
    ) as ChatMessage;

    await this.broadcastToTableWithRecovery(tableId, reconnectNotification, oldConnectionId);
  }

  private setupEventHandlers(connectionId: string, ws: WebSocket): void {
    ws.addEventListener('message', async (event) => {
      const context: OperationContext = {
        operationName: 'websocket-message-handler',
        resourceType: 'websocket',
        resourceId: connectionId,
        critical: false,
      };

      try {
        await this.errorRecovery.executeWithRecovery(
          async () => this.handleMessage(connectionId, event.data as string),
          context
        );
      } catch (error) {
        console.error('Failed to handle WebSocket message:', error);
        this.sendError(connectionId, 'Failed to process message');
      }
    });

    ws.addEventListener('close', () => {
      this.handleDisconnectionWithRecovery(connectionId);
    });

    ws.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
      this.handleDisconnectionWithRecovery(connectionId);
    });
  }

  private async handleMessage(connectionId: string, messageData: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const message: WebSocketMessage = JSON.parse(messageData);
    connection.lastActivity = new Date();

    switch (message.type) {
      case 'player_action':
        await this.handlePlayerActionWithRecovery(connectionId, message as PlayerActionMessage);
        break;
      case 'chat':
        await this.handleChatMessage(connectionId, message as ChatMessage);
        break;
      case 'ping':
        await this.sendMessageWithRecovery(connectionId, createWebSocketMessage('pong', {}));
        break;
      case 'join_table':
        await this.handleJoinTable(connectionId);
        break;
      case 'leave_table':
        await this.handleLeaveTable(connectionId);
        break;
      default:
        throw new Error('Unknown message type');
    }
  }

  private async handlePlayerActionWithRecovery(
    connectionId: string,
    message: PlayerActionMessage
  ): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Validate authorization
    if (message.payload.playerId !== connection.playerId) {
      throw new Error('Unauthorized action');
    }

    const context: OperationContext = {
      operationName: 'player-action',
      resourceType: 'game',
      resourceId: connection.tableId,
      critical: true, // Player actions are critical
    };

    await this.errorRecovery.executeWithRecovery(
      async () => {
        // Forward to the table's durable object
        // In real implementation, this would interact with the table DO
        
        const gameUpdate: GameUpdateMessage = createWebSocketMessage(
          'game_update',
          {} as GameState
        ) as GameUpdateMessage;

        // Broadcast to all players at the table
        await this.broadcastToTableWithRecovery(connection.tableId, gameUpdate);
      },
      context
    );
  }

  private handleDisconnectionWithRecovery(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const failureContext: ConnectionFailureContext = {
      error: new Error('WebSocket disconnected'),
      disconnectTime: Date.now(),
      attemptCount: connection.reconnectAttempts,
      connectionType: 'player',
    };

    const strategy = this.errorRecovery.handleConnectionFailure(
      connection.playerId,
      failureContext
    );

    switch (strategy.action) {
      case 'graceful-degrade':
        this.startGracePeriod(connectionId);
        break;
      case 'terminate':
        this.terminateConnection(connectionId);
        break;
      case 'reconnect':
        // Client-side responsibility, but we maintain state
        this.startGracePeriod(connectionId);
        break;
    }
  }

  private startGracePeriod(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Notify table about disconnection with grace period
    const disconnectNotification: ChatMessage = createWebSocketMessage(
      'chat',
      {
        playerId: 'system',
        username: 'System',
        message: `${connection.username} disconnected (30s to reconnect)`,
        isSystem: true,
      }
    ) as ChatMessage;

    this.broadcastToTableWithRecovery(connection.tableId, disconnectNotification);

    // Set grace period timeout
    const gracePeriodTimeout = setTimeout(() => {
      const gameError: GameError = {
        errorType: 'player-disconnected',
        playerId: connection.playerId,
        gameId: connection.tableId,
        context: {
          inHand: true, // Would check actual game state
          hasBet: false,
          disconnectDuration: 30000,
        },
      };

      const action = this.errorRecovery.handleGameError(gameError);
      
      if (action.action === 'auto-fold') {
        // Notify game engine to fold player
        this.broadcastSystemMessage(
          connection.tableId,
          `${connection.username} folded due to disconnection`
        );
      }

      this.terminateConnection(connectionId);
    }, 30000);

    this.gracePeriodConnections.set(connection.playerId, gracePeriodTimeout);
  }

  private cancelGracePeriod(playerId: string): void {
    const timeout = this.gracePeriodConnections.get(playerId);
    if (timeout) {
      clearTimeout(timeout);
      this.gracePeriodConnections.delete(playerId);
    }
  }

  private terminateConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Clean up health monitoring intervals
    this.cleanupHealthMonitoring(connectionId);

    // Remove from all maps
    this.connections.delete(connectionId);
    this.playerConnectionMap.delete(connection.playerId);

    // Remove from table connections
    const tableConnections = this.tableConnections.get(connection.tableId);
    if (tableConnections) {
      tableConnections.delete(connectionId);
      if (tableConnections.size === 0) {
        this.tableConnections.delete(connection.tableId);
      }
    }

    // Cancel any grace period
    this.cancelGracePeriod(connection.playerId);

    // Close WebSocket if still open
    if (connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.close(1000, 'Connection terminated');
    }

    // Notify table
    const terminateNotification: ChatMessage = createWebSocketMessage(
      'chat',
      {
        playerId: 'system',
        username: 'System',
        message: `${connection.username} left the table`,
        isSystem: true,
      }
    ) as ChatMessage;

    this.broadcastToTableWithRecovery(connection.tableId, terminateNotification);
  }

  private async sendMessageWithRecovery(
    connectionId: string,
    message: WebSocketMessage
  ): Promise<void> {
    const context: OperationContext = {
      operationName: 'websocket-send',
      resourceType: 'websocket-send',
      resourceId: connectionId,
      critical: false,
    };

    await this.errorRecovery.executeWithRecovery(
      async () => {
        const connection = this.connections.get(connectionId);
        if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
          throw new Error('Connection not available');
        }
        connection.ws.send(JSON.stringify(message));
      },
      context
    );
  }

  private async broadcastToTableWithRecovery(
    tableId: string,
    message: WebSocketMessage,
    excludeConnectionId?: string
  ): Promise<void> {
    const connectionIds = this.tableConnections.get(tableId);
    if (!connectionIds) return;

    const promises: Promise<void>[] = [];

    for (const connectionId of connectionIds) {
      if (excludeConnectionId && connectionId === excludeConnectionId) continue;
      
      // Send to each connection with individual error handling
      promises.push(
        this.sendMessageWithRecovery(connectionId, message).catch(error => {
          console.error(`Failed to send to connection ${connectionId}:`, error);
        })
      );
    }

    await Promise.allSettled(promises);
  }

  private connectionHealthIntervals = new Map<string, { ping: NodeJS.Timeout; stale: NodeJS.Timeout }>();

  private setupHealthMonitoring(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Ping interval with recovery
    const pingInterval = setInterval(async () => {
      if (!this.connections.has(connectionId)) {
        this.cleanupHealthMonitoring(connectionId);
        return;
      }

      try {
        await this.sendMessageWithRecovery(
          connectionId, 
          createWebSocketMessage('ping', {})
        );
      } catch (error) {
        // Connection likely dead, will be handled by close event
      }
    }, 30000);

    // Stale connection check
    const staleCheckInterval = setInterval(() => {
      const conn = this.connections.get(connectionId);
      if (!conn) {
        this.cleanupHealthMonitoring(connectionId);
        return;
      }

      const now = new Date();
      const timeSinceLastActivity = now.getTime() - conn.lastActivity.getTime();
      
      if (timeSinceLastActivity > 5 * 60 * 1000) {
        this.handleDisconnectionWithRecovery(connectionId);
        this.cleanupHealthMonitoring(connectionId);
      }
    }, 60000);

    // Store intervals for cleanup
    this.connectionHealthIntervals.set(connectionId, {
      ping: pingInterval,
      stale: staleCheckInterval
    });
  }

  private cleanupHealthMonitoring(connectionId: string): void {
    const intervals = this.connectionHealthIntervals.get(connectionId);
    if (intervals) {
      clearInterval(intervals.ping);
      clearInterval(intervals.stale);
      this.connectionHealthIntervals.delete(connectionId);
    }
  }

  // Public methods remain similar but with error recovery
  public async broadcastGameUpdate(tableId: string, gameState: GameState): Promise<void> {
    const gameUpdate: GameUpdateMessage = createWebSocketMessage(
      'game_update',
      gameState
    ) as GameUpdateMessage;

    await this.broadcastToTableWithRecovery(tableId, gameUpdate);
  }

  public async broadcastSystemMessage(tableId: string, message: string): Promise<void> {
    const systemMessage: ChatMessage = createWebSocketMessage(
      'chat',
      {
        playerId: 'system',
        username: 'System',
        message,
        isSystem: true,
      }
    ) as ChatMessage;

    await this.broadcastToTableWithRecovery(tableId, systemMessage);
  }

  // Additional recovery-specific methods
  public getConnectionMetrics() {
    return {
      activeConnections: this.connections.size,
      gracePeriodConnections: this.gracePeriodConnections.size,
      errorMetrics: this.errorRecovery.getMetrics(),
      circuitBreakerStatus: this.errorRecovery.getCircuitBreakerStatus(),
    };
  }

  /**
   * Cleanup all connections and intervals
   * Should be called when shutting down the WebSocket manager
   */
  public cleanup(): void {
    // Clear all grace period timeouts
    for (const timeout of this.gracePeriodConnections.values()) {
      clearTimeout(timeout);
    }
    this.gracePeriodConnections.clear();

    // Clear all health monitoring intervals
    for (const connectionId of this.connectionHealthIntervals.keys()) {
      this.cleanupHealthMonitoring(connectionId);
    }

    // Close all active connections
    for (const [connectionId, connection] of this.connections.entries()) {
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.close(1000, 'Server shutdown');
      }
    }

    // Clear all maps
    this.connections.clear();
    this.tableConnections.clear();
    this.playerConnectionMap.clear();
  }

  private sendError(connectionId: string, message: string): void {
    this.sendMessageWithRecovery(
      connectionId, 
      createWebSocketMessage('error', { message })
    ).catch(error => {
      console.error('Failed to send error message:', error);
    });
  }

  private async handleChatMessage(
    connectionId: string,
    message: ChatMessage
  ): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const sanitizedMessage = ValidationUtils.sanitizeChatMessage(message.payload.message);
    
    if (!sanitizedMessage.trim()) {
      throw new Error('Empty message');
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

    await this.broadcastToTableWithRecovery(connection.tableId, chatMessage);
  }

  private async handleJoinTable(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const tableState = {
      players: [] as Player[],
      gameState: null as GameState | null,
    };

    await this.sendMessageWithRecovery(
      connectionId, 
      createWebSocketMessage('table_state', tableState)
    );

    const joinNotification: ChatMessage = createWebSocketMessage(
      'chat',
      {
        playerId: 'system',
        username: 'System',
        message: `${connection.username} joined the table`,
        isSystem: true,
      }
    ) as ChatMessage;

    await this.broadcastToTableWithRecovery(connection.tableId, joinNotification, connectionId);
  }

  private async handleLeaveTable(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const leaveNotification: ChatMessage = createWebSocketMessage(
      'chat',
      {
        playerId: 'system',
        username: 'System',
        message: `${connection.username} left the table`,
        isSystem: true,
      }
    ) as ChatMessage;

    await this.broadcastToTableWithRecovery(connection.tableId, leaveNotification, connectionId);
    
    connection.ws.close(1000, 'Player left table');
  }
}