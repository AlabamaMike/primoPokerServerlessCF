import { z } from 'zod';
import { 
  PlayerSchema,
  TableConfigSchema,
  GameStateSchema,
  TournamentSchema,
  PlayerWalletSchema,
  WalletTransactionSchema
} from '@primo-poker/shared';

/**
 * Base API Response Schema
 */
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional()
  }).optional(),
  timestamp: z.string().datetime()
});

/**
 * Success Response Schema
 */
export const SuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    timestamp: z.string().datetime()
  });

/**
 * Error Response Schema
 */
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional()
  }),
  timestamp: z.string().datetime()
});

/**
 * Paginated Response Schema
 */
export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  SuccessResponseSchema(z.array(itemSchema)).extend({
    pagination: z.object({
      page: z.number().int().positive(),
      pageSize: z.number().int().positive(),
      totalPages: z.number().int().nonnegative(),
      totalItems: z.number().int().nonnegative()
    })
  });

/**
 * Auth Response Schemas
 */
export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  tokenType: z.literal('Bearer')
});

export const LoginResponseSchema = SuccessResponseSchema(z.object({
  user: z.object({
    id: z.string(),
    username: z.string(),
    email: z.string().email(),
    chipCount: z.number().nonnegative()
  }),
  tokens: AuthTokensSchema,
  message: z.string()
}));

export const RegisterResponseSchema = LoginResponseSchema;

export const RefreshTokenResponseSchema = SuccessResponseSchema(AuthTokensSchema);

/**
 * Player Response Schemas
 */
export const PlayerProfileResponseSchema = SuccessResponseSchema(PlayerSchema);

export const UpdateProfileResponseSchema = PlayerProfileResponseSchema;

/**
 * Table Response Schemas
 */
export const TableListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  gameType: z.enum(['no-limit', 'limit', 'pot-limit']),
  stakes: z.object({
    smallBlind: z.number().positive(),
    bigBlind: z.number().positive()
  }),
  playerCount: z.number().int().nonnegative(),
  maxPlayers: z.number().int().positive(),
  isActive: z.boolean()
});

export const TablesListResponseSchema = SuccessResponseSchema(z.array(TableListItemSchema));

export const CreateTableResponseSchema = SuccessResponseSchema(z.object({
  tableId: z.string(),
  config: TableConfigSchema,
  createdAt: z.string().datetime()
}));

export const TableStateResponseSchema = SuccessResponseSchema(z.object({
  tableId: z.string(),
  config: TableConfigSchema,
  playerCount: z.number().int().nonnegative(),
  isActive: z.boolean(),
  gameState: GameStateSchema.optional()
}));

export const JoinTableResponseSchema = SuccessResponseSchema(z.object({
  success: z.boolean(),
  seatNumber: z.number().int().min(1).max(9),
  message: z.string()
}));

export const LeaveTableResponseSchema = SuccessResponseSchema(z.object({
  success: z.boolean(),
  message: z.string()
}));

export const TableSeatsResponseSchema = SuccessResponseSchema(z.object({
  tableId: z.string(),
  maxSeats: z.number().int().positive(),
  seats: z.array(z.object({
    seatNumber: z.number().int().positive(),
    isOccupied: z.boolean(),
    playerId: z.string().optional(),
    playerName: z.string().optional(),
    chipCount: z.number().nonnegative().optional(),
    isActive: z.boolean()
  })),
  availableSeats: z.array(z.number().int().positive())
}));

/**
 * Wallet Response Schemas
 */
export const WalletResponseSchema = SuccessResponseSchema(PlayerWalletSchema);

export const BalanceResponseSchema = SuccessResponseSchema(z.object({
  balance: z.number().nonnegative(),
  pending: z.number().nonnegative()
}));

export const DepositResponseSchema = SuccessResponseSchema(z.object({
  success: z.boolean(),
  newBalance: z.number().nonnegative(),
  transactionId: z.string()
}));

export const WithdrawResponseSchema = DepositResponseSchema;

export const TransferResponseSchema = SuccessResponseSchema(z.object({
  success: z.boolean(),
  newBalance: z.number().nonnegative(),
  transferredAmount: z.number().positive(),
  transactionId: z.string()
}));

export const BuyInResponseSchema = SuccessResponseSchema(z.object({
  success: z.boolean(),
  chips: z.number().positive(),
  newBalance: z.number().nonnegative()
}));

export const CashOutResponseSchema = SuccessResponseSchema(z.object({
  success: z.boolean(),
  newBalance: z.number().nonnegative(),
  cashedOut: z.number().positive()
}));

