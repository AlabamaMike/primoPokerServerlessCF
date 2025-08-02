/**
 * RNG API Routes
 * 
 * Provides HTTP endpoints for managing secure RNG operations.
 * Integrates with SecureRNG Durable Object and handles authentication.
 */

import { Card } from '@primo-poker/shared';
import { DeckCommitment } from '@primo-poker/security';

export interface RNGApiRequest {
  tableId: string;
  gameId?: string;
  operation: 'shuffle' | 'random_int' | 'random_bytes' | 'commit_deck' | 'reveal_deck' | 'status';
  data?: any;
  authentication?: {
    playerId: string;
    token: string;
  };
}

export interface RNGApiResponse {
  success: boolean;
  data?: any;
  error?: string;
  audit?: {
    operation: string;
    timestamp: number;
    entropyUsed: number;
    operationId: string;
  };
  metadata?: {
    processingTime: number;
    version: string;
  };
}

export interface RNGStatusResponse {
  tableId: string;
  isInitialized: boolean;
  operationCount: number;
  totalEntropyUsed: number;
  lastOperation: number;
  health: 'healthy' | 'degraded' | 'unhealthy';
  performance: {
    averageResponseTime: number;
    successRate: number;
    operationsPerMinute: number;
  };
}

export class RNGApiHandler {
  private env: any;
  private static readonly API_VERSION = 'v1';
  private static readonly MAX_REQUEST_SIZE = 1024 * 1024; // 1MB
  private static readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
  private static readonly RATE_LIMIT_MAX = 100; // requests per minute

  constructor(env: any) {
    this.env = env;
  }

  /**
   * Handles incoming RNG API requests
   */
  async handleRequest(request: Request): Promise<Response> {
    const startTime = performance.now();
    
    try {
      // Parse and validate request
      const apiRequest = await this.parseRequest(request);
      
      // Authenticate request
      const authResult = await this.authenticateRequest(apiRequest);
      if (!authResult.success) {
        return this.createErrorResponse(401, authResult.error || 'Authentication failed');
      }

      // Rate limiting
      const rateLimitResult = await this.checkRateLimit(apiRequest.tableId);
      if (!rateLimitResult.allowed) {
        return this.createErrorResponse(429, 'Rate limit exceeded');
      }

      // Route to appropriate handler
      const response = await this.routeRequest(apiRequest);
      
      // Add metadata
      const processingTime = performance.now() - startTime;
      response.metadata = {
        processingTime,
        version: RNGApiHandler.API_VERSION
      };

      return this.createSuccessResponse(response);

    } catch (error) {
      const processingTime = performance.now() - startTime;
      return this.createErrorResponse(500, error instanceof Error ? error.message : 'Internal server error', {
        processingTime,
        version: RNGApiHandler.API_VERSION
      });
    }
  }

  /**
   * Routes request to appropriate operation handler
   */
  private async routeRequest(apiRequest: RNGApiRequest): Promise<RNGApiResponse> {
    switch (apiRequest.operation) {
      case 'shuffle':
        return await this.handleShuffle(apiRequest);
      case 'random_int':
        return await this.handleRandomInt(apiRequest);
      case 'random_bytes':
        return await this.handleRandomBytes(apiRequest);
      case 'commit_deck':
        return await this.handleCommitDeck(apiRequest);
      case 'reveal_deck':
        return await this.handleRevealDeck(apiRequest);
      case 'status':
        return await this.handleStatus(apiRequest);
      default:
        throw new Error(`Unknown operation: ${apiRequest.operation}`);
    }
  }

