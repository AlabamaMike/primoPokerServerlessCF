import {
  WebSocketMessage,
  createWebSocketMessage,
} from '@primo-poker/shared';
import { BatchingWebSocketManager } from './websocket-batched';
import { AuthenticationManager } from '@primo-poker/security';

export interface PoolConfig {
  maxConnectionsPerTable: number;
  maxTotalConnections: number;
  connectionTimeout: number; // ms
  idleTimeout: number; // ms
  maxReconnectAttempts: number;
  reconnectBackoff: number; // ms
}

interface PooledConnection {
  ws: WebSocket;
  connectionId: string;
  playerId: string;
  tableId: string;
  createdAt: Date;
  lastActivity: Date;
  errorCount: number;
  messagesSent: number;
  messagesReceived: number;
  load: 'low' | 'medium' | 'high';
}

interface ConnectionHealth {
  healthy: boolean;
  errorCount: number;
  latency: number;
  lastCheck: Date;
}

interface TableMetrics {
  connectionCount: number;
  messagesSent: number;
  messagesReceived: number;
  avgLatency: number;
  errors: number;
}

export class ConnectionPoolManager extends BatchingWebSocketManager {
  private pool = new Map<string, PooledConnection>();
  private poolTableConnections = new Map<string, Set<string>>(); // tableId -> connectionIds
  private playerConnections = new Map<string, string>(); // playerId -> connectionId
  private connectionHealth = new Map<string, ConnectionHealth>();
  private poolConfig: PoolConfig;
  private cleanupInterval?: number | ReturnType<typeof setTimeout>;
  private pendingOperations = new Set<Promise<void>>();
  private jwtSecret: string;
  
  private poolStats = {
    totalConnectionsCreated: 0,
    connectionReuses: 0,
    idleConnectionsRemoved: 0,
    failedConnections: 0,
  };

  constructor(jwtSecret: string, config: PoolConfig) {
    super(jwtSecret);
    this.jwtSecret = jwtSecret;
    this.poolConfig = config;
    this.startCleanupTimer();
  }

  async addConnection(ws: WebSocket, request: Request): Promise<void> {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    const tableId = url.searchParams.get('tableId');

    if (!token || !tableId) {
      ws.close(1008, 'Missing required parameters');
      throw new Error('Missing token or tableId');
    }

    // Verify authentication
    const authManager = new AuthenticationManager(this.jwtSecret);
    const authResult = await authManager.verifyAccessToken(token);
    if (!authResult.valid || !authResult.payload) {
      ws.close(1008, 'Invalid authentication');
      throw new Error('Invalid authentication token');
    }

    const playerId = authResult.payload.userId;

    // Check pool limits
    await this.enforcePoolLimits(tableId);

    // Check for existing connection
    const existingConnectionId = this.playerConnections.get(playerId);
    if (existingConnectionId) {
      this.handleConnectionReuse(existingConnectionId, ws, playerId, tableId);
      return;
    }

    // Create new pooled connection
    const connectionId = this.generateConnectionId();
    const pooledConnection: PooledConnection = {
      ws,
      connectionId,
      playerId,
      tableId,
      createdAt: new Date(),
      lastActivity: new Date(),
      errorCount: 0,
      messagesSent: 0,
      messagesReceived: 0,
      load: 'low',
    };

    // Add to pool
    this.pool.set(connectionId, pooledConnection);
    this.playerConnections.set(playerId, connectionId);
    
    // Add to table connections
    if (!this.poolTableConnections.has(tableId)) {
      this.poolTableConnections.set(tableId, new Set());
    }
    this.poolTableConnections.get(tableId)!.add(connectionId);

    // Initialize connection health
    this.connectionHealth.set(connectionId, {
      healthy: true,
      errorCount: 0,
      latency: 0,
      lastCheck: new Date(),
    });

    // Update stats
    this.poolStats.totalConnectionsCreated++;

    // Set up handlers
    this.setupConnectionHandlers(connectionId, ws);

    // Handle connection with parent class
    await super.handleConnection(ws, request);
  }

  private async enforcePoolLimits(tableId: string): Promise<void> {
    // Check table limit
    const tableConnectionCount = this.poolTableConnections.get(tableId)?.size ?? 0;
    if (tableConnectionCount >= this.poolConfig.maxConnectionsPerTable) {
      throw new Error('Table connection limit reached');
    }

    // Check total limit
    if (this.pool.size >= this.poolConfig.maxTotalConnections) {
      throw new Error('Total connection limit reached');
    }
  }

