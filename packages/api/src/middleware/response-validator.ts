import { z } from 'zod';
import { logger } from '@primo-poker/core';
import { 
  ResponseSchemaRegistry, 
  ResponseSchemaKey,
  ApiResponseSchema,
  ErrorResponseSchema
} from '../validation/response-schemas';

export interface ValidationOptions {
  /** Whether to strip unknown properties from responses */
  stripUnknown?: boolean;
  /** Whether to log validation errors */
  logErrors?: boolean;
  /** Whether to throw on validation errors or return error response */
  throwOnError?: boolean;
  /** Custom error handler */
  onError?: (error: z.ZodError, endpoint: string) => Response;
}

/**
 * Runtime validation middleware for API responses
 * Validates response data against predefined schemas
 */
export class ResponseValidator {
  private options: Required<ValidationOptions>;

  constructor(options: ValidationOptions = {}) {
    this.options = {
      stripUnknown: true,
      logErrors: true,
      throwOnError: false,
      onError: this.defaultErrorHandler.bind(this),
      ...options
    };
  }

  /**
   * Validate response data against schema for given endpoint
   */
  public validateResponse(
    endpoint: ResponseSchemaKey,
    data: unknown
  ): { success: true; data: unknown } | { success: false; error: Response } {
    const schema = ResponseSchemaRegistry[endpoint];
    
    if (!schema) {
      if (this.options.logErrors) {
        logger.warn('No response schema found for endpoint', { endpoint });
      }
      return { success: true, data };
    }

    try {
      const validatedData = this.options.stripUnknown
        ? schema.parse(data)
        : schema.passthrough().parse(data);
      
      return { success: true, data: validatedData };
    } catch (error) {
      if (error instanceof z.ZodError) {
        if (this.options.logErrors) {
          logger.error('Response validation failed', {
            endpoint,
            errors: error.errors,
            data: JSON.stringify(data)
          });
        }

        const errorResponse = this.options.onError(error, endpoint);
        
        if (this.options.throwOnError) {
          throw new ResponseValidationError(endpoint, error);
        }
        
        return { success: false, error: errorResponse };
      }
      
      throw error;
    }
  }

  /**
   * Create a validated response
   */
  public createValidatedResponse<T>(
    endpoint: ResponseSchemaKey,
    data: T,
    status = 200,
    headers: HeadersInit = {}
  ): Response {
    const validation = this.validateResponse(endpoint, data);
    
    if (!validation.success) {
      return validation.error;
    }

    return new Response(JSON.stringify(validation.data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    });
  }

  /**
   * Wrap an async handler with response validation
   */
  public wrapHandler<T extends (...args: any[]) => Promise<Response>>(
    endpoint: ResponseSchemaKey,
    handler: T
  ): T {
    return (async (...args: Parameters<T>) => {
      try {
        const response = await handler(...args);
        
        // If it's not a successful response, return as-is
        if (!response.ok) {
          return response;
        }

        // Parse and validate the response body
        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('application/json')) {
          return response;
        }

        const data = await response.json();
        const validation = this.validateResponse(endpoint, data);
        
        if (!validation.success) {
          return validation.error;
        }

        // Return new response with validated data
        return new Response(JSON.stringify(validation.data), {
          status: response.status,
          headers: response.headers
        });
      } catch (error) {
        if (this.options.logErrors) {
          logger.error('Handler error in response validator', error as Error, {
            endpoint
          });
        }
        throw error;
      }
    }) as T;
  }

  /**
   * Default error handler
   */
  private defaultErrorHandler(error: z.ZodError, endpoint: string): Response {
    const errorResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Response validation failed',
        details: {
          endpoint,
          errors: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message,
            code: e.code
          }))
        }
      },
      timestamp: new Date().toISOString()
    };

    // Validate error response
    try {
      const validatedError = ErrorResponseSchema.parse(errorResponse);
      return new Response(JSON.stringify(validatedError), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch {
      // If error response validation fails, return basic error
      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
}

/**
 * Custom error class for response validation failures
 */
export class ResponseValidationError extends Error {
  constructor(
    public endpoint: string,
    public zodError: z.ZodError
  ) {
    super(`Response validation failed for ${endpoint}`);
    this.name = 'ResponseValidationError';
  }
}

/**
 * Factory function to create response validator middleware
 */
export function createResponseValidator(options?: ValidationOptions): ResponseValidator {
  return new ResponseValidator(options);
}

/**
 * Helper to validate any response against base API response schema
 */
export function validateApiResponse(data: unknown): boolean {
  try {
    ApiResponseSchema.parse(data);
    return true;
  } catch {
    return false;
  }
}