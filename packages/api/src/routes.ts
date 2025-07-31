import { IRequest, Router } from 'itty-router';
import { 
  ApiResponse, 
  TableConfigSchema,
  ValidationUtils,
  RandomUtils,
  PlayerStatus
} from '@primo-poker/shared';
import { TableManager } from '@primo-poker/core';
import { AuthenticationManager, TokenPayload, PasswordManager } from '@primo-poker/security';
import { D1PlayerRepository, D1GameRepository } from '@primo-poker/persistence';

// Extended request interface with authentication
interface AuthenticatedRequest extends IRequest {
  user?: TokenPayload;
  env?: WorkerEnv;
}

interface WorkerEnv {
  DB: D1Database;
  SESSION_STORE: KVNamespace;
  TABLE_OBJECTS: DurableObjectNamespace;
  JWT_SECRET: string;
}

export class PokerAPIRoutes {
  private router: any; // Using any to avoid itty-router type issues
  private tableManager: TableManager;
  private authManager: AuthenticationManager;

  constructor() {
    this.router = Router();
    this.tableManager = new TableManager();
    this.authManager = new AuthenticationManager(''); // Will be set from env
    
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Authentication routes
    this.router.post('/api/auth/register', this.handleRegister.bind(this));
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

    // CORS preflight handler - more specific patterns first
    this.router.options('/api/*', this.handleOptionsRequest.bind(this));

    // Catch all
    this.router.all('*', this.handleNotFound.bind(this));
  }

  getRouter(): ReturnType<typeof Router> {
    return this.router;
  }

  // Authentication middleware
  private async authenticateRequest(request: AuthenticatedRequest): Promise<Response | void> {
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
  private async handleRegister(request: AuthenticatedRequest): Promise<Response> {
    console.log('Register request received:', request.method, request.url);
    try {
      const body = await request.json() as { username: string; email: string; password: string };
      console.log('Register request body:', { username: body.username, email: body.email });
      
      if (!body.username || !body.email || !body.password) {
        return this.errorResponse('Username, email, and password are required', 400);
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(body.email)) {
        return this.errorResponse('Invalid email format', 400);
      }

      // Validate password strength
      if (body.password.length < 6) {
        return this.errorResponse('Password must be at least 6 characters long', 400);
      }

      // Check if user already exists
      if (request.env?.DB) {
        const playerRepo = new D1PlayerRepository(request.env.DB);
        
        // Check username
        const existingByUsername = await playerRepo.findByUsername(body.username);
        if (existingByUsername) {
          return this.errorResponse('Username already exists', 409);
        }

        // Check email
        const existingByEmail = await playerRepo.findByEmail(body.email);
        if (existingByEmail) {
          return this.errorResponse('Email already exists', 409);
        }

        // Hash the password
        const { hash: passwordHash, salt: passwordSalt } = await PasswordManager.hashPassword(body.password);

        // Create new player with password hash
        const playerData = {
          username: body.username,
          email: body.email,
          chipCount: 1000, // Starting chips
          status: PlayerStatus.ACTIVE,
          isDealer: false,
          timeBank: 30000, // 30 seconds
        };

        // Create player using a direct database insert to include password fields
        const playerId = RandomUtils.generateUUID();
        const now = new Date().toISOString();
        
        const stmt = request.env.DB.prepare(`
          INSERT INTO players (id, username, email, password_hash, password_salt, chip_count, status, is_dealer, time_bank, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        await stmt.bind(
          playerId,
          body.username,
          body.email,
          passwordHash,
          passwordSalt,
          1000,
          PlayerStatus.ACTIVE,
          false,
          30000,
          now,
          now
        ).run();

        // Initialize auth manager and generate tokens for the new user
        if (request.env?.JWT_SECRET) {
          this.authManager = new AuthenticationManager(request.env.JWT_SECRET);
        }

        // Generate tokens for the new user
        const tokens = await this.authManager.createTokensForUser({
          userId: playerId,
          username: body.username,
          email: body.email,
          roles: ['player'],
        });

        return this.successResponse({
          user: {
            id: playerId,
            username: body.username,
            email: body.email,
            chipCount: 1000,
          },
          tokens: tokens,
          message: 'Registration successful'
        });
      }

      return this.errorResponse('Database not available', 500);
    } catch (error) {
      console.error('Registration error:', error);
      return this.errorResponse(`Registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 400);
    }
  }

  private async handleLogin(request: AuthenticatedRequest): Promise<Response> {
    try {
      const body = await request.json() as { username: string; password: string };
      
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
      }, request.env?.DB);

      if (!result.success) {
        return this.errorResponse(result.error || 'Authentication failed', 401);
      }

      return this.successResponse({
        user: result.user,
        tokens: result.tokens,
        message: 'Login successful'
      });
    } catch (error) {
      return this.errorResponse('Invalid request body', 400);
    }
  }

  private async handleRefreshToken(request: AuthenticatedRequest): Promise<Response> {
    try {
      const body = await request.json() as { refreshToken: string };
      
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
    } catch (error) {
      return this.errorResponse('Invalid request body', 400);
    }
  }

  private async handleLogout(request: AuthenticatedRequest): Promise<Response> {
    if (!request.user) {
      return this.errorResponse('Not authenticated', 401);
    }

    await this.authManager.revokeSession(request.user.userId, request.user.sessionId);
    return this.successResponse({ message: 'Logged out successfully' });
  }

