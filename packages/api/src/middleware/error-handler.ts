/**
 * Error Handling Middleware
 * Wraps route handlers with error handling and formatting
 */

export type RouteHandler = (request: Request, ...args: any[]) => Promise<Response>

/**
 * Wraps a route handler with error handling
 * Catches errors and returns formatted error responses
 */
export function withErrorHandling(handler: RouteHandler): RouteHandler {
  return async (request: Request, ...args: any[]): Promise<Response> => {
    try {
      return await handler(request, ...args)
    } catch (error) {
      console.error('Route handler error:', error)

      const errorMessage = error instanceof Error ? error.message : 'Internal server error'
      const statusCode = getErrorStatusCode(error)

      return new Response(
        JSON.stringify({
          error: errorMessage,
          status: statusCode
        }),
        {
          status: statusCode,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    }
  }
}

/**
 * Gets appropriate HTTP status code for an error
 */
function getErrorStatusCode(error: unknown): number {
  if (error instanceof Error) {
    // Check for common error types
    if (error.message.includes('not found')) return 404
    if (error.message.includes('unauthorized') || error.message.includes('Missing or invalid Authorization')) return 401
    if (error.message.includes('forbidden')) return 403
    if (error.message.includes('validation') || error.message.includes('invalid')) return 400
  }

  return 500
}
