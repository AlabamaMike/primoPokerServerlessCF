import { z } from 'zod'
import { apiClient } from './type-safe-client'
import type { EndpointDefinition } from './type-safe-client'
import { 
  GamePhase,
  PlayerAction,
  PlayerStatus
} from '@primo-poker/shared'

// Auth endpoints
const LoginResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    playerId: z.string().optional(),
    username: z.string(),
    email: z.string(),
    name: z.string().optional(),
    roles: z.array(z.string()).optional()
  }),
  tokens: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresAt: z.string().optional()
  }),
  message: z.string()
})

const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
})

const RegisterRequestSchema = z.object({
  username: z.string().min(3).max(20),
  email: z.string().email(),
  password: z.string().min(8)
})

export const authEndpoints = {
  login: apiClient.createEndpoint<
    z.infer<typeof LoginRequestSchema>,
    z.infer<typeof LoginResponseSchema>
  >({
    method: 'POST',
    path: '/api/auth/login',
    requestSchema: LoginRequestSchema,
    responseSchema: LoginResponseSchema,
    authenticated: false
  }),

  register: apiClient.createEndpoint<
    z.infer<typeof RegisterRequestSchema>,
    { message: string; userId: string }
  >({
    method: 'POST',
    path: '/api/auth/register',
    requestSchema: RegisterRequestSchema,
    responseSchema: z.object({
      message: z.string(),
      userId: z.string()
    }),
    authenticated: false
  }),

  logout: apiClient.createEndpoint<void, { message: string }>({
    method: 'POST',
    path: '/api/auth/logout',
    responseSchema: z.object({ message: z.string() }),
    authenticated: true
  }),

  refreshToken: apiClient.createEndpoint<
    { refreshToken: string },
    z.infer<typeof LoginResponseSchema>['tokens']
  >({
    method: 'POST',
    path: '/api/auth/refresh',
    requestSchema: z.object({ refreshToken: z.string() }),
    responseSchema: LoginResponseSchema.shape.tokens,
    authenticated: false
  })
}

// Player endpoints
const PlayerResponseSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().email(),
  balance: z.number().min(0),
  avatar: z.string().optional(),
  statistics: z.object({
    gamesPlayed: z.number(),
    gamesWon: z.number(),
    totalWinnings: z.number(),
    biggestPot: z.number()
  }).optional()
})

export const playerEndpoints = {
  getProfile: apiClient.createEndpoint<void, z.infer<typeof PlayerResponseSchema>>({
    method: 'GET',
    path: '/api/players/profile',
    responseSchema: PlayerResponseSchema,
    authenticated: true
  }),

  updateProfile: apiClient.createEndpoint<
    { username?: string; avatar?: string },
    { message: string; player: z.infer<typeof PlayerResponseSchema> }
  >({
    method: 'PATCH',
    path: '/api/players/profile',
    requestSchema: z.object({
      username: z.string().min(3).max(20).optional(),
      avatar: z.string().optional()
    }),
    responseSchema: z.object({
      message: z.string(),
      player: PlayerResponseSchema
    }),
    authenticated: true
  }),

  getPlayer: apiClient.createEndpoint<void, z.infer<typeof PlayerResponseSchema>>({
    method: 'GET',
    path: '/api/players/{playerId}',
    responseSchema: PlayerResponseSchema,
    authenticated: true
  })
}

// Table endpoints
// Define Table schema inline
const TableSchema = z.object({
  id: z.string(),
  name: z.string(),
  maxPlayers: z.number(),
  smallBlind: z.number(),
  bigBlind: z.number(),
  minBuyIn: z.number(),
  maxBuyIn: z.number(),
  currentPlayers: z.number(),
  status: z.enum(['waiting', 'playing', 'finished'])
})

const TableListResponseSchema = z.object({
  tables: z.array(TableSchema),
  pagination: z.object({
    total: z.number(),
    page: z.number(),
    limit: z.number()
  }).optional()
})

const CreateTableRequestSchema = z.object({
  name: z.string().min(1).max(50),
  maxPlayers: z.number().min(2).max(10),
  smallBlind: z.number().positive(),
  bigBlind: z.number().positive(),
  minBuyIn: z.number().positive(),
  maxBuyIn: z.number().positive()
})

export const tableEndpoints = {
  listTables: apiClient.createEndpoint<
    void,
    z.infer<typeof TableListResponseSchema>
  >({
    method: 'GET',
    path: '/api/tables',
    responseSchema: TableListResponseSchema,
    authenticated: true
  }),

  getTable: apiClient.createEndpoint<void, z.infer<typeof TableSchema>>({
    method: 'GET',
    path: '/api/tables/{tableId}',
    responseSchema: TableSchema,
    authenticated: true
  }),

  createTable: apiClient.createEndpoint<
    z.infer<typeof CreateTableRequestSchema>,
    { message: string; tableId: string }
  >({
    method: 'POST',
    path: '/api/tables',
    requestSchema: CreateTableRequestSchema,
    responseSchema: z.object({
      message: z.string(),
      tableId: z.string()
    }),
    authenticated: true
  }),

  joinTable: apiClient.createEndpoint<
    { buyIn: number; seatNumber?: number },
    { message: string; seat: number }
  >({
    method: 'POST',
    path: '/api/tables/{tableId}/join',
    requestSchema: z.object({
      buyIn: z.number().positive(),
      seatNumber: z.number().min(0).max(9).optional()
    }),
    responseSchema: z.object({
      message: z.string(),
      seat: z.number()
    }),
    authenticated: true
  }),

  leaveTable: apiClient.createEndpoint<void, { message: string }>({
    method: 'POST',
    path: '/api/tables/{tableId}/leave',
    responseSchema: z.object({ message: z.string() }),
    authenticated: true
  })
}

