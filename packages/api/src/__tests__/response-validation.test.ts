import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { 
  ResponseValidator, 
  createResponseValidator, 
  validateApiResponse,
  ResponseValidationError 
} from '../middleware/response-validator';
import {
  createValidatedSuccessResponse,
  createValidatedErrorResponse,
  withResponseValidation,
  responseBuilder
} from '../utils/validated-response-helpers';
import { ResponseSchemaRegistry } from '../validation/response-schemas';

describe('Response Validation', () => {
  let validator: ResponseValidator;

  beforeEach(() => {
    validator = createResponseValidator({
      stripUnknown: true,
      logErrors: false
    });
  });

  describe('ResponseValidator', () => {
    it('should validate successful login response', () => {
      const loginResponse = {
        success: true,
        data: {
          user: {
            id: 'user-123',
            username: 'testuser',
            email: 'test@example.com',
            chipCount: 1000
          },
          tokens: {
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            expiresIn: 3600,
            tokenType: 'Bearer'
          },
          message: 'Login successful'
        },
        timestamp: new Date().toISOString()
      };

      const result = validator.validateResponse('POST /api/auth/login', loginResponse);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(loginResponse);
      }
    });

    it('should fail validation for invalid login response', () => {
      const invalidResponse = {
        success: true,
        data: {
          user: {
            id: 'user-123',
            username: 'testuser',
            // Missing email
            chipCount: -100 // Invalid negative chip count
          },
          tokens: {
            accessToken: 'access-token',
            // Missing refreshToken
            expiresIn: 3600,
            tokenType: 'JWT' // Invalid token type
          },
          message: 'Login successful'
        },
        timestamp: new Date().toISOString()
      };

      const result = validator.validateResponse('POST /api/auth/login', invalidResponse);
      expect(result.success).toBe(false);
    });

    it('should strip unknown properties when stripUnknown is true', () => {
      const responseWithExtra = {
        success: true,
        data: {
          user: {
            id: 'user-123',
            username: 'testuser',
            email: 'test@example.com',
            chipCount: 1000,
            extraField: 'should be removed' // Unknown field
          },
          tokens: {
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            expiresIn: 3600,
            tokenType: 'Bearer'
          },
          message: 'Login successful'
        },
        timestamp: new Date().toISOString(),
        anotherExtra: 'should also be removed' // Unknown field
      };

      const result = validator.validateResponse('POST /api/auth/login', responseWithExtra);
      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as any;
        expect(data.data.user.extraField).toBeUndefined();
        expect(data.anotherExtra).toBeUndefined();
      }
    });

    it('should validate health check response', () => {
      const healthResponse = {
        success: true,
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          environment: 'test',
          version: '1.0.0',
          services: {
            database: 'D1',
            session: 'KV',
            tables: 'Durable Objects',
            files: 'R2',
            websocket: 'Available'
          },
          health: {
            database: {
              status: 'healthy',
              responseTime: 15
            },
            durableObjects: {
              status: 'healthy',
              responseTime: 20
            },
            sessionStore: {
              status: 'healthy',
              responseTime: 10
            },
            overall: 'healthy'
          },
          rateLimiting: {
            enabled: true,
            requestsPerWindow: 100,
            windowSize: '1m'
          },
          websocket: {
            url: 'ws://localhost:8787',
            status: 'ready',
            upgrade: 'Supported',
            authentication: 'Required'
          }
        },
        timestamp: new Date().toISOString()
      };

      const result = validator.validateResponse('GET /api/health', healthResponse);
      expect(result.success).toBe(true);
    });

    it('should validate wallet transaction response', () => {
      const transactionResponse = {
        success: true,
        data: {
          transactions: [
            {
              id: 'tx-123',
              user_id: 'user-123',
              type: 'deposit',
              amount: 100,
              currency: 'USD',
              status: 'completed',
              reference_id: 'ref-123',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
          ],
          next_cursor: 'cursor-123'
        },
        timestamp: new Date().toISOString()
      };

      const result = validator.validateResponse('GET /api/wallet/transactions', transactionResponse);
      expect(result.success).toBe(true);
    });

    it('should handle error responses', () => {
      const errorResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data'
        },
        timestamp: new Date().toISOString()
      };

      // Error responses should pass basic API response validation
      expect(validateApiResponse(errorResponse)).toBe(true);
    });

    it('should throw when throwOnError is true', () => {
      const strictValidator = createResponseValidator({
        throwOnError: true,
        logErrors: false
      });

      const invalidResponse = {
        success: true,
        data: { invalid: 'data' },
        timestamp: new Date().toISOString()
      };

      expect(() => {
        strictValidator.validateResponse('POST /api/auth/login', invalidResponse);
      }).toThrow(ResponseValidationError);
    });

    it('should use custom error handler', () => {
      const customErrorResponse = new Response('Custom error', { status: 400 });
      const customValidator = createResponseValidator({
        logErrors: false,
        onError: () => customErrorResponse
      });

      const invalidResponse = {
        success: true,
        data: { invalid: 'data' },
        timestamp: new Date().toISOString()
      };

      const result = customValidator.validateResponse('POST /api/auth/login', invalidResponse);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(customErrorResponse);
      }
    });
  });

  describe('Response Helpers', () => {
    it('should create validated success response', () => {
      const data = {
        user: {
          id: 'user-123',
          username: 'testuser',
          email: 'test@example.com',
          chipCount: 1000
        },
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600,
          tokenType: 'Bearer' as const
        },
        message: 'Login successful'
      };

      const response = createValidatedSuccessResponse('POST /api/auth/login', data);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/json');
    });

    it('should create error response', () => {
      const response = createValidatedErrorResponse('Invalid credentials', 401, 'AUTH_ERROR');
      expect(response.status).toBe(401);
    });

    it('should skip validation when specified', () => {
      const invalidData = { invalid: 'data' };
      const response = createValidatedSuccessResponse(
        'POST /api/auth/login', 
        invalidData, 
        200, 
        { skipValidation: true }
      );
      expect(response.status).toBe(200);
    });

    it('should wrap handler with validation', async () => {
      const mockHandler = vi.fn(async () => {
        return new Response(JSON.stringify({
          success: true,
          data: {
            tableId: 'table-123',
            maxSeats: 9,
            seats: [],
            availableSeats: [1, 2, 3, 4, 5, 6, 7, 8, 9]
          },
          timestamp: new Date().toISOString()
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      });

      const wrappedHandler = withResponseValidation('GET /api/tables/:tableId/seats', mockHandler);
      const response = await wrappedHandler();
      
      expect(response.status).toBe(200);
      expect(mockHandler).toHaveBeenCalled();
    });

    it('should use response builder', () => {
      const builder = responseBuilder('GET /api/health');
      
      const successResponse = builder.success({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: 'test',
        services: {
          database: 'D1',
          session: 'KV',
          tables: 'Durable Objects',
          files: 'R2',
          websocket: 'Available'
        },
        health: {
          database: { status: 'healthy', responseTime: 10 },
          durableObjects: { status: 'healthy', responseTime: 20 },
          sessionStore: { status: 'healthy', responseTime: 15 },
          overall: 'healthy'
        },
        rateLimiting: {
          enabled: true,
          requestsPerWindow: 100,
          windowSize: '1m'
        },
        websocket: {
          url: 'ws://localhost:8787',
          status: 'ready',
          upgrade: 'Supported',
          authentication: 'Required'
        }
      });

      expect(successResponse.status).toBe(200);

      const errorResponse = builder.error('Service unavailable', 503);
      expect(errorResponse.status).toBe(503);
    });
  });

  describe('API Response Validation', () => {
    it('should validate base API response structure', () => {
      const validResponses = [
        {
          success: true,
          data: { any: 'data' },
          timestamp: new Date().toISOString()
        },
        {
          success: false,
          error: {
            code: 'ERROR_CODE',
            message: 'Error message'
          },
          timestamp: new Date().toISOString()
        }
      ];

      validResponses.forEach(response => {
        expect(validateApiResponse(response)).toBe(true);
      });
    });

    it('should reject invalid API response structure', () => {
      const invalidResponses = [
        { success: 'not-boolean' }, // Invalid success type
        { success: true }, // Missing timestamp
        { success: false }, // Missing error for failure
        { data: 'data' }, // Missing success field
        null,
        undefined,
        'string',
        123
      ];

      invalidResponses.forEach(response => {
        expect(validateApiResponse(response)).toBe(false);
      });
    });
  });

  describe('Response Schema Coverage', () => {
    it('should have schemas for all documented endpoints', () => {
      const endpoints = Object.keys(ResponseSchemaRegistry);
      
      // Auth endpoints
      expect(endpoints).toContain('POST /api/auth/register');
      expect(endpoints).toContain('POST /api/auth/login');
      expect(endpoints).toContain('POST /api/auth/refresh');
      expect(endpoints).toContain('POST /api/auth/logout');
      
      // Player endpoints
      expect(endpoints).toContain('GET /api/players/me');
      expect(endpoints).toContain('PUT /api/players/me');
      
      // Table endpoints
      expect(endpoints).toContain('GET /api/tables');
      expect(endpoints).toContain('POST /api/tables');
      expect(endpoints).toContain('GET /api/tables/:tableId');
      expect(endpoints).toContain('GET /api/tables/:tableId/seats');
      
      // Wallet endpoints
      expect(endpoints).toContain('GET /api/wallet');
      expect(endpoints).toContain('GET /api/wallet/balance');
      expect(endpoints).toContain('POST /api/wallet/deposit');
      
      // Health check
      expect(endpoints).toContain('GET /api/health');
    });
  });
});