  private handleConnectionReuse(
    existingConnectionId: string,
    newWs: WebSocket,
    playerId: string,
    newTableId: string
  ): void {
    const existingConnection = this.pool.get(existingConnectionId);
    if (!existingConnection) return;

    // Close old connection
    existingConnection.ws.close(1000, 'Connection replaced');

    // Update table connections
    const oldTableConnections = this.poolTableConnections.get(existingConnection.tableId);
    if (oldTableConnections) {
      oldTableConnections.delete(existingConnectionId);
      if (oldTableConnections.size === 0) {
        this.poolTableConnections.delete(existingConnection.tableId);
      }
    }

    // Update with new connection
    existingConnection.ws = newWs;
    existingConnection.tableId = newTableId;
    existingConnection.lastActivity = new Date();
    existingConnection.errorCount = 0;

    // Add to new table
    if (!this.poolTableConnections.has(newTableId)) {
      this.poolTableConnections.set(newTableId, new Set());
    }
    this.poolTableConnections.get(newTableId)!.add(existingConnectionId);

    // Update stats
    this.poolStats.connectionReuses++;

    // Set up new handlers
    this.setupConnectionHandlers(existingConnectionId, newWs);
  }

  private setupConnectionHandlers(connectionId: string, ws: WebSocket): void {
    ws.addEventListener('message', () => {
      const connection = this.pool.get(connectionId);
      if (connection) {
        connection.lastActivity = new Date();
        connection.messagesReceived++;
        this.updateConnectionLoad(connectionId);
      }
    });

    ws.addEventListener('error', (error) => {
      this.handleConnectionError(connectionId, error);
    });

    ws.addEventListener('close', () => {
      this.removeConnection(connectionId);
    });
  }

  private handleConnectionError(connectionId: string, error: Event): void {
    const connection = this.pool.get(connectionId);
    const health = this.connectionHealth.get(connectionId);
    
    if (connection) {
      connection.errorCount++;
    }
    
    if (health) {
      health.errorCount++;
      health.healthy = health.errorCount < 5;
    }

    this.poolStats.failedConnections++;
  }

  private removeConnection(connectionId: string): void {
    const connection = this.pool.get(connectionId);
    if (!connection) return;

    // Remove from pool
    this.pool.delete(connectionId);
    this.playerConnections.delete(connection.playerId);
    this.connectionHealth.delete(connectionId);

    // Remove from table connections
    const tableConnections = this.poolTableConnections.get(connection.tableId);
    if (tableConnections) {
      tableConnections.delete(connectionId);
      if (tableConnections.size === 0) {
        this.poolTableConnections.delete(connection.tableId);
      }
    }
  }