// Game action endpoints
const GameActionRequestSchema = z.object({
  action: z.nativeEnum(PlayerAction),
  amount: z.number().min(0).optional()
})

const GameStateResponseSchema = z.object({
  phase: z.nativeEnum(GamePhase),
  pot: z.number(),
  currentBet: z.number(),
  communityCards: z.array(z.object({
    rank: z.string(),
    suit: z.string()
  })),
  currentPlayerTurn: z.string().optional(),
  players: z.array(z.object({
    id: z.string(),
    username: z.string(),
    chips: z.number(),
    bet: z.number(),
    status: z.nativeEnum(PlayerStatus),
    cards: z.array(z.object({
      rank: z.string(),
      suit: z.string()
    })).optional()
  }))
})

export const gameEndpoints = {
  performAction: apiClient.createEndpoint<
    z.infer<typeof GameActionRequestSchema>,
    { message: string; gameState: z.infer<typeof GameStateResponseSchema> }
  >({
    method: 'POST',
    path: '/api/tables/{tableId}/action',
    requestSchema: GameActionRequestSchema,
    responseSchema: z.object({
      message: z.string(),
      gameState: GameStateResponseSchema
    }),
    authenticated: true
  }),

  getGameState: apiClient.createEndpoint<
    void,
    z.infer<typeof GameStateResponseSchema>
  >({
    method: 'GET',
    path: '/api/tables/{tableId}/game',
    responseSchema: GameStateResponseSchema,
    authenticated: true
  })
}

// Wallet endpoints
const WalletResponseSchema = z.object({
  balance: z.number().min(0),
  currency: z.string().default('USD'),
  lastUpdated: z.string()
})

// Define Transaction schema inline
const TransactionSchema = z.object({
  id: z.string(),
  type: z.enum(['deposit', 'withdrawal', 'transfer', 'win', 'loss']),
  amount: z.number(),
  timestamp: z.string(),
  description: z.string().optional(),
  status: z.enum(['pending', 'completed', 'failed'])
})

const TransactionListResponseSchema = z.object({
  transactions: z.array(TransactionSchema),
  pagination: z.object({
    hasMore: z.boolean(),
    cursor: z.string().optional()
  })
})

export const walletEndpoints = {
  getBalance: apiClient.createEndpoint<void, z.infer<typeof WalletResponseSchema>>({
    method: 'GET',
    path: '/api/wallet/balance',
    responseSchema: WalletResponseSchema,
    authenticated: true
  }),

  deposit: apiClient.createEndpoint<
    { amount: number; method: 'credit_card' | 'bank' },
    { message: string; newBalance: number; transactionId: string }
  >({
    method: 'POST',
    path: '/api/wallet/deposit',
    requestSchema: z.object({
      amount: z.number().positive(),
      method: z.enum(['credit_card', 'bank'])
    }),
    responseSchema: z.object({
      message: z.string(),
      newBalance: z.number(),
      transactionId: z.string()
    }),
    authenticated: true
  }),

  withdraw: apiClient.createEndpoint<
    { amount: number; method: 'bank' | 'check' },
    { message: string; newBalance: number; transactionId: string }
  >({
    method: 'POST',
    path: '/api/wallet/withdraw',
    requestSchema: z.object({
      amount: z.number().positive(),
      method: z.enum(['bank', 'check'])
    }),
    responseSchema: z.object({
      message: z.string(),
      newBalance: z.number(),
      transactionId: z.string()
    }),
    authenticated: true
  }),

  getTransactions: apiClient.createEndpoint<
    void,
    z.infer<typeof TransactionListResponseSchema>
  >({
    method: 'GET',
    path: '/api/wallet/transactions',
    responseSchema: TransactionListResponseSchema,
    authenticated: true
  })
}

// Health check endpoint
export const healthEndpoint = apiClient.createEndpoint<
  void,
  { status: string; timestamp: string; version?: string }
>({
  method: 'GET',
  path: '/api/health',
  responseSchema: z.object({
    status: z.string(),
    timestamp: z.string(),
    version: z.string().optional()
  }),
  authenticated: false
})

// Export all endpoints
export const api = {
  auth: authEndpoints,
  player: playerEndpoints,
  table: tableEndpoints,
  game: gameEndpoints,
  wallet: walletEndpoints,
  health: healthEndpoint
}