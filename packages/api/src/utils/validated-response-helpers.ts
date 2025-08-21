import { ResponseSchemaKey } from '../validation/response-schemas';
import { createResponseValidator, ResponseValidator } from '../middleware/response-validator';

// Create a singleton response validator
const validator = createResponseValidator({
  stripUnknown: true,
  logErrors: true,
  throwOnError: false
});

/**
 * Helper functions for creating validated API responses
 */

interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  timestamp?: string;
}

interface ApiErrorResponse {
  success: false;
  error: {
    code?: string;
    message: string;
    details?: unknown;
  };
  timestamp?: string;
}

interface ValidatedResponseOptions {
  headers?: HeadersInit;
  skipValidation?: boolean;
}

/**
 * Create a validated success response
 */
export function createValidatedSuccessResponse<T>(
  endpoint: ResponseSchemaKey,
  data: T,
  status = 200,
  options: ValidatedResponseOptions = {}
): Response {
  const body: ApiSuccessResponse<T> = {
    success: true,
    data,
    timestamp: new Date().toISOString()
  };

  if (options.skipValidation) {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
  }
  
  return validator.createValidatedResponse(endpoint, body, status, options.headers);
}

/**
 * Create a validated error response
 */
export function createValidatedErrorResponse(
  message: string,
  status = 400,
  code?: string,
  details?: unknown
): Response {
  const body: ApiErrorResponse = {
    success: false,
    error: {
      ...(code && { code }),
      message,
      ...(details && { details })
    },
    timestamp: new Date().toISOString()
  };
  
  // Error responses use a consistent schema, no endpoint-specific validation needed
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Wrap a route handler with automatic response validation
 */
export function withResponseValidation<T extends (...args: any[]) => Promise<Response>>(
  endpoint: ResponseSchemaKey,
  handler: T
): T {
  return validator.wrapHandler(endpoint, handler);
}

/**
 * Get the response validator instance
 */
export function getResponseValidator(): ResponseValidator {
  return validator;
}

/**
 * Type-safe response builder
 */
export class ValidatedResponseBuilder<TEndpoint extends ResponseSchemaKey> {
  constructor(private endpoint: TEndpoint) {}

  success<T>(data: T, status = 200, headers?: HeadersInit): Response {
    return createValidatedSuccessResponse(this.endpoint, data, status, { headers });
  }

  error(message: string, status = 400, code?: string, details?: unknown): Response {
    return createValidatedErrorResponse(message, status, code, details);
  }
}

/**
 * Create a type-safe response builder for an endpoint
 */
export function responseBuilder<TEndpoint extends ResponseSchemaKey>(
  endpoint: TEndpoint
): ValidatedResponseBuilder<TEndpoint> {
  return new ValidatedResponseBuilder(endpoint);
}