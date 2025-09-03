/**
 * Request Size Limit Middleware
 * 
 * Prevents DoS attacks by limiting the size of incoming request payloads
 */

import { IRequest } from 'itty-router';
import { logger } from '@primo-poker/core';

export interface SizeLimitConfig {
  maxBodySize: number; // Maximum body size in bytes
  maxJsonSize?: number; // Maximum JSON payload size (defaults to maxBodySize)
  skipRoutes?: string[]; // Routes to skip size validation
  errorMessage?: string; // Custom error message
}

const DEFAULT_CONFIG: SizeLimitConfig = {
  maxBodySize: 1048576, // 1MB default
  errorMessage: 'Request payload too large'
};

export class RequestSizeLimitMiddleware {
  private config: Required<SizeLimitConfig>;

  constructor(config: Partial<SizeLimitConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      maxJsonSize: config.maxJsonSize || config.maxBodySize || DEFAULT_CONFIG.maxBodySize,
      skipRoutes: config.skipRoutes || []
    } as Required<SizeLimitConfig>;
  }

  /**
   * Middleware function for request size validation
   */
  middleware() {
    return async (request: IRequest, env: any, ctx: any) => {
      // Skip size check for certain routes
      const url = new URL(request.url);
      if (this.config.skipRoutes.some(route => url.pathname.includes(route))) {
        return;
      }

      // Skip for non-body methods
      if (['GET', 'HEAD', 'DELETE', 'OPTIONS'].includes(request.method)) {
        return;
      }

      // Check Content-Length header
      const contentLength = request.headers.get('content-length');
      if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (size > this.config.maxBodySize) {
          logger.warn('Request size limit exceeded', {
            size,
            limit: this.config.maxBodySize,
            path: url.pathname,
            method: request.method
          });

          return this.createErrorResponse();
        }
      }

      // For requests without Content-Length, we need to validate during parsing
      // Store the config on the request for use in the safe JSON parser
      (request as any).__sizeLimitConfig = this.config;
    };
  }

  /**
   * Safe JSON parsing with size limits
   * Replace request.json() calls with this method
   */
  static async safeJsonParse(request: IRequest): Promise<any> {
    const config = (request as any).__sizeLimitConfig as Required<SizeLimitConfig> || {
      maxJsonSize: DEFAULT_CONFIG.maxBodySize,
      errorMessage: DEFAULT_CONFIG.errorMessage
    };

    try {
      // Clone the request to avoid consuming the body
      const clonedRequest = request.clone();
      
      // Read the body as text first to check size
      const bodyText = await clonedRequest.text();
      
      // Check text size (UTF-8 bytes)
      const bodySize = new TextEncoder().encode(bodyText).length;
      
      if (bodySize > config.maxJsonSize) {
        logger.warn('JSON payload size exceeded', {
          size: bodySize,
          limit: config.maxJsonSize,
          path: new URL(request.url).pathname
        });

        throw new Error('Payload too large');
      }

      // Parse the JSON
      try {
        return JSON.parse(bodyText);
      } catch (error) {
        throw new Error('Invalid JSON');
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Payload too large') {
        throw error;
      }
      throw new Error('Invalid request body');
    }
  }

  /**
   * Create error response for oversized requests
   */
  private createErrorResponse(): Response {
    return new Response(JSON.stringify({
      success: false,
      error: {
        code: '413',
        message: this.config.errorMessage
      },
      timestamp: new Date().toISOString()
    }), {
      status: 413,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}

// Export singleton instance with default config
export const requestSizeLimiter = new RequestSizeLimitMiddleware({
  maxBodySize: 1048576, // 1MB
  maxJsonSize: 524288, // 512KB for JSON
  errorMessage: 'Request payload exceeds maximum allowed size'
});

// Export helper function for safe JSON parsing
export const safeJsonParse = RequestSizeLimitMiddleware.safeJsonParse;