  /**
   * Handles deck shuffling requests
   */
  private async handleShuffle(apiRequest: RNGApiRequest): Promise<RNGApiResponse> {
    const { deck } = apiRequest.data || {};
    
    if (!Array.isArray(deck) || deck.length === 0) {
      return { success: false, error: 'Invalid deck data' };
    }

    // Validate deck cards
    if (!this.validateDeckCards(deck)) {
      return { success: false, error: 'Invalid cards in deck' };
    }

    const rngStub = await this.getRNGStub(apiRequest.tableId);
    const rngRequest = {
      type: 'shuffle',
      tableId: apiRequest.tableId,
      gameId: apiRequest.gameId,
      data: { deck }
    };

    const response = await rngStub.fetch(new Request('https://dummy.com', {
      method: 'POST',
      body: JSON.stringify(rngRequest)
    }));

    const rngResult = await response.json() as any;
    
    if (!rngResult.success) {
      return { success: false, error: rngResult.error };
    }

    return {
      success: true,
      data: {
        shuffledDeck: rngResult.data.shuffledDeck,
        proof: rngResult.data.proof
      },
      audit: rngResult.audit && {
        operation: 'shuffle',
        timestamp: rngResult.audit.timestamp,
        entropyUsed: rngResult.audit.entropyUsed,
        operationId: this.generateOperationId()
      }
    };
  }

  /**
   * Handles random integer generation
   */
  private async handleRandomInt(apiRequest: RNGApiRequest): Promise<RNGApiResponse> {
    const { min, max } = apiRequest.data || {};
    
    if (typeof min !== 'number' || typeof max !== 'number' || min >= max) {
      return { success: false, error: 'Invalid min/max values' };
    }

    if (max - min > 1000000) {
      return { success: false, error: 'Range too large (max 1,000,000)' };
    }

    const rngStub = await this.getRNGStub(apiRequest.tableId);
    const rngRequest = {
      type: 'random_int',
      tableId: apiRequest.tableId,
      gameId: apiRequest.gameId,
      data: { min, max }
    };

    const response = await rngStub.fetch(new Request('https://dummy.com', {
      method: 'POST',
      body: JSON.stringify(rngRequest)
    }));

    const rngResult = await response.json() as any;
    
    if (!rngResult.success) {
      return { success: false, error: rngResult.error };
    }

    return {
      success: true,
      data: { value: rngResult.data.value },
      audit: rngResult.audit && {
        operation: 'random_int',
        timestamp: rngResult.audit.timestamp,
        entropyUsed: rngResult.audit.entropyUsed,
        operationId: this.generateOperationId()
      }
    };
  }

  /**
   * Handles random bytes generation
   */
  private async handleRandomBytes(apiRequest: RNGApiRequest): Promise<RNGApiResponse> {
    const { length } = apiRequest.data || {};
    
    if (typeof length !== 'number' || length <= 0 || length > 1024) {
      return { success: false, error: 'Invalid byte length (1-1024)' };
    }

    const rngStub = await this.getRNGStub(apiRequest.tableId);
    const rngRequest = {
      type: 'random_bytes',
      tableId: apiRequest.tableId,
      gameId: apiRequest.gameId,
      data: { length }
    };

    const response = await rngStub.fetch(new Request('https://dummy.com', {
      method: 'POST',
      body: JSON.stringify(rngRequest)
    }));

    const rngResult = await response.json() as any;
    
    if (!rngResult.success) {
      return { success: false, error: rngResult.error };
    }

    return {
      success: true,
      data: { bytes: rngResult.data.bytes },
      audit: rngResult.audit && {
        operation: 'random_bytes',
        timestamp: rngResult.audit.timestamp,
        entropyUsed: rngResult.audit.entropyUsed,
        operationId: this.generateOperationId()
      }
    };
  }

