import { ValidationUtils, RandomUtils, } from '@primo-poker/shared';
import { AuthenticationManager } from '@primo-poker/security';
export class WebSocketManager {
    connections = new Map();
    tableConnections = new Map();
    authManager;
    constructor(jwtSecret) {
        this.authManager = new AuthenticationManager(jwtSecret);
    }
    async handleConnection(ws, request) {
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
        const connection = {
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
        this.tableConnections.get(tableId).add(connectionId);
        // Set up event handlers
        ws.addEventListener('message', (event) => {
            this.handleMessage(connectionId, event.data);
        });
        ws.addEventListener('close', () => {
            this.handleDisconnection(connectionId);
        });
        ws.addEventListener('error', (error) => {
            console.error('WebSocket error:', error);
            this.handleDisconnection(connectionId);
        });
        // Send welcome message
        this.sendMessage(connectionId, {
            type: 'connection_established',
            payload: {
                playerId: connection.playerId,
                tableId: connection.tableId,
            },
            timestamp: new Date().toISOString(),
        });
        // Set up ping/pong for connection health
        this.setupPingPong(connectionId);
    }
    async handleMessage(connectionId, messageData) {
        const connection = this.connections.get(connectionId);
        if (!connection)
            return;
        try {
            const message = JSON.parse(messageData);
            connection.lastActivity = new Date();
            switch (message.type) {
                case 'player_action':
                    await this.handlePlayerAction(connectionId, message);
                    break;
                case 'chat':
                    await this.handleChatMessage(connectionId, message);
                    break;
                case 'ping':
                    this.sendMessage(connectionId, {
                        type: 'pong',
                        payload: {},
                        timestamp: new Date().toISOString(),
                    });
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
        }
        catch (error) {
            this.sendError(connectionId, 'Invalid message format');
        }
    }
    async handlePlayerAction(connectionId, message) {
        const connection = this.connections.get(connectionId);
        if (!connection)
            return;
        // Validate that the action is from the authenticated player
        if (message.payload.playerId !== connection.playerId) {
            this.sendError(connectionId, 'Unauthorized action');
            return;
        }
        try {
            // Forward to the table's durable object
            // In a real implementation, this would interact with the table durable object
            // For now, echo back the action as a game update
            const gameUpdate = {
                type: 'game_update',
                payload: {}, // Would be actual game state
                timestamp: new Date().toISOString(),
            };
            // Broadcast to all players at the table
            this.broadcastToTable(connection.tableId, gameUpdate);
        }
        catch (error) {
            this.sendError(connectionId, 'Failed to process action');
        }
    }
    async handleChatMessage(connectionId, message) {
        const connection = this.connections.get(connectionId);
        if (!connection)
            return;
        // Validate and sanitize chat message
        const sanitizedMessage = ValidationUtils.sanitizeChatMessage(message.payload.message);
        if (!sanitizedMessage.trim()) {
            this.sendError(connectionId, 'Empty message');
            return;
        }
        const chatMessage = {
            type: 'chat',
            payload: {
                playerId: connection.playerId,
                username: connection.username,
                message: sanitizedMessage,
                isSystem: false,
            },
            timestamp: new Date().toISOString(),
        };
        // Broadcast to all players at the table
        this.broadcastToTable(connection.tableId, chatMessage);
    }
    async handleJoinTable(connectionId) {
        const connection = this.connections.get(connectionId);
        if (!connection)
            return;
        // Send current table state to the new player
        // In a real implementation, fetch from table durable object
        const tableState = {
            players: [],
            gameState: null,
        };
        this.sendMessage(connectionId, {
            type: 'table_state',
            payload: tableState,
            timestamp: new Date().toISOString(),
        });
        // Notify other players
        const joinNotification = {
            type: 'chat',
            payload: {
                playerId: 'system',
                username: 'System',
                message: `${connection.username} joined the table`,
                isSystem: true,
            },
            timestamp: new Date().toISOString(),
        };
        this.broadcastToTable(connection.tableId, joinNotification, connectionId);
    }
    async handleLeaveTable(connectionId) {
        const connection = this.connections.get(connectionId);
        if (!connection)
            return;
        // Notify other players
        const leaveNotification = {
            type: 'chat',
            payload: {
                playerId: 'system',
                username: 'System',
                message: `${connection.username} left the table`,
                isSystem: true,
            },
            timestamp: new Date().toISOString(),
        };
        this.broadcastToTable(connection.tableId, leaveNotification, connectionId);
        // Close connection
        connection.ws.close(1000, 'Player left table');
    }
    handleDisconnection(connectionId) {
        const connection = this.connections.get(connectionId);
        if (!connection)
            return;
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
        const disconnectNotification = {
            type: 'chat',
            payload: {
                playerId: 'system',
                username: 'System',
                message: `${connection.username} disconnected`,
                isSystem: true,
            },
            timestamp: new Date().toISOString(),
        };
        this.broadcastToTable(connection.tableId, disconnectNotification);
    }
    sendMessage(connectionId, message) {
        const connection = this.connections.get(connectionId);
        if (!connection || connection.ws.readyState !== WebSocket.OPEN)
            return;
        try {
            connection.ws.send(JSON.stringify(message));
        }
        catch (error) {
            console.error('Failed to send message:', error);
            this.handleDisconnection(connectionId);
        }
    }
    sendError(connectionId, message) {
        this.sendMessage(connectionId, {
            type: 'error',
            payload: { message },
            timestamp: new Date().toISOString(),
        });
    }
    broadcastToTable(tableId, message, excludeConnectionId) {
        const connectionIds = this.tableConnections.get(tableId);
        if (!connectionIds)
            return;
        for (const connectionId of connectionIds) {
            if (excludeConnectionId && connectionId === excludeConnectionId)
                continue;
            this.sendMessage(connectionId, message);
        }
    }
    setupPingPong(connectionId) {
        const connection = this.connections.get(connectionId);
        if (!connection)
            return;
        // Send ping every 30 seconds
        const pingInterval = setInterval(() => {
            if (!this.connections.has(connectionId)) {
                clearInterval(pingInterval);
                return;
            }
            this.sendMessage(connectionId, {
                type: 'ping',
                payload: {},
                timestamp: new Date().toISOString(),
            });
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
    broadcastGameUpdate(tableId, gameState) {
        const gameUpdate = {
            type: 'game_update',
            payload: gameState,
            timestamp: new Date().toISOString(),
        };
        this.broadcastToTable(tableId, gameUpdate);
    }
    broadcastSystemMessage(tableId, message) {
        const systemMessage = {
            type: 'chat',
            payload: {
                playerId: 'system',
                username: 'System',
                message,
                isSystem: true,
            },
            timestamp: new Date().toISOString(),
        };
        this.broadcastToTable(tableId, systemMessage);
    }
    // Connection management
    getTableConnections(tableId) {
        return this.tableConnections.get(tableId)?.size || 0;
    }
    getActiveConnections() {
        return this.connections.size;
    }
    closeTableConnections(tableId) {
        const connectionIds = this.tableConnections.get(tableId);
        if (!connectionIds)
            return;
        for (const connectionId of connectionIds) {
            const connection = this.connections.get(connectionId);
            if (connection) {
                connection.ws.close(1000, 'Table closed');
            }
        }
    }
    // Cleanup stale connections
    cleanup() {
        const now = new Date();
        const connectionsToRemove = [];
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
//# sourceMappingURL=websocket.js.map