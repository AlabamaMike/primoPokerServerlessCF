import { Router } from 'itty-router';
import { TableConfigSchema, ValidationUtils, RandomUtils } from '@primo-poker/shared';
import { TableManager } from '@primo-poker/core';
import { AuthenticationManager } from '@primo-poker/security';
import { D1PlayerRepository, D1GameRepository } from '@primo-poker/persistence';
export class PokerAPIRoutes {
    router; // Using any to avoid itty-router type issues
    tableManager;
    authManager;
    constructor() {
        this.router = Router();
        this.tableManager = new TableManager();
        this.authManager = new AuthenticationManager(''); // Will be set from env
        this.setupRoutes();
    }
    setupRoutes() {
        // Authentication routes
        this.router.post('/api/auth/login', this.handleLogin.bind(this));
        this.router.post('/api/auth/refresh', this.handleRefreshToken.bind(this));
        this.router.post('/api/auth/logout', this.authenticateRequest.bind(this), this.handleLogout.bind(this));
        // Player routes
        this.router.get('/api/players/me', this.authenticateRequest.bind(this), this.handleGetProfile.bind(this));
        this.router.put('/api/players/me', this.authenticateRequest.bind(this), this.handleUpdateProfile.bind(this));
        // Table routes
        this.router.get('/api/tables', this.handleGetTables.bind(this));
        this.router.post('/api/tables', this.authenticateRequest.bind(this), this.handleCreateTable.bind(this));
        this.router.get('/api/tables/:tableId', this.handleGetTable.bind(this));
        this.router.post('/api/tables/:tableId/join', this.authenticateRequest.bind(this), this.handleJoinTable.bind(this));
        this.router.post('/api/tables/:tableId/leave', this.authenticateRequest.bind(this), this.handleLeaveTable.bind(this));
        this.router.post('/api/tables/:tableId/action', this.authenticateRequest.bind(this), this.handlePlayerAction.bind(this));
        // Game routes
        this.router.get('/api/games/:gameId', this.authenticateRequest.bind(this), this.handleGetGame.bind(this));
        this.router.get('/api/games/:gameId/history', this.authenticateRequest.bind(this), this.handleGetGameHistory.bind(this));
        // Tournament routes
        this.router.get('/api/tournaments', this.handleGetTournaments.bind(this));
        this.router.post('/api/tournaments', this.authenticateRequest.bind(this), this.handleCreateTournament.bind(this));
        this.router.post('/api/tournaments/:tournamentId/register', this.authenticateRequest.bind(this), this.handleRegisterTournament.bind(this));
        // Health check
        this.router.get('/api/health', this.handleHealthCheck.bind(this));
        // Catch all
        this.router.all('*', this.handleNotFound.bind(this));
    }
    getRouter() {
        return this.router;
    }
    // Authentication middleware
    async authenticateRequest(request) {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return this.errorResponse('Missing or invalid authorization header', 401);
        }
        const token = authHeader.slice(7);
        // Initialize auth manager with secret from env
        if (request.env?.JWT_SECRET) {
            this.authManager = new AuthenticationManager(request.env.JWT_SECRET);
        }
        const result = await this.authManager.verifyAccessToken(token);
        if (!result.valid) {
            return this.errorResponse(result.error || 'Invalid token', 401);
        }
        if (result.payload) {
            request.user = result.payload;
        }
    }
    // Authentication handlers
    async handleLogin(request) {
        try {
            const body = await request.json();
            if (!body.username || !body.password) {
                return this.errorResponse('Username and password required', 400);
            }
            // Initialize auth manager
            if (request.env?.JWT_SECRET) {
                this.authManager = new AuthenticationManager(request.env.JWT_SECRET);
            }
            const result = await this.authManager.authenticate({
                username: body.username,
                password: body.password,
            });
            if (!result.success) {
                return this.errorResponse(result.error || 'Authentication failed', 401);
            }
            return this.successResponse(result.tokens);
        }
        catch (error) {
            return this.errorResponse('Invalid request body', 400);
        }
    }
    async handleRefreshToken(request) {
        try {
            const body = await request.json();
            if (!body.refreshToken) {
                return this.errorResponse('Refresh token required', 400);
            }
            if (request.env?.JWT_SECRET) {
                this.authManager = new AuthenticationManager(request.env.JWT_SECRET);
            }
            const result = await this.authManager.refreshTokens(body.refreshToken);
            if (!result.success) {
                return this.errorResponse(result.error || 'Token refresh failed', 401);
            }
            return this.successResponse(result.tokens);
        }
        catch (error) {
            return this.errorResponse('Invalid request body', 400);
        }
    }
    async handleLogout(request) {
        if (!request.user) {
            return this.errorResponse('Not authenticated', 401);
        }
        await this.authManager.revokeSession(request.user.userId, request.user.sessionId);
        return this.successResponse({ message: 'Logged out successfully' });
    }
    // Player handlers
    async handleGetProfile(request) {
        if (!request.user || !request.env) {
            return this.errorResponse('Not authenticated', 401);
        }
        try {
            const playerRepo = new D1PlayerRepository(request.env.DB);
            const player = await playerRepo.findById(request.user.userId);
            if (!player) {
                return this.errorResponse('Player not found', 404);
            }
            return this.successResponse(player);
        }
        catch (error) {
            return this.errorResponse('Failed to fetch profile', 500);
        }
    }
    async handleUpdateProfile(request) {
        if (!request.user || !request.env) {
            return this.errorResponse('Not authenticated', 401);
        }
        try {
            const body = await request.json();
            const playerRepo = new D1PlayerRepository(request.env.DB);
            const updates = {};
            if (body.username) {
                updates.username = ValidationUtils.sanitizeUsername(body.username);
            }
            if (body.email) {
                updates.email = body.email;
            }
            const updatedPlayer = await playerRepo.update(request.user.userId, updates);
            return this.successResponse(updatedPlayer);
        }
        catch (error) {
            return this.errorResponse('Failed to update profile', 500);
        }
    }
    // Table handlers
    async handleGetTables(request) {
        try {
            const activeTables = await this.tableManager.getActiveTables();
            // Convert Map to serializable format
            const tables = activeTables.map(table => ({
                id: table.id,
                config: table.config,
                playerCount: table.players.size,
                isActive: table.isActive,
                lastActivity: table.lastActivity,
            }));
            return this.successResponse(tables);
        }
        catch (error) {
            return this.errorResponse('Failed to fetch tables', 500);
        }
    }
    async handleCreateTable(request) {
        if (!request.user) {
            return this.errorResponse('Not authenticated', 401);
        }
        try {
            const body = await request.json();
            // Validate table configuration
            const config = {
                ...body,
                id: RandomUtils.generateUUID(),
            };
            const configResult = TableConfigSchema.safeParse(config);
            if (!configResult.success) {
                return this.errorResponse('Invalid table configuration', 400);
            }
            const table = await this.tableManager.createTable(configResult.data);
            return this.successResponse({
                id: table.id,
                config: table.config,
                playerCount: table.players.size,
                isActive: table.isActive,
                lastActivity: table.lastActivity,
            });
        }
        catch (error) {
            return this.errorResponse('Failed to create table', 500);
        }
    }
    async handleGetTable(request) {
        const tableId = request.params?.tableId;
        if (!tableId) {
            return this.errorResponse('Table ID required', 400);
        }
        try {
            const table = await this.tableManager.getTable(tableId);
            if (!table) {
                return this.errorResponse('Table not found', 404);
            }
            return this.successResponse({
                id: table.id,
                config: table.config,
                players: Array.from(table.players.values()),
                gameState: table.gameState,
                isActive: table.isActive,
            });
        }
        catch (error) {
            return this.errorResponse('Failed to fetch table', 500);
        }
    }
    async handleJoinTable(request) {
        const tableId = request.params?.tableId;
        if (!tableId || !request.user) {
            return this.errorResponse('Table ID and authentication required', 400);
        }
        try {
            const result = await this.tableManager.joinTable(tableId, request.user.userId);
            return this.successResponse(result);
        }
        catch (error) {
            return this.errorResponse('Failed to join table', 500);
        }
    }
    async handleLeaveTable(request) {
        const tableId = request.params?.tableId;
        if (!tableId || !request.user) {
            return this.errorResponse('Table ID and authentication required', 400);
        }
        try {
            await this.tableManager.leaveTable(tableId, request.user.userId);
            return this.successResponse({ message: 'Left table successfully' });
        }
        catch (error) {
            return this.errorResponse('Failed to leave table', 500);
        }
    }
    async handlePlayerAction(request) {
        const tableId = request.params?.tableId;
        if (!tableId || !request.user) {
            return this.errorResponse('Table ID and authentication required', 400);
        }
        try {
            const body = await request.json();
            // Get the table's durable object
            if (!request.env?.TABLE_OBJECTS) {
                return this.errorResponse('Service unavailable', 503);
            }
            const tableObjectId = request.env.TABLE_OBJECTS.idFromName(tableId);
            const tableObject = request.env.TABLE_OBJECTS.get(tableObjectId);
            const actionRequest = new Request(`https://table-object/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playerId: request.user.userId,
                    action: body.action,
                    amount: body.amount,
                }),
            });
            const response = await tableObject.fetch(actionRequest);
            const result = await response.json();
            return new Response(JSON.stringify(result), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        catch (error) {
            return this.errorResponse('Failed to process action', 500);
        }
    }
    // Game handlers
    async handleGetGame(request) {
        const gameId = request.params?.gameId;
        if (!gameId || !request.user || !request.env) {
            return this.errorResponse('Game ID and authentication required', 400);
        }
        try {
            const gameRepo = new D1GameRepository(request.env.DB);
            const game = await gameRepo.findById(gameId);
            if (!game) {
                return this.errorResponse('Game not found', 404);
            }
            return this.successResponse(game);
        }
        catch (error) {
            return this.errorResponse('Failed to fetch game', 500);
        }
    }
    async handleGetGameHistory(request) {
        const gameId = request.params?.gameId;
        if (!gameId || !request.user) {
            return this.errorResponse('Game ID and authentication required', 400);
        }
        // Implementation would fetch hand history from R2
        return this.successResponse({ gameId, history: [] });
    }
    // Tournament handlers
    async handleGetTournaments(request) {
        // Implementation would fetch tournaments from database
        return this.successResponse([]);
    }
    async handleCreateTournament(request) {
        if (!request.user) {
            return this.errorResponse('Not authenticated', 401);
        }
        // Implementation would create tournament
        return this.successResponse({ message: 'Tournament creation not implemented' });
    }
    async handleRegisterTournament(request) {
        const tournamentId = request.params?.tournamentId;
        if (!tournamentId || !request.user) {
            return this.errorResponse('Tournament ID and authentication required', 400);
        }
        // Implementation would register player for tournament
        return this.successResponse({ message: 'Tournament registration not implemented' });
    }
    // Health check
    async handleHealthCheck(request) {
        return this.successResponse({
            status: 'healthy',
            timestamp: new Date().toISOString()
        });
    }
    // 404 handler
    async handleNotFound(request) {
        return this.errorResponse('Endpoint not found', 404);
    }
    // Utility methods
    successResponse(data) {
        const response = {
            success: true,
            data,
            timestamp: new Date().toISOString(),
        };
        return new Response(JSON.stringify(response), {
            headers: { 'Content-Type': 'application/json' },
        });
    }
    errorResponse(message, status = 500) {
        const response = {
            success: false,
            error: {
                code: status.toString(),
                message,
            },
            timestamp: new Date().toISOString(),
        };
        return new Response(JSON.stringify(response), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
//# sourceMappingURL=routes.js.map