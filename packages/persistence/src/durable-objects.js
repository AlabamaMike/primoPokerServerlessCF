import { RandomUtils } from '@primo-poker/shared';
// Durable Object for managing table state
export class TableDurableObject {
    state;
    table = null;
    constructor(state, env) {
        this.state = state;
    }
    async fetch(request) {
        const url = new URL(request.url);
        const method = request.method;
        try {
            switch (method) {
                case 'GET':
                    return this.handleGet(url);
                case 'POST':
                    return this.handlePost(url, request);
                case 'PUT':
                    return this.handlePut(url, request);
                case 'DELETE':
                    return this.handleDelete(url);
                default:
                    return new Response('Method not allowed', { status: 405 });
            }
        }
        catch (error) {
            console.error('TableDurableObject error:', error);
            return new Response(JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown error'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
    async handleGet(url) {
        const path = url.pathname;
        if (path === '/state') {
            await this.loadTable();
            return new Response(JSON.stringify({
                table: this.table ? {
                    id: this.table.id,
                    config: this.table.config,
                    players: Array.from(this.table.players.entries()),
                    gameState: this.table.gameState,
                    isActive: this.table.isActive,
                    lastActivity: this.table.lastActivity,
                } : null
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        if (path === '/players') {
            await this.loadTable();
            const players = this.table ? Array.from(this.table.players.values()) : [];
            return new Response(JSON.stringify({ players }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        return new Response('Not found', { status: 404 });
    }
    async handlePost(url, request) {
        const path = url.pathname;
        const body = await request.json();
        if (path === '/create') {
            return this.createTable(body.config);
        }
        if (path === '/join') {
            return this.joinTable(body.playerId);
        }
        if (path === '/action') {
            return this.processPlayerAction(body.playerId, body.action, body.amount);
        }
        if (path === '/chat') {
            return this.processChatMessage(body.playerId, body.message);
        }
        return new Response('Not found', { status: 404 });
    }
    async handlePut(url, request) {
        const path = url.pathname;
        const body = await request.json();
        if (path === '/state') {
            return this.updateGameState(body.gameState);
        }
        return new Response('Not found', { status: 404 });
    }
    async handleDelete(url) {
        const path = url.pathname;
        const playerId = url.searchParams.get('playerId');
        if (path === '/leave' && playerId) {
            return this.leaveTable(playerId);
        }
        if (path === '/table') {
            return this.deleteTable();
        }
        return new Response('Not found', { status: 404 });
    }
    async createTable(config) {
        try {
            // Create table instance
            this.table = {
                id: config.id,
                config,
                players: new Map(),
                gameState: null,
                game: null,
                createdAt: new Date(),
                lastActivity: new Date(),
                isActive: true,
            };
            // Persist to storage
            await this.state.storage.put('table', this.table);
            return new Response(JSON.stringify({
                success: true,
                tableId: this.table.id
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        catch (error) {
            return new Response(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to create table'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
    async joinTable(playerId) {
        await this.loadTable();
        if (!this.table) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Table not found'
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        try {
            // Check if table is full
            if (this.table.players.size >= this.table.config.maxPlayers) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Table is full'
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            // Add player to table (simplified)
            const player = {
                id: playerId,
                username: `Player_${playerId.slice(0, 8)}`,
                email: `${playerId}@example.com`,
                chipCount: this.table.config.minBuyIn,
                status: 'active', // PlayerStatus.ACTIVE
                timeBank: 30,
                isDealer: false,
            };
            this.table.players.set(playerId, player);
            this.table.lastActivity = new Date();
            // Persist changes
            await this.state.storage.put('table', this.table);
            return new Response(JSON.stringify({
                success: true,
                player
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        catch (error) {
            return new Response(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to join table'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
    async leaveTable(playerId) {
        await this.loadTable();
        if (!this.table) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Table not found'
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        this.table.players.delete(playerId);
        this.table.lastActivity = new Date();
        // If no players left, mark table as inactive
        if (this.table.players.size === 0) {
            this.table.isActive = false;
        }
        await this.state.storage.put('table', this.table);
        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
    async processPlayerAction(playerId, action, amount) {
        await this.loadTable();
        if (!this.table || !this.table.game) {
            return new Response(JSON.stringify({
                success: false,
                error: 'No active game'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        try {
            // Process the action through the game engine
            const result = await this.table.game.processBet(playerId, amount || 0);
            if (result.success && result.newGameState) {
                this.table.gameState = result.newGameState;
                this.table.lastActivity = new Date();
                await this.state.storage.put('table', this.table);
            }
            return new Response(JSON.stringify(result), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        catch (error) {
            return new Response(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Action failed'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
    async processChatMessage(playerId, message) {
        await this.loadTable();
        if (!this.table) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Table not found'
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        const player = this.table.players.get(playerId);
        if (!player) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Player not found'
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        // Store chat message
        const chatMessage = {
            id: RandomUtils.generateUUID(),
            playerId,
            username: player.username,
            message: message.slice(0, 200), // Limit message length
            timestamp: new Date(),
            isSystem: false,
        };
        // In a real implementation, broadcast to all players via WebSocket
        return new Response(JSON.stringify({
            success: true,
            message: chatMessage
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
    async updateGameState(gameState) {
        await this.loadTable();
        if (!this.table) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Table not found'
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        this.table.gameState = gameState;
        this.table.lastActivity = new Date();
        await this.state.storage.put('table', this.table);
        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
    async deleteTable() {
        await this.state.storage.deleteAll();
        this.table = null;
        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
    async loadTable() {
        if (!this.table) {
            const stored = await this.state.storage.get('table');
            if (stored) {
                this.table = stored;
                // Recreate Map from stored data
                if (Array.isArray(this.table.players)) {
                    this.table.players = new Map(this.table.players);
                }
            }
        }
    }
    // WebSocket handling for real-time updates
    async webSocketMessage(ws, message) {
        try {
            const data = JSON.parse(message);
            switch (data.type) {
                case 'join_table':
                    await this.handleWebSocketJoin(ws, data.playerId);
                    break;
                case 'player_action':
                    await this.handleWebSocketAction(ws, data.playerId, data.action, data.amount);
                    break;
                case 'chat':
                    await this.handleWebSocketChat(ws, data.playerId, data.message);
                    break;
                default:
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Unknown message type'
                    }));
            }
        }
        catch (error) {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid message format'
            }));
        }
    }
    async handleWebSocketJoin(ws, playerId) {
        await this.loadTable();
        if (this.table) {
            ws.send(JSON.stringify({
                type: 'table_state',
                payload: {
                    gameState: this.table.gameState,
                    players: Array.from(this.table.players.values()),
                }
            }));
        }
    }
    async handleWebSocketAction(ws, playerId, action, amount) {
        const response = await this.processPlayerAction(playerId, action, amount);
        const result = await response.json();
        ws.send(JSON.stringify({
            type: 'action_result',
            payload: result
        }));
        // Broadcast game state update to all connected players
        if (result.success && this.table?.gameState) {
            // In a real implementation, maintain a list of connected WebSockets
            // and broadcast to all of them
        }
    }
    async handleWebSocketChat(ws, playerId, message) {
        const response = await this.processChatMessage(playerId, message);
        const result = await response.json();
        if (result.success) {
            // Broadcast chat message to all connected players
            // In a real implementation, maintain WebSocket connections
        }
    }
}
export { TableDurableObject as default };
//# sourceMappingURL=durable-objects.js.map