export const TransactionHistoryResponseSchema = SuccessResponseSchema(z.object({
  transactions: z.array(WalletTransactionSchema),
  next_cursor: z.string().optional()
}));

/**
 * Game Response Schemas
 */
export const GameResponseSchema = SuccessResponseSchema(GameStateSchema);

export const GameHistoryResponseSchema = SuccessResponseSchema(z.object({
  gameId: z.string(),
  history: z.array(z.unknown()) // TODO: Define hand history schema
}));

/**
 * Tournament Response Schemas
 */
export const TournamentsListResponseSchema = SuccessResponseSchema(z.array(TournamentSchema));

export const CreateTournamentResponseSchema = SuccessResponseSchema(z.object({
  message: z.string()
}));

export const RegisterTournamentResponseSchema = CreateTournamentResponseSchema;

/**
 * Health Check Response Schema
 */
export const HealthCheckResponseSchema = SuccessResponseSchema(z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  timestamp: z.string().datetime(),
  environment: z.string(),
  version: z.string().optional(),
  services: z.object({
    database: z.string(),
    session: z.string(),
    tables: z.string(),
    files: z.string(),
    websocket: z.string()
  }),
  health: z.object({
    database: z.object({
      status: z.enum(['healthy', 'degraded', 'unhealthy']),
      responseTime: z.number(),
      error: z.string().optional(),
      details: z.record(z.unknown()).optional()
    }),
    durableObjects: z.object({
      status: z.enum(['healthy', 'degraded', 'unhealthy']),
      responseTime: z.number(),
      error: z.string().optional(),
      details: z.record(z.unknown()).optional()
    }),
    sessionStore: z.object({
      status: z.enum(['healthy', 'degraded', 'unhealthy']),
      responseTime: z.number(),
      error: z.string().optional(),
      details: z.record(z.unknown()).optional()
    }),
    overall: z.string()
  }),
  metrics: z.object({
    requestsPerMinute: z.number(),
    averageResponseTime: z.number(),
    errorRate: z.number(),
    p95ResponseTime: z.number(),
    p99ResponseTime: z.number()
  }).optional(),
  rateLimiting: z.object({
    enabled: z.boolean(),
    requestsPerWindow: z.number().int().positive(),
    windowSize: z.string()
  }),
  websocket: z.object({
    url: z.string(),
    status: z.string(),
    upgrade: z.string(),
    authentication: z.string()
  })
}));

/**
 * Response Schema Registry
 * Maps API endpoints to their response schemas
 */
export const ResponseSchemaRegistry = {
  // Auth endpoints
  'POST /api/auth/register': RegisterResponseSchema,
  'POST /api/auth/login': LoginResponseSchema,
  'POST /api/auth/refresh': RefreshTokenResponseSchema,
  'POST /api/auth/logout': SuccessResponseSchema(z.object({ message: z.string() })),
  
  // Player endpoints
  'GET /api/players/me': PlayerProfileResponseSchema,
  'PUT /api/players/me': UpdateProfileResponseSchema,
  
  // Table endpoints
  'GET /api/tables': TablesListResponseSchema,
  'POST /api/tables': CreateTableResponseSchema,
  'GET /api/tables/:tableId': TableStateResponseSchema,
  'GET /api/tables/:tableId/seats': TableSeatsResponseSchema,
  'POST /api/tables/:tableId/join': JoinTableResponseSchema,
  'POST /api/tables/:tableId/leave': LeaveTableResponseSchema,
  
  // Wallet endpoints
  'GET /api/wallet': WalletResponseSchema,
  'GET /api/wallet/balance': BalanceResponseSchema,
  'POST /api/wallet/deposit': DepositResponseSchema,
  'POST /api/wallet/withdraw': WithdrawResponseSchema,
  'POST /api/wallet/transfer': TransferResponseSchema,
  'POST /api/wallet/buy-in': BuyInResponseSchema,
  'POST /api/wallet/cash-out': CashOutResponseSchema,
  'GET /api/wallet/transactions': TransactionHistoryResponseSchema,
  
  // Game endpoints
  'GET /api/games/:gameId': GameResponseSchema,
  'GET /api/games/:gameId/history': GameHistoryResponseSchema,
  
  // Tournament endpoints
  'GET /api/tournaments': TournamentsListResponseSchema,
  'POST /api/tournaments': CreateTournamentResponseSchema,
  'POST /api/tournaments/:tournamentId/register': RegisterTournamentResponseSchema,
  
  // Health check
  'GET /api/health': HealthCheckResponseSchema,
  
  // Lobby
  'GET /api/lobby/tables': TablesListResponseSchema
} as const;

export type ResponseSchemaKey = keyof typeof ResponseSchemaRegistry;