  // Player handlers
  private async handleGetProfile(request: AuthenticatedRequest): Promise<Response> {
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
    } catch (error) {
      return this.errorResponse('Failed to fetch profile', 500);
    }
  }

  private async handleUpdateProfile(request: AuthenticatedRequest): Promise<Response> {
    if (!request.user || !request.env) {
      return this.errorResponse('Not authenticated', 401);
    }

    try {
      const body = await request.json() as Partial<{ username: string; email: string }>;
      const playerRepo = new D1PlayerRepository(request.env.DB);
      
      const updates: any = {};
      if (body.username) {
        updates.username = ValidationUtils.sanitizeUsername(body.username);
      }
      if (body.email) {
        updates.email = body.email;
      }

      const updatedPlayer = await playerRepo.update(request.user.userId, updates);
      return this.successResponse(updatedPlayer);
    } catch (error) {
      return this.errorResponse('Failed to update profile', 500);
    }
  }

  // Table handlers
  private async handleGetTables(request: AuthenticatedRequest): Promise<Response> {
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
    } catch (error) {
      return this.errorResponse('Failed to fetch tables', 500);
    }
  }

  private async handleCreateTable(request: AuthenticatedRequest): Promise<Response> {
    if (!request.user) {
      return this.errorResponse('Not authenticated', 401);
    }

    try {
      const body = await request.json() as Record<string, any>;
      
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
    } catch (error) {
      return this.errorResponse('Failed to create table', 500);
    }
  }

  private async handleGetTable(request: AuthenticatedRequest): Promise<Response> {
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
    } catch (error) {
      return this.errorResponse('Failed to fetch table', 500);
    }
  }

  private async handleJoinTable(request: AuthenticatedRequest): Promise<Response> {
    const tableId = request.params?.tableId;
    if (!tableId || !request.user) {
      return this.errorResponse('Table ID and authentication required', 400);
    }

    try {
      const result = await this.tableManager.joinTable(tableId, request.user.userId);
      return this.successResponse(result);
    } catch (error) {
      return this.errorResponse('Failed to join table', 500);
    }
  }

  private async handleLeaveTable(request: AuthenticatedRequest): Promise<Response> {
    const tableId = request.params?.tableId;
    if (!tableId || !request.user) {
      return this.errorResponse('Table ID and authentication required', 400);
    }

    try {
      await this.tableManager.leaveTable(tableId, request.user.userId);
      return this.successResponse({ message: 'Left table successfully' });
    } catch (error) {
      return this.errorResponse('Failed to leave table', 500);
    }
  }

  private async handlePlayerAction(request: AuthenticatedRequest): Promise<Response> {
    const tableId = request.params?.tableId;
    if (!tableId || !request.user) {
      return this.errorResponse('Table ID and authentication required', 400);
    }

    try {
      const body = await request.json() as { action: string; amount?: number };
      
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
    } catch (error) {
      return this.errorResponse('Failed to process action', 500);
    }
  }

  // Game handlers
  private async handleGetGame(request: AuthenticatedRequest): Promise<Response> {
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
    } catch (error) {
      return this.errorResponse('Failed to fetch game', 500);
    }
  }

  private async handleGetGameHistory(request: AuthenticatedRequest): Promise<Response> {
    const gameId = request.params?.gameId;
    if (!gameId || !request.user) {
      return this.errorResponse('Game ID and authentication required', 400);
    }

    // Implementation would fetch hand history from R2
    return this.successResponse({ gameId, history: [] });
  }

  // Tournament handlers
  private async handleGetTournaments(request: AuthenticatedRequest): Promise<Response> {
    // Implementation would fetch tournaments from database
    return this.successResponse([]);
  }

  private async handleCreateTournament(request: AuthenticatedRequest): Promise<Response> {
    if (!request.user) {
      return this.errorResponse('Not authenticated', 401);
    }

    // Implementation would create tournament
    return this.successResponse({ message: 'Tournament creation not implemented' });
  }

  private async handleRegisterTournament(request: AuthenticatedRequest): Promise<Response> {
    const tournamentId = request.params?.tournamentId;
    if (!tournamentId || !request.user) {
      return this.errorResponse('Tournament ID and authentication required', 400);
    }

    // Implementation would register player for tournament
    return this.successResponse({ message: 'Tournament registration not implemented' });
  }

  // Health check
  private async handleHealthCheck(request: AuthenticatedRequest): Promise<Response> {
    return this.successResponse({ 
      status: 'healthy', 
      timestamp: new Date().toISOString() 
    });
  }

  // CORS preflight handler
  private async handleOptionsRequest(request: AuthenticatedRequest): Promise<Response> {
    console.log('OPTIONS request received for:', request.url);
    return new Response(null, {
      status: 204,
      headers: this.getCorsHeaders(),
    });
  }

  // 404 handler
  private async handleNotFound(request: AuthenticatedRequest): Promise<Response> {
    return this.errorResponse('Endpoint not found', 404);
  }

  // Utility methods
  private getCorsHeaders(): Record<string, string> {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    };
  }

  private successResponse<T>(data: T): Response {
    const response: ApiResponse<T> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      headers: { 
        'Content-Type': 'application/json',
        ...this.getCorsHeaders(),
      },
    });
  }

  private errorResponse(message: string, status: number = 500): Response {
    const response: ApiResponse = {
      success: false,
      error: {
        code: status.toString(),
        message,
      },
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      status,
      headers: { 
        'Content-Type': 'application/json',
        ...this.getCorsHeaders(),
      },
    });
  }
}
