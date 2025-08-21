import { IRequest } from 'itty-router';
import { z } from 'zod';
import { ApiResponse, WorkerEnvironment } from '@primo-poker/shared';

/**
 * Contract test utilities for verifying API endpoints adhere to their contracts
 */

// Mock environment for testing
export const createMockEnv = (): WorkerEnvironment => ({
  DB: {
    prepare: jest.fn().mockReturnValue({
      bind: jest.fn().mockReturnThis(),
      run: jest.fn().mockResolvedValue({ success: true }),
      all: jest.fn().mockResolvedValue({ results: [] }),
      first: jest.fn().mockResolvedValue(null),
    }),
    exec: jest.fn().mockResolvedValue({ success: true }),
    batch: jest.fn().mockResolvedValue([]),
    dump: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
  } as any,
  JWT_SECRET: 'test-secret',
  GAME_TABLES: {
    idFromName: jest.fn().mockReturnValue('test-id'),
    get: jest.fn().mockReturnValue({
      fetch: jest.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 })),
    }),
  } as any,
  R2_BUCKET: {} as any,
  WALLET_SERVICE: {} as any,
  TOURNAMENTS: {} as any,
  API_KEY: 'test-api-key',
});

// Mock request factory
export const createMockRequest = (options: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, string>;
  query?: Record<string, string>;
}): IRequest => {
  const url = new URL(options.url, 'http://localhost');
  
  // Add query params
  if (options.query) {
    Object.entries(options.query).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  const request = {
    method: options.method,
    url: url.toString(),
    headers: new Headers(options.headers || {}),
    params: options.params || {},
    query: options.query || {},
    json: () => Promise.resolve(options.body),
    text: () => Promise.resolve(JSON.stringify(options.body)),
    env: createMockEnv(),
  } as any;

  return request;
};

// Contract verification helpers
export interface ContractTestOptions<TRequest, TResponse> {
  requestSchema?: z.ZodSchema<TRequest>;
  responseSchema?: z.ZodSchema<TResponse>;
  statusCode?: number;
}

export async function verifyContract<TRequest = any, TResponse = any>(
  handler: (request: IRequest) => Promise<Response>,
  request: IRequest,
  options: ContractTestOptions<TRequest, TResponse> = {}
): Promise<{
  response: Response;
  body: ApiResponse<TResponse>;
  isValid: boolean;
  errors?: z.ZodError;
}> {
  // Verify request schema if provided
  if (options.requestSchema && request.method !== 'GET') {
    try {
      const requestBody = await request.json();
      options.requestSchema.parse(requestBody);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          response: new Response('Invalid request', { status: 400 }),
          body: { success: false, error: { code: '400', message: 'Invalid request' }, timestamp: new Date().toISOString() },
          isValid: false,
          errors: error,
        };
      }
    }
  }

  // Execute handler
  const response = await handler(request);
  const responseText = await response.text();
  let body: ApiResponse<TResponse>;

  try {
    body = JSON.parse(responseText);
  } catch (error) {
    return {
      response,
      body: { success: false, error: { code: '500', message: 'Invalid JSON response' }, timestamp: new Date().toISOString() },
      isValid: false,
    };
  }

  // Verify status code if specified
  if (options.statusCode && response.status !== options.statusCode) {
    return {
      response,
      body,
      isValid: false,
    };
  }

  // Verify response schema if provided
  if (options.responseSchema && body.success) {
    try {
      options.responseSchema.parse(body.data);
      return {
        response,
        body,
        isValid: true,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          response,
          body,
          isValid: false,
          errors: error,
        };
      }
    }
  }

  return {
    response,
    body,
    isValid: true,
  };
}

// Test data factories
export const createTestUser = (overrides: Partial<any> = {}) => ({
  id: 'test-user-id',
  username: 'testuser',
  email: 'test@example.com',
  chipCount: 1000,
  ...overrides,
});

export const createTestTable = (overrides: Partial<any> = {}) => ({
  id: 'test-table-id',
  name: 'Test Table',
  gameType: 'TEXAS_HOLDEM',
  smallBlind: 10,
  bigBlind: 20,
  maxPlayers: 9,
  minBuyIn: 100,
  maxBuyIn: 1000,
  ...overrides,
});

// Authentication helper
export const createAuthenticatedRequest = (options: Parameters<typeof createMockRequest>[0], userId = 'test-user-id') => {
  const token = 'Bearer test-token';
  return createMockRequest({
    ...options,
    headers: {
      ...options.headers,
      'Authorization': token,
    },
  });
};

// Response matchers
export const expectSuccessResponse = (body: ApiResponse) => {
  expect(body.success).toBe(true);
  expect(body.data).toBeDefined();
  expect(body.timestamp).toBeDefined();
  expect(body.error).toBeUndefined();
};

export const expectErrorResponse = (body: ApiResponse, statusCode: string, messagePattern?: RegExp) => {
  expect(body.success).toBe(false);
  expect(body.error).toBeDefined();
  expect(body.error?.code).toBe(statusCode);
  if (messagePattern) {
    expect(body.error?.message).toMatch(messagePattern);
  }
  expect(body.data).toBeUndefined();
};

// Schema test helpers
export const testSchemaValidation = async <T>(
  schema: z.ZodSchema<T>,
  validData: T,
  invalidCases: Array<{ data: any; expectedError: string }>
) => {
  // Test valid data
  expect(() => schema.parse(validData)).not.toThrow();

  // Test invalid cases
  for (const { data, expectedError } of invalidCases) {
    try {
      schema.parse(data);
      fail(`Expected validation to fail for ${JSON.stringify(data)}`);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map(e => e.message).join(', ');
        expect(errorMessages).toContain(expectedError);
      } else {
        throw error;
      }
    }
  }
};

// Batch test runner for multiple endpoints
export interface EndpointTest {
  name: string;
  request: IRequest;
  expectedStatus: number;
  validateResponse?: (body: ApiResponse) => void;
}

export const runEndpointTests = async (
  handler: (request: IRequest) => Promise<Response>,
  tests: EndpointTest[]
) => {
  for (const test of tests) {
    const response = await handler(test.request);
    const body = await response.json();

    expect(response.status).toBe(test.expectedStatus);
    
    if (test.validateResponse) {
      test.validateResponse(body);
    }
  }
};