  /**
   * Handles deck commitment creation
   */
  private async handleCommitDeck(apiRequest: RNGApiRequest): Promise<RNGApiResponse> {
    const { deck } = apiRequest.data || {};
    
    if (!Array.isArray(deck) || !apiRequest.gameId) {
      return { success: false, error: 'Invalid deck or missing gameId' };
    }

    if (!this.validateDeckCards(deck)) {
      return { success: false, error: 'Invalid cards in deck' };
    }

    const rngStub = await this.getRNGStub(apiRequest.tableId);
    const rngRequest = {
      type: 'commit_deck',
      tableId: apiRequest.tableId,
      gameId: apiRequest.gameId,
      data: { deck, gameId: apiRequest.gameId }
    };

    const response = await rngStub.fetch(new Request('https://dummy.com', {
      method: 'POST',
      body: JSON.stringify(rngRequest)
    }));

    const rngResult = await response.json() as any;
    
    if (!rngResult.success) {
      return { success: false, error: rngResult.error };
    }

    return {
      success: true,
      data: { commitment: rngResult.data.commitment },
      audit: rngResult.audit && {
        operation: 'commit_deck',
        timestamp: rngResult.audit.timestamp,
        entropyUsed: rngResult.audit.entropyUsed,
        operationId: this.generateOperationId()
      }
    };
  }

  /**
   * Handles deck reveal and verification
   */
  private async handleRevealDeck(apiRequest: RNGApiRequest): Promise<RNGApiResponse> {
    const { deck } = apiRequest.data || {};
    
    if (!Array.isArray(deck) || !apiRequest.gameId) {
      return { success: false, error: 'Invalid deck or missing gameId' };
    }

    const rngStub = await this.getRNGStub(apiRequest.tableId);
    const rngRequest = {
      type: 'reveal_deck',
      tableId: apiRequest.tableId,
      gameId: apiRequest.gameId,
      data: { deck, gameId: apiRequest.gameId }
    };

    const response = await rngStub.fetch(new Request('https://dummy.com', {
      method: 'POST',
      body: JSON.stringify(rngRequest)
    }));

    const rngResult = await response.json() as any;
    
    if (!rngResult.success) {
      return { success: false, error: rngResult.error };
    }

    return {
      success: true,
      data: { reveal: rngResult.data.reveal },
      audit: rngResult.audit && {
        operation: 'reveal_deck',
        timestamp: rngResult.audit.timestamp,
        entropyUsed: rngResult.audit.entropyUsed,
        operationId: this.generateOperationId()
      }
    };
  }

  /**
   * Handles status requests
   */
  private async handleStatus(apiRequest: RNGApiRequest): Promise<RNGApiResponse> {
    const rngStub = await this.getRNGStub(apiRequest.tableId);
    const rngRequest = {
      type: 'get_status',
      tableId: apiRequest.tableId
    };

    const response = await rngStub.fetch(new Request('https://dummy.com', {
      method: 'POST',
      body: JSON.stringify(rngRequest)
    }));

    const rngResult = await response.json() as any;
    
    if (!rngResult.success) {
      return { success: false, error: rngResult.error };
    }

    const status = rngResult.data.status;
    const health = this.calculateHealth(status);
    const performance = this.calculatePerformance(status);

    const statusResponse: RNGStatusResponse = {
      tableId: status.tableId,
      isInitialized: status.isInitialized,
      operationCount: status.operationCount,
      totalEntropyUsed: status.totalEntropyUsed,
      lastOperation: status.lastOperation,
      health,
      performance
    };

    return {
      success: true,
      data: { status: statusResponse }
    };
  }

  /**
   * Parses and validates incoming request
   */
  private async parseRequest(request: Request): Promise<RNGApiRequest> {
    // Check content type
    if (!request.headers.get('content-type')?.includes('application/json')) {
      throw new Error('Invalid content type, expected application/json');
    }

    // Check request size
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > RNGApiHandler.MAX_REQUEST_SIZE) {
      throw new Error('Request too large');
    }

    // Parse JSON
    const body = await request.json() as any;
    
    // Validate required fields
    if (!body.tableId || !body.operation) {
      throw new Error('Missing required fields: tableId, operation');
    }

