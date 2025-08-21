/**
 * Standard API response types
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  timestamp: string;
}

/**
 * Specific response types
 */

export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    username: string;
    email: string;
  };
  expiresAt: number;
}

export interface TableListResponse {
  tables: Array<{
    id: string;
    name: string;
    gameType: string;
    stakes: {
      smallBlind: number;
      bigBlind: number;
    };
    players: {
      current: number;
      max: number;
    };
    status: string;
  }>;
}

export interface WalletBalanceResponse {
  balance: number;
  currency: string;
  frozen: number;
  available: number;
  lastUpdated: string;
}

export interface TransactionResponse {
  id: string;
  type: 'deposit' | 'withdrawal' | 'transfer' | 'game_win' | 'game_loss';
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  completedAt?: string;
  details?: Record<string, unknown>;
}

export interface PlayerStatsResponse {
  playerId: string;
  stats: {
    handsPlayed: number;
    handsWon: number;
    totalWinnings: number;
    biggestPot: number;
    winRate: number;
    averagePot: number;
    favoriteHand?: string;
    longestSession: number;
  };
  period: 'all_time' | 'monthly' | 'weekly' | 'daily';
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  services: {
    database: boolean;
    durableObjects: boolean;
    websocket: boolean;
    cache?: boolean;
  };
  timestamp: string;
}