  private updateConnectionLoad(connectionId: string): void {
    const connection = this.pool.get(connectionId);
    if (!connection) return;

    const recentMessages = connection.messagesReceived + connection.messagesSent;
    
    if (recentMessages < 10) {
      connection.load = 'low';
    } else if (recentMessages < 50) {
      connection.load = 'medium';
    } else {
      connection.load = 'high';
    }
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleConnections();
    }, 10000); // Check every 10 seconds
  }

  private cleanupIdleConnections(): void {
    const now = Date.now();
    const connectionsToRemove: string[] = [];

    for (const [connectionId, connection] of this.pool) {
      const idleTime = now - connection.lastActivity.getTime();
      
      if (idleTime > this.poolConfig.idleTimeout) {
        connectionsToRemove.push(connectionId);
      }
    }

    for (const connectionId of connectionsToRemove) {
      const connection = this.pool.get(connectionId);
      if (connection) {
        connection.ws.close(1000, 'Idle timeout');
        this.removeConnection(connectionId);
        this.poolStats.idleConnectionsRemoved++;
      }
    }
  }

  // Public API
  public broadcastToTable(tableId: string, message: WebSocketMessage): void {
    const connectionIds = this.poolTableConnections.get(tableId);
    if (!connectionIds) return;

    const promises: Promise<void>[] = [];

    for (const connectionId of connectionIds) {
      const connection = this.pool.get(connectionId);
      if (connection && connection.ws.readyState === 1) { // 1 = OPEN
        const promise = this.sendToConnectionAsync(connection, message);
        promises.push(promise);
      }
    }

    // Track pending operations
    const batchPromise = Promise.allSettled(promises).then(() => {
      this.pendingOperations.delete(batchPromise);
    });
    this.pendingOperations.add(batchPromise);
  }

  private async sendToConnectionAsync(
    connection: PooledConnection,
    message: WebSocketMessage
  ): Promise<void> {
    try {
      super.sendWebSocketMessage(connection.ws, message);
      connection.messagesSent++;
      connection.lastActivity = new Date();
    } catch (error) {
      console.error(`Failed to send to connection ${connection.connectionId}:`, error);
      this.handleConnectionError(connection.connectionId, new Event('send-error'));
    }
  }

  public sendToConnectionWs(ws: WebSocket, message: WebSocketMessage): void {
    super.sendWebSocketMessage(ws, message);
  }

  public getOptimalConnection(tableId: string): WebSocket | undefined {
    const connectionIds = this.poolTableConnections.get(tableId);
    if (!connectionIds || connectionIds.size === 0) return undefined;

    let optimalConnection: PooledConnection | undefined;
    let lowestLoad = Infinity;

    for (const connectionId of connectionIds) {
      const connection = this.pool.get(connectionId);
      const health = this.connectionHealth.get(connectionId);
      
      if (connection && health?.healthy && connection.ws.readyState === 1) { // 1 = OPEN
        const loadScore = this.calculateLoadScore(connection);
        if (loadScore < lowestLoad) {
          lowestLoad = loadScore;
          optimalConnection = connection;
        }
      }
    }

    return optimalConnection?.ws;
  }

  private calculateLoadScore(connection: PooledConnection): number {
    const loadScores = { low: 0, medium: 50, high: 100 };
    let score = loadScores[connection.load];
    
    // Add error penalty
    score += connection.errorCount * 10;
    
    // Add message count factor
    score += (connection.messagesSent + connection.messagesReceived) * 0.1;
    
    return score;
  }

  public markConnectionLoad(ws: WebSocket, load: 'low' | 'medium' | 'high'): void {
    for (const connection of this.pool.values()) {
      if (connection.ws === ws) {
        connection.load = load;
        break;
      }
    }
  }

  protected sendToConnection(connectionId: string, message: WebSocketMessage): void {
    const connection = this.pool.get(connectionId);
    if (connection) {
      super.sendWebSocketMessage(connection.ws, message);
    }
  }

  public getConnectionHealth(ws: WebSocket): ConnectionHealth | undefined {
    for (const [connectionId, connection] of this.pool) {
      if (connection.ws === ws) {
        return this.connectionHealth.get(connectionId);
      }
    }
    return undefined;
  }

  public getPoolStats(): {
    totalConnections: number;
    connectionsByTable: Record<string, number>;
    connectionReuses: number;
    idleConnectionsRemoved: number;
  } {
    const connectionsByTable: Record<string, number> = {};
    
    for (const [tableId, connections] of this.poolTableConnections) {
      connectionsByTable[tableId] = connections.size;
    }

    return {
      totalConnections: this.pool.size,
      connectionsByTable,
      connectionReuses: this.poolStats.connectionReuses,
      idleConnectionsRemoved: this.poolStats.idleConnectionsRemoved,
    };
  }

  public getDetailedMetrics(): {
    poolUtilization: number;
    averageConnectionsPerTable: number;
    connectionTurnover: number;
    healthMetrics: {
      healthyConnections: number;
      unhealthyConnections: number;
      averageErrorRate: number;
    };
  } {
    const tables = this.poolTableConnections.size;
    const connections = this.pool.size;
    
    let healthyCount = 0;
    let totalErrors = 0;
    
    for (const health of this.connectionHealth.values()) {
      if (health.healthy) healthyCount++;
      totalErrors += health.errorCount;
    }

    return {
      poolUtilization: connections / this.poolConfig.maxTotalConnections,
      averageConnectionsPerTable: tables > 0 ? connections / tables : 0,
      connectionTurnover: this.poolStats.totalConnectionsCreated / Math.max(1, connections),
      healthMetrics: {
        healthyConnections: healthyCount,
        unhealthyConnections: connections - healthyCount,
        averageErrorRate: connections > 0 ? totalErrors / connections : 0,
      },
    };
  }

  public getTableMetrics(tableId: string): TableMetrics {
    const connectionIds = this.poolTableConnections.get(tableId) || new Set();
    let messagesSent = 0;
    let messagesReceived = 0;
    let errors = 0;
    let totalLatency = 0;
    let latencyCount = 0;

    for (const connectionId of connectionIds) {
      const connection = this.pool.get(connectionId);
      const health = this.connectionHealth.get(connectionId);
      
      if (connection) {
        messagesSent += connection.messagesSent;
        messagesReceived += connection.messagesReceived;
        errors += connection.errorCount;
      }
      
      if (health && health.latency > 0) {
        totalLatency += health.latency;
        latencyCount++;
      }
    }

    return {
      connectionCount: connectionIds.size,
      messagesSent,
      messagesReceived,
      avgLatency: latencyCount > 0 ? totalLatency / latencyCount : 0,
      errors,
    };
  }

  public registerPendingOperation(operation: Promise<void>): void {
    this.pendingOperations.add(operation);
    operation.finally(() => {
      this.pendingOperations.delete(operation);
    });
  }

  public async shutdown(): Promise<void> {
    // Stop cleanup timer
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Wait for pending operations
    if (this.pendingOperations.size > 0) {
      await Promise.allSettled(Array.from(this.pendingOperations));
    }

    // Close all connections
    for (const connection of this.pool.values()) {
      if (connection.ws.readyState === 1) { // 1 = OPEN
        connection.ws.close(1000, 'Server shutdown');
      }
    }

    // Clear all maps
    this.pool.clear();
    this.poolTableConnections.clear();
    this.playerConnections.clear();
    this.connectionHealth.clear();
  }

  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}