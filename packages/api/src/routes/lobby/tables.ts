import { IRequest } from 'itty-router';
import { 
  ApiResponse,
  WorkerEnvironment,
  ValidationUtils,
  RandomUtils 
} from '@primo-poker/shared';
import { logger } from '@primo-poker/core';

export interface LobbyTableFilter {
  stakes?: string[];
  seatsAvailable?: string;
  gameType?: string;
}

export interface LobbyTableSort {
  field: 'players' | 'stakes' | 'avgPot' | 'handsPerHour';
  direction: 'asc' | 'desc';
}

export interface LobbyTable {
  id: string;
  name: string;
  gameType: string;
  stakes: {
    smallBlind: number;
    bigBlind: number;
    currency: string;
  };
  seats: {
    total: number;
    occupied: number;
    available: number;
  };
  statistics: {
    avgPot: number;
    handsPerHour: number;
    playersPerFlop: number;
  };
  waitingList: number;
  isActive: boolean;
  createdAt: string;
}

export interface LobbyTablesResponse {
  tables: LobbyTable[];
  pagination: {
    cursor?: string;
    hasMore: boolean;
    total: number;
  };
}

export class LobbyTablesRoute {
  constructor(private env: WorkerEnvironment) {}

  async handleGetTables(request: IRequest): Promise<Response> {
    const correlationId = request.headers.get('X-Correlation-ID') || RandomUtils.generateUUID();
    logger.setContext({ correlationId, operation: 'getLobbyTables' });

    try {
      // Parse query parameters
      const url = new URL(request.url);
      const queryParams = url.searchParams;

      // Filters
      const filters: LobbyTableFilter = {
        stakes: queryParams.get('stakes')?.split(','),
        seatsAvailable: queryParams.get('seats_available') || undefined,
        gameType: queryParams.get('game_type') || undefined,
      };

      // Sorting
      const sortParam = queryParams.get('sort');
      let sort: LobbyTableSort | undefined;
      if (sortParam) {
        const [field, direction] = sortParam.split('_');
        if (['players', 'stakes', 'avgPot', 'handsPerHour'].includes(field)) {
          sort = {
            field: field as LobbyTableSort['field'],
            direction: (direction === 'asc' || direction === 'desc') ? direction : 'desc'
          };
        }
      }

      // Pagination
      const cursor = queryParams.get('cursor') || undefined;
      const limit = Math.min(parseInt(queryParams.get('limit') || '50'), 100);

      logger.info('Fetching lobby tables', { filters, sort, cursor, limit });

      // Get tables from LobbyCoordinator
      if (!this.env.LOBBY_COORDINATOR) {
        logger.error('LOBBY_COORDINATOR not configured');
        return this.errorResponse('Service temporarily unavailable', 503);
      }

      const durableObjectId = this.env.LOBBY_COORDINATOR.idFromName('main-lobby');
      const lobbyCoordinator = this.env.LOBBY_COORDINATOR.get(durableObjectId);

      const response = await lobbyCoordinator.fetch(`http://internal/tables`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filters,
          sort,
          cursor,
          limit,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error('Failed to fetch tables from LobbyCoordinator', { error, status: response.status });
        return this.errorResponse('Failed to fetch tables', response.status);
      }

      const result = await response.json() as LobbyTablesResponse;
      logger.info('Successfully fetched lobby tables', { tableCount: result.tables.length });

      return this.successResponse(result);
    } catch (error) {
      logger.error('Error fetching lobby tables', error, { correlationId });
      return this.errorResponse('Internal server error', 500);
    } finally {
      logger.clearContext();
    }
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
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }
}
