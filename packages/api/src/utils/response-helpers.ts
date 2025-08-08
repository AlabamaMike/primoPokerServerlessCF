/**
 * Helper functions for creating consistent API responses
 */

interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
}

interface ApiErrorResponse {
  success: false;
  error: {
    code?: string;
    message: string;
  };
}

export function createSuccessResponse<T>(data: T, status = 200): Response {
  const body: ApiSuccessResponse<T> = {
    success: true,
    data
  };
  
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function createErrorResponse(
  message: string, 
  status = 400, 
  code?: string
): Response {
  const body: ApiErrorResponse = {
    success: false,
    error: {
      ...(code && { code }),
      message
    }
  };
  
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}