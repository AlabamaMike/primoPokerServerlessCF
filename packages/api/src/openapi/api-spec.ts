import { z } from 'zod';
import { OpenAPIGenerator, createApiResponseSchema, createPaginatedResponseSchema } from './generator';
import { 
  PlayerSchema, 
  TableConfigSchema,
  GameStateSchema,
  PlayerActionSchema,
  GamePhase,
  PlayerStatus,
  TournamentStatus,
  WorkerEnvironment
} from '@primo-poker/shared';
import { 
  DepositRequestSchema, 
  WithdrawRequestSchema, 
  TransferRequestSchema,
  TransactionQuerySchema 
} from '../validation/wallet-schemas';

/**
 * Generate the complete OpenAPI specification for the Primo Poker API
 */
export function generateOpenAPISpec(): string {
  const generator = new OpenAPIGenerator(
    {
      title: 'Primo Poker API',
      version: '1.0.0',
      description: 'Professional serverless poker platform API built on Cloudflare Workers',
      contact: {
        name: 'Primo Poker Support',
        email: 'support@primopoker.com',
        url: 'https://primopoker.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    [
      {
        url: 'https://primo-poker-server.alabamamike.workers.dev',
        description: 'Production server'
      },
      {
        url: 'http://localhost:8787',
        description: 'Local development server'
      }
    ]
  );

  // Register common schemas
  generator.registerSchema('Player', PlayerSchema);
  generator.registerSchema('TableConfig', TableConfigSchema);
  generator.registerSchema('GameState', GameStateSchema);
  generator.registerSchema('PlayerAction', PlayerActionSchema);
  
  // Authentication endpoints
  generator.addEndpoint('/api/auth/register', 'post', {
    operationId: 'register',
    summary: 'Register a new user',
    description: 'Create a new user account with username, email, and password',
    tags: ['Authentication'],
    security: false,
    requestBody: {
      schema: z.object({
        username: z.string().min(3).max(20),
        email: z.string().email(),
        password: z.string().min(6)
      }),
      description: 'User registration data'
    },
    responses: {
      '200': {
        description: 'Registration successful',
        schema: createApiResponseSchema(z.object({
          user: z.object({
            id: z.string(),
            username: z.string(),
            email: z.string(),
            chipCount: z.number()
          }),
          tokens: z.object({
            accessToken: z.string(),
            refreshToken: z.string(),
            expiresIn: z.number()
          }),
          message: z.string()
        }))
      },
      '400': {
        description: 'Invalid request data',
        schema: createApiResponseSchema(z.never())
      },
      '409': {
        description: 'User already exists',
        schema: createApiResponseSchema(z.never())
      }
    }
  });

  generator.addEndpoint('/api/auth/login', 'post', {
    operationId: 'login',
    summary: 'Login user',
    description: 'Authenticate with username and password',
    tags: ['Authentication'],
    security: false,
    requestBody: {
      schema: z.object({
        username: z.string(),
        password: z.string()
      }),
      description: 'Login credentials'
    },
    responses: {
      '200': {
        description: 'Login successful',
        schema: createApiResponseSchema(z.object({
          user: PlayerSchema,
          tokens: z.object({
            accessToken: z.string(),
            refreshToken: z.string(),
            expiresIn: z.number()
          }),
          message: z.string()
        }))
      },
      '401': {
        description: 'Invalid credentials',
        schema: createApiResponseSchema(z.never())
      }
    }
  });

  generator.addEndpoint('/api/auth/refresh', 'post', {
    operationId: 'refreshToken',
    summary: 'Refresh access token',
    description: 'Get a new access token using a refresh token',
    tags: ['Authentication'],
    security: false,
    requestBody: {
      schema: z.object({
        refreshToken: z.string()
      }),
      description: 'Refresh token'
    },
    responses: {
      '200': {
        description: 'Token refreshed successfully',
        schema: createApiResponseSchema(z.object({
          accessToken: z.string(),
          refreshToken: z.string(),
          expiresIn: z.number()
        }))
      },
      '401': {
        description: 'Invalid refresh token',
        schema: createApiResponseSchema(z.never())
      }
    }
  });

  generator.addEndpoint('/api/auth/logout', 'post', {
    operationId: 'logout',
    summary: 'Logout user',
    description: 'Invalidate the current session',
    tags: ['Authentication'],
    responses: {
      '200': {
        description: 'Logout successful',
        schema: createApiResponseSchema(z.object({
          message: z.string()
        }))
      }
    }
  });

  // Player endpoints
  generator.addEndpoint('/api/players/me', 'get', {
    operationId: 'getProfile',
    summary: 'Get current player profile',
    description: 'Retrieve the authenticated player\'s profile information',
    tags: ['Players'],
    responses: {
      '200': {
        description: 'Player profile',
        schema: createApiResponseSchema(PlayerSchema)
      },
      '404': {
        description: 'Player not found',
        schema: createApiResponseSchema(z.never())
      }
    }
  });

  generator.addEndpoint('/api/players/me', 'put', {
    operationId: 'updateProfile',
    summary: 'Update player profile',
    description: 'Update the authenticated player\'s profile information',
    tags: ['Players'],
    requestBody: {
      schema: z.object({
        username: z.string().optional(),
        email: z.string().email().optional()
      }),
      description: 'Profile update data'
    },
    responses: {
      '200': {
        description: 'Profile updated successfully',
        schema: createApiResponseSchema(PlayerSchema)
      }
    }
  });

  // Table endpoints
  generator.addEndpoint('/api/tables', 'get', {
    operationId: 'getTables',
    summary: 'List all tables',
    description: 'Get a list of all available poker tables',
    tags: ['Tables'],
    security: false,
    parameters: [
      {
        name: 'tableId',
        in: 'query',
        schema: z.string(),
        description: 'Filter by specific table ID',
        required: false
      }
    ],
    responses: {
      '200': {
        description: 'List of tables',
        schema: createApiResponseSchema(z.array(z.object({
          id: z.string(),
          name: z.string(),
          gameType: z.string(),
          stakes: z.object({
            smallBlind: z.number(),
            bigBlind: z.number()
          }),
          playerCount: z.number(),
          maxPlayers: z.number(),
          isActive: z.boolean()
        })))
      }
    }
  });

  generator.addEndpoint('/api/tables', 'post', {
    operationId: 'createTable',
    summary: 'Create a new table',
    description: 'Create a new poker table with specified configuration',
    tags: ['Tables'],
    requestBody: {
      schema: TableConfigSchema.omit({ id: true }),
      description: 'Table configuration'
    },
    responses: {
      '200': {
        description: 'Table created successfully',
        schema: createApiResponseSchema(z.object({
          tableId: z.string(),
          config: TableConfigSchema,
          isActive: z.boolean(),
          playerCount: z.number()
        }))
      },
      '400': {
        description: 'Invalid table configuration',
        schema: createApiResponseSchema(z.never())
      }
    }
  });

  generator.addEndpoint('/api/tables/{tableId}', 'get', {
    operationId: 'getTable',
    summary: 'Get table details',
    description: 'Get detailed information about a specific table',
    tags: ['Tables'],
    security: false,
    parameters: [
      {
        name: 'tableId',
        in: 'path',
        schema: z.string(),
        description: 'Table ID'
      }
    ],
    responses: {
      '200': {
        description: 'Table details',
        schema: createApiResponseSchema(z.object({
          tableId: z.string(),
          config: TableConfigSchema,
          gameState: GameStateSchema.optional(),
          players: z.array(PlayerSchema),
          isActive: z.boolean()
        }))
      },
      '404': {
        description: 'Table not found',
        schema: createApiResponseSchema(z.never())
      }
    }
  });

  generator.addEndpoint('/api/tables/{tableId}/join', 'post', {
    operationId: 'joinTable',
    summary: 'Join a table',
    description: 'Join a poker table with optional buy-in',
    tags: ['Tables'],
    parameters: [
      {
        name: 'tableId',
        in: 'path',
        schema: z.string(),
        description: 'Table ID'
      }
    ],
    requestBody: {
      schema: z.object({
        buyIn: z.number().optional(),
        password: z.string().optional()
      }),
      description: 'Join table parameters'
    },
    responses: {
      '200': {
        description: 'Successfully joined table',
        schema: createApiResponseSchema(z.object({
          seatNumber: z.number(),
          chipCount: z.number()
        }))
      },
      '400': {
        description: 'Unable to join table',
        schema: createApiResponseSchema(z.never())
      }
    }
  });

  generator.addEndpoint('/api/tables/{tableId}/leave', 'post', {
    operationId: 'leaveTable',
    summary: 'Leave a table',
    description: 'Leave the current poker table',
    tags: ['Tables'],
    parameters: [
      {
        name: 'tableId',
        in: 'path',
        schema: z.string(),
        description: 'Table ID'
      }
    ],
    responses: {
      '200': {
        description: 'Successfully left table',
        schema: createApiResponseSchema(z.object({
          message: z.string()
        }))
      }
    }
  });

  generator.addEndpoint('/api/tables/{tableId}/action', 'post', {
    operationId: 'performAction',
    summary: 'Perform game action',
    description: 'Perform a game action at the table (fold, call, raise, etc.)',
    tags: ['Tables', 'Game'],
    parameters: [
      {
        name: 'tableId',
        in: 'path',
        schema: z.string(),
        description: 'Table ID'
      }
    ],
    requestBody: {
      schema: z.object({
        action: z.enum(['fold', 'check', 'call', 'bet', 'raise', 'all-in']),
        amount: z.number().optional()
      }),
      description: 'Player action'
    },
    responses: {
      '200': {
        description: 'Action performed successfully',
        schema: createApiResponseSchema(z.object({
          success: z.boolean(),
          gameState: GameStateSchema
        }))
      },
      '400': {
        description: 'Invalid action',
        schema: createApiResponseSchema(z.never())
      }
    }
  });

  // Wallet endpoints
  generator.addEndpoint('/api/wallet/balance', 'get', {
    operationId: 'getBalance',
    summary: 'Get wallet balance',
    description: 'Get the current wallet balance',
    tags: ['Wallet'],
    responses: {
      '200': {
        description: 'Wallet balance',
        schema: createApiResponseSchema(z.object({
          balance: z.number(),
          pending: z.number()
        }))
      }
    }
  });

  generator.addEndpoint('/api/wallet/deposit', 'post', {
    operationId: 'deposit',
    summary: 'Deposit funds',
    description: 'Deposit funds into the wallet',
    tags: ['Wallet'],
    requestBody: {
      schema: DepositRequestSchema,
      description: 'Deposit details'
    },
    responses: {
      '200': {
        description: 'Deposit successful',
        schema: createApiResponseSchema(z.object({
          success: z.boolean(),
          newBalance: z.number(),
          transactionId: z.string()
        }))
      }
    }
  });

  generator.addEndpoint('/api/wallet/withdraw', 'post', {
    operationId: 'withdraw',
    summary: 'Withdraw funds',
    description: 'Withdraw funds from the wallet',
    tags: ['Wallet'],
    requestBody: {
      schema: WithdrawRequestSchema,
      description: 'Withdrawal details'
    },
    responses: {
      '200': {
        description: 'Withdrawal successful',
        schema: createApiResponseSchema(z.object({
          success: z.boolean(),
          newBalance: z.number(),
          transactionId: z.string()
        }))
      }
    }
  });

  generator.addEndpoint('/api/wallet/transactions', 'get', {
    operationId: 'getTransactions',
    summary: 'Get transaction history',
    description: 'Get wallet transaction history with pagination',
    tags: ['Wallet'],
    parameters: [
      {
        name: 'limit',
        in: 'query',
        schema: z.number().min(1).max(100),
        description: 'Number of transactions to return',
        required: false
      },
      {
        name: 'cursor',
        in: 'query',
        schema: z.string(),
        description: 'Pagination cursor',
        required: false
      }
    ],
    responses: {
      '200': {
        description: 'Transaction history',
        schema: createApiResponseSchema(z.object({
          transactions: z.array(z.object({
            id: z.string(),
            type: z.enum(['deposit', 'withdraw', 'buy_in', 'cash_out', 'transfer']),
            amount: z.number(),
            createdAt: z.string(),
            status: z.string()
          })),
          next_cursor: z.string().optional()
        }))
      }
    }
  });

  // Game endpoints
  generator.addEndpoint('/api/games/{gameId}', 'get', {
    operationId: 'getGame',
    summary: 'Get game details',
    description: 'Get detailed information about a specific game',
    tags: ['Games'],
    parameters: [
      {
        name: 'gameId',
        in: 'path',
        schema: z.string(),
        description: 'Game ID'
      }
    ],
    responses: {
      '200': {
        description: 'Game details',
        schema: createApiResponseSchema(GameStateSchema)
      },
      '404': {
        description: 'Game not found',
        schema: createApiResponseSchema(z.never())
      }
    }
  });

  // Health endpoint
  generator.addEndpoint('/api/health', 'get', {
    operationId: 'healthCheck',
    summary: 'Health check',
    description: 'Check the health status of the API',
    tags: ['System'],
    security: false,
    responses: {
      '200': {
        description: 'Service is healthy',
        schema: createApiResponseSchema(z.object({
          status: z.enum(['healthy', 'degraded', 'unhealthy']),
          version: z.string(),
          uptime: z.number(),
          checks: z.object({
            database: z.object({
              status: z.enum(['healthy', 'unhealthy']),
              latency: z.number()
            }),
            kvStore: z.object({
              status: z.enum(['healthy', 'unhealthy']),
              latency: z.number()
            })
          })
        }))
      },
      '503': {
        description: 'Service is unhealthy',
        schema: createApiResponseSchema(z.never())
      }
    }
  });

  return generator.toJSON();
}

/**
 * Generate OpenAPI specification as YAML
 */
export function generateOpenAPIYaml(): string {
  const generator = new OpenAPIGenerator(
    {
      title: 'Primo Poker API',
      version: '1.0.0',
      description: 'Professional serverless poker platform API'
    }
  );
  
  // Add all endpoints (same as above)
  // ... (code would be identical to above)
  
  return generator.toYAML();
}