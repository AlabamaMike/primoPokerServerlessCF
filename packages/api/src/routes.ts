import { IRequest, Router } from 'itty-router';
import { 
  ApiResponse, 
  TableConfigSchema,
  ValidationUtils,
  RandomUtils,
  PlayerStatus,
  BuyInRequest,
  BuyInResponse,
  PlayerWallet
} from '@primo-poker/shared';
import { TableManager } from '@primo-poker/core';
import { AuthenticationManager, TokenPayload, PasswordManager } from '@primo-poker/security';
import { D1PlayerRepository, D1GameRepository, WalletManager } from '@primo-poker/persistence';

// Extended request interface with authentication
interface AuthenticatedRequest extends IRequest {
  user?: TokenPayload;
  env?: WorkerEnv;
}

interface WorkerEnv {
  DB: D1Database;
  SESSION_STORE: KVNamespace;
  TABLE_OBJECTS: DurableObjectNamespace;
  GAME_TABLES: DurableObjectNamespace;
  JWT_SECRET: string;
}

export class PokerAPIRoutes {
  private router: any; // Using any to avoid itty-router type issues
  private tableManager: TableManager;
  private authManager: AuthenticationManager;
  private walletManager: WalletManager;

  constructor() {
    this.router = Router();
    this.tableManager = new TableManager();
    this.authManager = new AuthenticationManager(''); // Will be set from env
    this.walletManager = new WalletManager();
    
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

    // Wallet routes
    this.router.get('/api/wallet', this.authenticateRequest.bind(this), this.handleGetWallet.bind(this));
    this.router.post('/api/wallet/buyin', this.authenticateRequest.bind(this), this.handleBuyIn.bind(this));
    this.router.post('/api/wallet/cashout', this.authenticateRequest.bind(this), this.handleCashOut.bind(this));
    this.router.get('/api/wallet/transactions', this.authenticateRequest.bind(this), this.handleGetTransactions.bind(this));

    // Table routes
    this.router.get('/api/tables', this.handleGetTables.bind(this));
    this.router.post('/api/tables', this.authenticateRequest.bind(this), this.handleCreateTable.bind(this));
    this.router.get('/api/tables/:tableId', this.handleGetTable.bind(this));
    this.router.get('/api/tables/:tableId/seats', this.handleGetTableSeats.bind(this));
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
      // For now, return an empty array since we don't have a table registry yet
      // In production, this would query a table registry or database
      const tables: any[] = [];
      
      // If we have specific table IDs in KV storage or database, we could query them
      // For demo purposes, let's check if there's a known table in the request
      const knownTableId = request.query?.tableId;
      
      if (knownTableId && request.env?.GAME_TABLES) {
        try {
          const durableObjectId = request.env.GAME_TABLES.idFromName(knownTableId as string);
          const gameTable = request.env.GAME_TABLES.get(durableObjectId);
          
          const stateResponse = await gameTable.fetch(
            new Request(`http://internal/state`, {
              method: 'GET',
            })
          );
          
          if (stateResponse.ok) {
            const tableState = await stateResponse.json() as any;
            tables.push({
              id: tableState.tableId,
              name: tableState.config.name,
              gameType: tableState.config.gameType,
              stakes: {
                smallBlind: tableState.config.smallBlind,
                bigBlind: tableState.config.bigBlind,
              },
              playerCount: tableState.playerCount,
              maxPlayers: tableState.config.maxPlayers,
              isActive: tableState.isActive,
            });
          }
        } catch (error) {
          console.error('Error fetching table state:', error);
        }
      }
      
      return this.successResponse(tables);
    } catch (error) {
      return this.errorResponse('Failed to fetch tables', 500);
    }
  }

  private async handleCreateTable(request: AuthenticatedRequest): Promise<Response> {
    if (!request.user) {
      return this.errorResponse('Not authenticated', 401);
    }

    if (!request.env?.GAME_TABLES) {
      return this.errorResponse('Server configuration error', 500);
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
        console.error('Table config validation failed:', configResult.error.format());
        return this.errorResponse('Invalid table configuration', 400);
      }

      // Create table using Durable Object
      const tableId = config.id;
      const durableObjectId = request.env.GAME_TABLES.idFromName(tableId);
      const gameTable = request.env.GAME_TABLES.get(durableObjectId);

      // Send create request to Durable Object
      const createResponse = await gameTable.fetch(
        new Request(`http://internal/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Creator-ID': request.user.userId,
            'X-Creator-Username': request.user.username,
          },
          body: JSON.stringify({ config: configResult.data }),
        })
      );

      if (!createResponse.ok) {
        const error = await createResponse.text();
        return this.errorResponse(error || 'Failed to create table', createResponse.status);
      }

      const tableData = await createResponse.json() as any;
      
      return this.successResponse({
        tableId: tableId,
        ...tableData,
      });
    } catch (error) {
      console.error('Table creation error:', error);
      return this.errorResponse('Failed to create table', 500);
    }
  }

  private async handleGetTable(request: AuthenticatedRequest): Promise<Response> {
    const tableId = request.params?.tableId;
    if (!tableId) {
      return this.errorResponse('Table ID required', 400);
    }

    if (!request.env?.GAME_TABLES) {
      return this.errorResponse('Server configuration error', 500);
    }

    try {
      const durableObjectId = request.env.GAME_TABLES.idFromName(tableId);
      const gameTable = request.env.GAME_TABLES.get(durableObjectId);
      
      const stateResponse = await gameTable.fetch(
        new Request(`http://internal/state`, {
          method: 'GET',
        })
      );
      
      if (!stateResponse.ok) {
        return this.errorResponse('Table not found', 404);
      }

      const tableState = await stateResponse.json();
      return this.successResponse(tableState);
    } catch (error) {
      console.error('Get table error:', error);
      return this.errorResponse('Failed to fetch table', 500);
    }
  }

  private async handleJoinTable(request: AuthenticatedRequest): Promise<Response> {
    const tableId = request.params?.tableId;
    if (!tableId || !request.user) {
      return this.errorResponse('Table ID and authentication required', 400);
    }

    if (!request.env?.GAME_TABLES) {
      return this.errorResponse('Server configuration error', 500);
    }

    try {
      const body = await request.json() as { buyIn?: number; password?: string };
      
      // Get the table's durable object
      const durableObjectId = request.env.GAME_TABLES.idFromName(tableId);
      const gameTable = request.env.GAME_TABLES.get(durableObjectId);

      // Send join request to Durable Object
      const joinResponse = await gameTable.fetch(
        new Request(`http://internal/join`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Player-ID': request.user.userId,
            'X-Username': request.user.username,
          },
          body: JSON.stringify({
            playerId: request.user.userId,
            buyIn: body.buyIn || 100, // Default buy-in
            password: body.password,
          }),
        })
      );

      if (!joinResponse.ok) {
        const error = await joinResponse.text();
        return this.errorResponse(error || 'Failed to join table', joinResponse.status);
      }

      const result = await joinResponse.json();
      return this.successResponse(result);
    } catch (error) {
      console.error('Join table error:', error);
      return this.errorResponse('Failed to join table', 500);
    }
  }

  private async handleLeaveTable(request: AuthenticatedRequest): Promise<Response> {
    const tableId = request.params?.tableId;
    if (!tableId || !request.user) {
      return this.errorResponse('Table ID and authentication required', 400);
    }
    
    if (!request.env?.GAME_TABLES) {
      return this.errorResponse('Server configuration error', 500);
    }

    try {
      // Get the table's durable object
      const durableObjectId = request.env.GAME_TABLES.idFromName(tableId);
      const gameTable = request.env.GAME_TABLES.get(durableObjectId);
      
      // Send leave request to Durable Object
      const leaveResponse = await gameTable.fetch(
        new Request(`http://internal/leave`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Player-ID': request.user.userId,
          },
        })
      );
      
      if (!leaveResponse.ok) {
        const error = await leaveResponse.json() as any;
        return this.errorResponse(error.error || 'Failed to leave table', leaveResponse.status);
      }
      
      const result = await leaveResponse.json();
      return this.successResponse(result);
    } catch (error) {
      console.error('Leave table error:', error);
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

  // Wallet handlers
  private async handleGetWallet(request: AuthenticatedRequest): Promise<Response> {
    try {
      if (!request.user?.userId) {
        return this.errorResponse('User not authenticated', 401);
      }

      const wallet = await this.walletManager.getWallet(request.user.userId);
      return this.successResponse(wallet);
    } catch (error) {
      console.error('Get wallet error:', error);
      return this.errorResponse('Failed to get wallet information');
    }
  }

  private async handleBuyIn(request: AuthenticatedRequest): Promise<Response> {
    try {
      if (!request.user?.userId) {
        return this.errorResponse('User not authenticated', 401);
      }

      const buyInRequest: BuyInRequest = await request.json();
      
      // Validate request
      if (!buyInRequest.tableId || !buyInRequest.amount || buyInRequest.amount <= 0) {
        return this.errorResponse('Invalid buy-in request', 400);
      }

      buyInRequest.playerId = request.user.userId;
      const result = await this.walletManager.processBuyIn(buyInRequest);
      
      return this.successResponse(result);
    } catch (error) {
      console.error('Buy-in error:', error);
      return this.errorResponse('Failed to process buy-in');
    }
  }

  private async handleCashOut(request: AuthenticatedRequest): Promise<Response> {
    try {
      if (!request.user?.userId) {
        return this.errorResponse('User not authenticated', 401);
      }

      const body = await request.json() as { tableId: string; chipAmount: number };
      
      if (!body.tableId || !body.chipAmount || body.chipAmount <= 0) {
        return this.errorResponse('Invalid cash-out request', 400);
      }

      await this.walletManager.processCashOut(request.user.userId, body.tableId, body.chipAmount);
      const wallet = await this.walletManager.getWallet(request.user.userId);
      
      return this.successResponse({
        success: true,
        newBalance: wallet.balance,
        cashedOut: body.chipAmount
      });
    } catch (error) {
      console.error('Cash-out error:', error);
      return this.errorResponse('Failed to process cash-out');
    }
  }

  private async handleGetTransactions(request: AuthenticatedRequest): Promise<Response> {
    try {
      if (!request.user?.userId) {
        return this.errorResponse('User not authenticated', 401);
      }

      const url = new URL(request.url);
      const limit = parseInt(url.searchParams.get('limit') || '50');
      
      const transactions = await this.walletManager.getTransactionHistory(request.user.userId, limit);
      return this.successResponse(transactions);
    } catch (error) {
      console.error('Get transactions error:', error);
      return this.errorResponse('Failed to get transaction history');
    }
  }

  private async handleGetTableSeats(request: AuthenticatedRequest): Promise<Response> {
    try {
      const tableId = request.params?.tableId;
      if (!tableId) {
        return this.errorResponse('Table ID is required', 400);
      }

      // Mock seat data for now - in production this would come from the table DO
      const seats = Array.from({ length: 9 }, (_, i) => ({
        seatNumber: i + 1,
        isOccupied: Math.random() < 0.3,
        playerId: Math.random() < 0.3 ? `player-${i}` : undefined,
        playerName: Math.random() < 0.3 ? `Player${i + 1}` : undefined,
        chipCount: Math.random() < 0.3 ? Math.floor(Math.random() * 2000) + 200 : undefined,
        isActive: Math.random() < 0.8
      }));

      const availableSeats = seats
        .filter(seat => !seat.isOccupied)
        .map(seat => seat.seatNumber);

      return this.successResponse({
        tableId,
        maxSeats: 9,
        seats,
        availableSeats
      });
    } catch (error) {
      console.error('Get table seats error:', error);
      return this.errorResponse('Failed to get table seat information');
    }
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
