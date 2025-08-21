import { IRequest } from 'itty-router';
import { z } from 'zod';
import { ApiResponse } from '@primo-poker/shared';
import { logger } from '@primo-poker/core';

/**
 * Middleware for validating API contracts at runtime
 */

export interface ContractDefinition {
  request?: z.ZodSchema<any>;
  response?: z.ZodSchema<any>;
  queryParams?: z.ZodSchema<any>;
}

export interface ContractRegistry {
  [endpoint: string]: ContractDefinition;
}

export class ContractValidator {
  private contracts: ContractRegistry = {};
  private options: {
    enableRequestValidation: boolean;
    enableResponseValidation: boolean;
    logValidationErrors: boolean;
    throwOnValidationError: boolean;
  };

  constructor(options: Partial<ContractValidator['options']> = {}) {
    this.options = {
      enableRequestValidation: true,
      enableResponseValidation: true,
      logValidationErrors: true,
      throwOnValidationError: false, // In production, log but don't throw
      ...options,
    };
  }

  /**
   * Register a contract for an endpoint
   */
  register(method: string, path: string, contract: ContractDefinition): void {
    const endpoint = `${method.toUpperCase()} ${path}`;
    this.contracts[endpoint] = contract;
  }

  /**
   * Middleware to validate requests
   */
  validateRequest = async (request: IRequest): Promise<Response | void> => {
    if (!this.options.enableRequestValidation) {
      return;
    }

    const endpoint = this.getEndpointKey(request);
    const contract = this.contracts[endpoint];

    if (!contract) {
      return; // No contract defined for this endpoint
    }

    try {
      // Validate query parameters
      if (contract.queryParams) {
        const url = new URL(request.url);
        const queryParams = Object.fromEntries(url.searchParams.entries());
        
        const result = contract.queryParams.safeParse(queryParams);
        if (!result.success) {
          return this.handleValidationError(request, 'query', result.error);
        }
      }

      // Validate request body
      if (contract.request && request.method !== 'GET') {
        const body = await request.json();
        
        const result = contract.request.safeParse(body);
        if (!result.success) {
          return this.handleValidationError(request, 'request', result.error);
        }

        // Restore body for downstream handlers
        (request as any).json = () => Promise.resolve(body);
      }
    } catch (error) {
      logger.error('Contract validation error', error, { endpoint });
      if (this.options.throwOnValidationError) {
        throw error;
      }
    }
  };

  /**
   * Wrap response to validate output
   */
  wrapResponse = (handler: (request: IRequest) => Promise<Response>) => {
    return async (request: IRequest): Promise<Response> => {
      const response = await handler(request);

      if (!this.options.enableResponseValidation) {
        return response;
      }

      const endpoint = this.getEndpointKey(request);
      const contract = this.contracts[endpoint];

      if (!contract?.response) {
        return response; // No response contract defined
      }

      try {
        const responseClone = response.clone();
        const body = await responseClone.json();

        // Only validate successful responses with data
        if (body.success && body.data) {
          const result = contract.response.safeParse(body.data);
          
          if (!result.success) {
            this.handleValidationError(request, 'response', result.error);
          }
        }
      } catch (error) {
        logger.error('Response validation error', error, { endpoint });
      }

      return response;
    };
  };

  /**
   * Get endpoint key from request
   */
  private getEndpointKey(request: IRequest): string {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/[a-f0-9-]+(?=\/|$)/gi, '/:id'); // Replace UUIDs with :id
    return `${request.method.toUpperCase()} ${path}`;
  }

  /**
   * Handle validation errors
   */
  private handleValidationError(
    request: IRequest,
    type: 'request' | 'response' | 'query',
    error: z.ZodError
  ): Response {
    const endpoint = this.getEndpointKey(request);
    const errors = error.errors.map(e => ({
      path: e.path.join('.'),
      message: e.message,
    }));

    if (this.options.logValidationErrors) {
      logger.error(`Contract validation failed for ${type}`, {
        endpoint,
        errors,
        type,
      });
    }

    if (this.options.throwOnValidationError || type !== 'response') {
      // For request/query validation, always return error response
      const response: ApiResponse = {
        success: false,
        error: {
          code: '400',
          message: `Validation error: ${errors.map(e => `${e.path}: ${e.message}`).join(', ')}`,
        },
        timestamp: new Date().toISOString(),
      };

      return new Response(JSON.stringify(response), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // For response validation in production, we don't want to break the API
    // Just log the error and let the response through
    return new Response('Internal Server Error', { status: 500 });
  }
}

// Create a default instance
export const contractValidator = new ContractValidator();

// Helper function to register common contracts
export function registerStandardContracts(validator: ContractValidator): void {
  // Authentication contracts
  validator.register('POST', '/api/auth/register', {
    request: z.object({
      username: z.string().min(3).max(20),
      email: z.string().email(),
      password: z.string().min(6),
    }),
  });

  validator.register('POST', '/api/auth/login', {
    request: z.object({
      username: z.string().min(1),
      password: z.string().min(1),
    }),
  });

  validator.register('POST', '/api/auth/refresh', {
    request: z.object({
      refreshToken: z.string().min(1),
    }),
  });

  // Player contracts
  validator.register('PUT', '/api/players/me', {
    request: z.object({
      username: z.string().min(3).max(20).optional(),
      email: z.string().email().optional(),
    }),
  });

  // Table contracts
  validator.register('POST', '/api/tables', {
    request: z.object({
      name: z.string().min(1).max(50),
      gameType: z.enum(['TEXAS_HOLDEM', 'OMAHA', 'SEVEN_CARD_STUD']),
      smallBlind: z.number().positive(),
      bigBlind: z.number().positive(),
      minBuyIn: z.number().positive(),
      maxBuyIn: z.number().positive(),
      maxPlayers: z.number().int().min(2).max(9),
      timeToAct: z.number().int().min(5000).max(60000).optional(),
      timeBankMax: z.number().int().min(0).max(300000).optional(),
      password: z.string().optional(),
    }),
  });

  validator.register('POST', '/api/tables/:id/join', {
    request: z.object({
      buyIn: z.number().positive(),
      password: z.string().optional(),
    }),
  });

  validator.register('POST', '/api/tables/:id/action', {
    request: z.object({
      action: z.enum(['FOLD', 'CHECK', 'CALL', 'BET', 'RAISE', 'ALL_IN']),
      amount: z.number().nonnegative().optional(),
    }),
  });

  // Wallet contracts
  validator.register('POST', '/api/wallet/deposit', {
    request: z.object({
      amount: z.number().positive(),
      method: z.enum(['CREDIT_CARD', 'BANK_TRANSFER', 'CRYPTO', 'OTHER']),
    }),
  });

  validator.register('POST', '/api/wallet/withdraw', {
    request: z.object({
      amount: z.number().positive(),
      method: z.enum(['BANK_TRANSFER', 'CRYPTO', 'CHECK']),
    }),
  });

  validator.register('POST', '/api/wallet/transfer', {
    request: z.object({
      to_table_id: z.string().uuid(),
      amount: z.number().positive(),
    }),
  });

  validator.register('GET', '/api/wallet/transactions', {
    queryParams: z.object({
      limit: z.string().regex(/^\d+$/).transform(Number).optional(),
      cursor: z.string().optional(),
    }),
  });
}