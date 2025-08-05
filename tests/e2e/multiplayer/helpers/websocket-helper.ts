/**
 * WebSocket helper for managing poker game connections
 */

import { TestConfig } from '../config';
import { TestLogger } from './logger';

export interface WebSocketMessage {
  type: string;
  payload?: any;
  error?: string;
  timestamp?: number;
}

export interface PlayerWebSocket {
  playerId: string;
  username: string;
  ws: WebSocket;
  isConnected: boolean;
  messageQueue: WebSocketMessage[];
  messageHandlers: Map<string, (message: WebSocketMessage) => void>;
  authToken: string;
}

export class WebSocketHelper {
  private config: TestConfig;
  private logger: TestLogger;
  private connections: Map<string, PlayerWebSocket> = new Map();

  constructor(config: TestConfig, logger: TestLogger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Create WebSocket connection for a player
   */
  async connect(playerId: string, username: string, authToken: string, tableId: string): Promise<PlayerWebSocket> {
    this.logger.log(`🔌 Connecting ${username} to table ${tableId}...`);

    return new Promise((resolve, reject) => {
      const wsUrl = `${this.config.wsUrl}/ws?token=${authToken}&tableId=${tableId}`;
      const ws = new WebSocket(wsUrl);
      
      const playerWs: PlayerWebSocket = {
        playerId,
        username,
        ws,
        isConnected: false,
        messageQueue: [],
        messageHandlers: new Map(),
        authToken,
      };

      // Set connection timeout
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error(`WebSocket connection timeout for ${username}`));
      }, this.config.timing.connectionTimeout);

      ws.onopen = () => {
        clearTimeout(timeout);
        playerWs.isConnected = true;
        this.connections.set(playerId, playerWs);
        this.logger.log(`✅ ${username} connected`);
        resolve(playerWs);
      };

      ws.onmessage = (event) => {
        try {
          let message: WebSocketMessage;
          
          // Handle different message formats
          if (typeof event.data === 'string') {
            const parsed = JSON.parse(event.data);
            
            // Check if it's already in the expected format
            if (parsed.type) {
              message = {
                type: parsed.type,
                payload: parsed.payload || parsed.data, // Handle both payload and data fields
                error: parsed.error,
                timestamp: parsed.timestamp || Date.now()
              };
            } else {
              // Message might be the payload itself
              message = {
                type: parsed.action || parsed.event || 'unknown',
                payload: parsed,
                timestamp: Date.now()
              };
            }
          } else {
            this.logger.error(`Unexpected WebSocket data type for ${username}: ${typeof event.data}`);
            return;
          }
          
          message.timestamp = message.timestamp || Date.now();
          
          this.logger.wsMessage('receive', playerId, message);
          playerWs.messageQueue.push(message);

          // Call registered handlers
          const handler = playerWs.messageHandlers.get(message.type);
          if (handler) {
            handler(message);
          }

          // Call global handlers
          const globalHandler = playerWs.messageHandlers.get('*');
          if (globalHandler) {
            globalHandler(message);
          }
        } catch (error) {
          this.logger.error(`Failed to parse WebSocket message for ${username}:`, error as Error);
          this.logger.debug(`Raw message data: ${event.data}`);
        }
      };

      ws.onerror = (error) => {
        clearTimeout(timeout);
        this.logger.error(`WebSocket error for ${username}:`, new Error(error.toString()));
        reject(error);
      };

      ws.onclose = (event) => {
        playerWs.isConnected = false;
        this.connections.delete(playerId);
        this.logger.log(`🔌 ${username} disconnected (code: ${event.code})`);
      };
    });
  }

  /**
   * Send message through WebSocket
   */
  async sendMessage(playerId: string, message: WebSocketMessage): Promise<void> {
    const connection = this.connections.get(playerId);
    if (!connection || !connection.isConnected) {
      throw new Error(`Player ${playerId} is not connected`);
    }

    this.logger.wsMessage('send', playerId, message);
    connection.ws.send(JSON.stringify(message));
  }

  /**
   * Wait for a specific message type
   */
  async waitForMessage(
    playerId: string, 
    messageType: string, 
    timeout: number = 5000
  ): Promise<WebSocketMessage> {
    const connection = this.connections.get(playerId);
    if (!connection) {
      throw new Error(`Player ${playerId} is not connected`);
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        connection.messageHandlers.delete(messageType);
        reject(new Error(`Timeout waiting for message type: ${messageType}`));
      }, timeout);

      // Check existing messages
      const existingMessage = connection.messageQueue.find(m => m.type === messageType);
      if (existingMessage) {
        clearTimeout(timeoutId);
        resolve(existingMessage);
        return;
      }

      // Register handler for future messages
      connection.messageHandlers.set(messageType, (message) => {
        if (message.type === messageType) {
          clearTimeout(timeoutId);
          connection.messageHandlers.delete(messageType);
          resolve(message);
        }
      });
    });
  }

  /**
   * Wait for game state update
   */
  async waitForGameState(playerId: string, timeout: number = 5000): Promise<any> {
    // Try multiple message types that might contain game state
    const messageTypes = ['game_update', 'table_update', 'game_state', 'state_update'];
    
    for (const messageType of messageTypes) {
      try {
        const message = await this.waitForMessage(playerId, messageType, Math.floor(timeout / messageTypes.length));
        if (message.payload) {
          return message.payload;
        }
      } catch {
        // Try next message type
      }
    }
    
    // If no specific message type worked, check the message queue for any game state
    const connection = this.connections.get(playerId);
    if (connection) {
      const stateMessage = connection.messageQueue
        .reverse()
        .find(msg => msg.payload && (msg.payload.phase || msg.payload.gamePhase));
      
      if (stateMessage) {
        return stateMessage.payload;
      }
    }
    
    throw new Error(`No game state found for player ${playerId}`);
  }

  /**
   * Register a message handler
   */
  onMessage(playerId: string, messageType: string, handler: (message: WebSocketMessage) => void) {
    const connection = this.connections.get(playerId);
    if (!connection) {
      throw new Error(`Player ${playerId} is not connected`);
    }

    connection.messageHandlers.set(messageType, handler);
  }

  /**
   * Send player action
   */
  async sendAction(playerId: string, action: string, amount?: number): Promise<void> {
    await this.sendMessage(playerId, {
      type: 'player_action',
      payload: {
        action,
        amount,
      },
    });
  }

  /**
   * Disconnect a player
   */
  disconnect(playerId: string) {
    const connection = this.connections.get(playerId);
    if (connection && connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.close();
    }
    this.connections.delete(playerId);
  }

  /**
   * Disconnect all players
   */
  disconnectAll() {
    this.connections.forEach((connection, playerId) => {
      this.disconnect(playerId);
    });
  }

  /**
   * Get all messages for a player
   */
  getMessages(playerId: string): WebSocketMessage[] {
    const connection = this.connections.get(playerId);
    return connection?.messageQueue || [];
  }

  /**
   * Clear message queue for a player
   */
  clearMessages(playerId: string) {
    const connection = this.connections.get(playerId);
    if (connection) {
      connection.messageQueue = [];
    }
  }

  /**
   * Check if player is connected
   */
  isConnected(playerId: string): boolean {
    const connection = this.connections.get(playerId);
    return connection?.isConnected || false;
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Send heartbeat for all connections
   */
  async sendHeartbeats() {
    const promises = Array.from(this.connections.keys()).map(playerId => 
      this.sendMessage(playerId, { type: 'heartbeat' }).catch(() => {
        // Ignore heartbeat failures
      })
    );
    
    await Promise.all(promises);
  }
}