    return body as RNGApiRequest;
  }

  /**
   * Authenticates API request
   */
  private async authenticateRequest(apiRequest: RNGApiRequest): Promise<{
    success: boolean;
    error?: string;
  }> {
    // For demo/development, allow unauthenticated requests to specific tables
    if (apiRequest.tableId.startsWith('demo-')) {
      return { success: true };
    }

    // Check authentication data
    if (!apiRequest.authentication?.token || !apiRequest.authentication?.playerId) {
      return { success: false, error: 'Missing authentication credentials' };
    }

    // Validate token (integrate with existing auth system)
    try {
      // Simple token validation for now
      const token = apiRequest.authentication.token;
      if (token.startsWith('demo-token-') || token.length > 20) {
        return { success: true };
      }
      
      return { success: false, error: 'Invalid token' };
    } catch {
      return { success: false, error: 'Token validation failed' };
    }
  }

  /**
   * Checks rate limiting for table
   */
  private async checkRateLimit(tableId: string): Promise<{
    allowed: boolean;
    remainingRequests?: number;
  }> {
    // Simple in-memory rate limiting (should use Durable Objects for production)
    const now = Date.now();
    const windowStart = now - RNGApiHandler.RATE_LIMIT_WINDOW;

    // For now, allow all requests (implement proper rate limiting in production)
    return {
      allowed: true,
      remainingRequests: RNGApiHandler.RATE_LIMIT_MAX
    };
  }

  /**
   * Gets RNG Durable Object stub
   */
  private async getRNGStub(tableId: string): Promise<DurableObjectStub> {
    const id = this.env.SECURE_RNG_DO.idFromName(tableId);
    return this.env.SECURE_RNG_DO.get(id);
  }

  /**
   * Validates deck card format
   */
  private validateDeckCards(deck: any[]): boolean {
    return deck.every(card => 
      card && 
      typeof card.suit === 'string' && 
      typeof card.rank === 'string' &&
      ['hearts', 'diamonds', 'clubs', 'spades'].includes(card.suit) &&
      ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].includes(card.rank)
    );
  }

  /**
   * Calculates health status based on metrics
   */
  private calculateHealth(status: any): 'healthy' | 'degraded' | 'unhealthy' {
    const now = Date.now();
    const timeSinceLastOp = now - status.lastOperation;
    
    if (timeSinceLastOp > 3600000) { // 1 hour
      return 'degraded';
    }
    
    if (!status.isInitialized) {
      return 'unhealthy';
    }

    return 'healthy';
  }

  /**
   * Calculates performance metrics
   */
  private calculatePerformance(status: any): {
    averageResponseTime: number;
    successRate: number;
    operationsPerMinute: number;
  } {
    // Mock performance data (implement real metrics in production)
    return {
      averageResponseTime: 45, // ms
      successRate: 99.8, // %
      operationsPerMinute: Math.round(status.operationCount / 60) // rough estimate
    };
  }

  /**
   * Generates unique operation ID
   */
  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Creates success response
   */
  private createSuccessResponse(data: RNGApiResponse): Response {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  /**
   * Creates error response
   */
  private createErrorResponse(status: number, error: string, metadata?: any): Response {
    const response: RNGApiResponse = {
      success: false,
      error,
      metadata
    };

    return new Response(JSON.stringify(response), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }
}

// RNG API route configuration
export const RNG_API_ROUTES = {
  '/api/rng/shuffle': 'shuffle',
  '/api/rng/random-int': 'random_int',
  '/api/rng/random-bytes': 'random_bytes',
  '/api/rng/commit-deck': 'commit_deck',
  '/api/rng/reveal-deck': 'reveal_deck',
  '/api/rng/status': 'status'
} as const;

/**
 * Helper function to create RNG API router
 */
export function createRNGApiRouter(env: any) {
  const handler = new RNGApiHandler(env);
  
  return {
    async handleRequest(request: Request, operation: string): Promise<Response> {
      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        });
      }

      // Only allow POST requests
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }

      // Parse request body and add operation
      const body = await request.json() as any;
      body.operation = operation;
      
      // Create new request with modified body
      const modifiedRequest = new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(body)
      });

      return await handler.handleRequest(modifiedRequest);
    }
  };
}