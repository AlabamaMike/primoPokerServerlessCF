import { ApiResponse, WorkerEnvironment } from '@primo-poker/shared';
import { HealthChecker } from './health';
import { responseBuilder } from '../utils/validated-response-helpers';
import { logger } from '@primo-poker/core';

/**
 * Example of a health check route handler using validated responses
 * This shows how to integrate the response validation system with existing handlers
 */
export class ValidatedHealthRoute {
  private healthChecker: HealthChecker;
  private response = responseBuilder('GET /api/health');

  constructor(private env: WorkerEnvironment) {
    this.healthChecker = new HealthChecker(env);
  }

  /**
   * Handle health check request with validated response
   */
  async handleHealthCheck(request: Request): Promise<Response> {
    try {
      const healthResult = await this.healthChecker.performHealthCheck();
      
      // Return appropriate status code based on health status
      const statusCode = healthResult.status === 'healthy' ? 200 : 
                        healthResult.status === 'degraded' ? 200 : 503;
      
      // Use the validated response builder
      return this.response.success(healthResult, statusCode, {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Health-Status': healthResult.status
      });
    } catch (error) {
      logger.error('Health check error', error as Error);
      
      // Use the validated error response
      return this.response.error(
        'Health check failed', 
        500, 
        'HEALTH_CHECK_ERROR',
        { reason: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }
}

/**
 * Example of how to migrate existing route handlers to use validation
 */
export function createValidatedHealthHandler(env: WorkerEnvironment) {
  const route = new ValidatedHealthRoute(env);
  return route.handleHealthCheck.bind(route);
}