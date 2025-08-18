import { 
  BaseError, 
  ErrorCode, 
  ApiResponse,
  RandomUtils 
} from '@primo-poker/shared';
import { logger } from '@primo-poker/core';

/**
 * Profile-specific error codes
 */
export enum ProfileErrorCode {
  PROFILE_NOT_FOUND = 'PROFILE_NOT_FOUND',
  PROFILE_ALREADY_EXISTS = 'PROFILE_ALREADY_EXISTS', 
  PROFILE_UPDATE_FAILED = 'PROFILE_UPDATE_FAILED',
  PROFILE_DELETE_FAILED = 'PROFILE_DELETE_FAILED',
  PROFILE_INVALID_DATA = 'PROFILE_INVALID_DATA',
  AVATAR_UPLOAD_FAILED = 'AVATAR_UPLOAD_FAILED',
  AVATAR_INVALID_FORMAT = 'AVATAR_INVALID_FORMAT',
  AVATAR_TOO_LARGE = 'AVATAR_TOO_LARGE',
  STATISTICS_NOT_FOUND = 'STATISTICS_NOT_FOUND',
  ACHIEVEMENT_NOT_FOUND = 'ACHIEVEMENT_NOT_FOUND',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}

/**
 * Maps profile error codes to HTTP status codes
 */
const ERROR_STATUS_MAP: Record<ProfileErrorCode, number> = {
  [ProfileErrorCode.PROFILE_NOT_FOUND]: 404,
  [ProfileErrorCode.PROFILE_ALREADY_EXISTS]: 409,
  [ProfileErrorCode.PROFILE_UPDATE_FAILED]: 400,
  [ProfileErrorCode.PROFILE_DELETE_FAILED]: 400,
  [ProfileErrorCode.PROFILE_INVALID_DATA]: 400,
  [ProfileErrorCode.AVATAR_UPLOAD_FAILED]: 400,
  [ProfileErrorCode.AVATAR_INVALID_FORMAT]: 400,
  [ProfileErrorCode.AVATAR_TOO_LARGE]: 413,
  [ProfileErrorCode.STATISTICS_NOT_FOUND]: 404,
  [ProfileErrorCode.ACHIEVEMENT_NOT_FOUND]: 404,
  [ProfileErrorCode.SERVICE_UNAVAILABLE]: 503
};

/**
 * Enhanced error response with correlation tracking
 */
export interface ProfileErrorResponse extends ApiResponse {
  correlationId: string;
  error: {
    code: string;
    message: string;
    details?: any;
    userMessage?: string;
    retryable?: boolean;
  };
}

/**
 * Creates a standardized error response with correlation ID
 */
export function createErrorResponse(
  code: ProfileErrorCode | ErrorCode,
  message: string,
  correlationId?: string,
  details?: any,
  userMessage?: string
): Response {
  const status = (ERROR_STATUS_MAP as any)[code] || 500;
  const finalCorrelationId = correlationId || RandomUtils.generateUUID();
  
  // Log the error with correlation ID
  logger.error('Profile API Error', {
    correlationId: finalCorrelationId,
    code,
    message,
    status,
    details
  });

  const response: ProfileErrorResponse = {
    success: false,
    correlationId: finalCorrelationId,
    error: {
      code,
      message,
      details,
      userMessage: userMessage || getDefaultUserMessage(code),
      retryable: isRetryable(code)
    },
    timestamp: new Date().toISOString()
  };

  return new Response(JSON.stringify(response), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-ID': finalCorrelationId,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Correlation-ID'
    }
  });
}

/**
 * Creates a success response with correlation ID
 */
export function createSuccessResponse<T>(
  data: T,
  correlationId?: string,
  additionalHeaders?: Record<string, string>
): Response {
  const finalCorrelationId = correlationId || RandomUtils.generateUUID();
  
  const response: ApiResponse<T> = {
    success: true,
    data,
    timestamp: new Date().toISOString()
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-ID': finalCorrelationId,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Correlation-ID',
      ...additionalHeaders
    }
  });
}

/**
 * Gets user-friendly error message based on error code
 */
function getDefaultUserMessage(code: ProfileErrorCode | ErrorCode): string {
  switch (code) {
    case ProfileErrorCode.PROFILE_NOT_FOUND:
      return 'Profile not found. Please check the player ID and try again.';
    case ProfileErrorCode.PROFILE_ALREADY_EXISTS:
      return 'A profile already exists for this player.';
    case ProfileErrorCode.PROFILE_UPDATE_FAILED:
      return 'Failed to update profile. Please check your input and try again.';
    case ProfileErrorCode.PROFILE_DELETE_FAILED:
      return 'Failed to delete profile. Please try again later.';
    case ProfileErrorCode.PROFILE_INVALID_DATA:
      return 'Invalid profile data provided. Please check your input.';
    case ProfileErrorCode.AVATAR_UPLOAD_FAILED:
      return 'Failed to upload avatar. Please try again.';
    case ProfileErrorCode.AVATAR_INVALID_FORMAT:
      return 'Invalid image format. Please upload a JPEG, PNG, or WebP image.';
    case ProfileErrorCode.AVATAR_TOO_LARGE:
      return 'Image file is too large. Please upload an image smaller than 5MB.';
    case ProfileErrorCode.STATISTICS_NOT_FOUND:
      return 'No statistics found for this player.';
    case ProfileErrorCode.ACHIEVEMENT_NOT_FOUND:
      return 'Achievement not found.';
    case ProfileErrorCode.SERVICE_UNAVAILABLE:
      return 'Profile service is temporarily unavailable. Please try again later.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

/**
 * Determines if an error is retryable
 */
function isRetryable(code: ProfileErrorCode | ErrorCode): boolean {
  const retryableCodes = [
    ProfileErrorCode.SERVICE_UNAVAILABLE,
    ErrorCode.CONNECTION_FAILED,
    ErrorCode.CONNECTION_TIMEOUT,
    ErrorCode.INTERNAL_ERROR
  ];
  return retryableCodes.includes(code as any);
}

/**
 * Error handling middleware wrapper
 */
export function withErrorHandling<T extends any[], R>(
  handler: (...args: T) => Promise<R>,
  operation: string
) {
  return async (...args: T): Promise<R | Response> => {
    const correlationId = RandomUtils.generateUUID();
    logger.setContext({ correlationId, operation });

    try {
      const result = await handler(...args);
      logger.clearContext();
      return result;
    } catch (error: any) {
      logger.error(`Error in ${operation}`, error);
      
      // Handle known profile errors
      if (error instanceof BaseError) {
        return createErrorResponse(
          error.code as any,
          error.message,
          correlationId,
          error.details,
          error.userMessage
        ) as any;
      }

      // Handle validation errors
      if (error.name === 'ZodError') {
        return createErrorResponse(
          ProfileErrorCode.PROFILE_INVALID_DATA,
          'Validation failed',
          correlationId,
          error.errors,
          'Invalid data provided. Please check your input.'
        ) as any;
      }

      // Handle generic errors
      return createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || 'Internal server error',
        correlationId,
        undefined,
        'An unexpected error occurred. Please try again.'
      ) as any;
    } finally {
      logger.clearContext();
    }
  };
}

/**
 * Validates request headers and extracts correlation ID
 */
export function extractCorrelationId(request: Request): string {
  return request.headers.get('X-Correlation-ID') || RandomUtils.generateUUID();
}

/**
 * Profile-specific error classes
 */
export class ProfileNotFoundError extends BaseError {
  constructor(playerId: string, correlationId?: string) {
    super({
      code: ErrorCode.PROFILE_NOT_FOUND,
      message: `Profile not found for player: ${playerId}`,
      httpStatus: 404,
      correlationId,
      userMessage: 'Profile not found.'
    });
  }

  protected getDefaultUserMessage(): string {
    return 'The requested profile does not exist.';
  }
}

export class ProfileAlreadyExistsError extends BaseError {
  constructor(playerId: string, correlationId?: string) {
    super({
      code: ErrorCode.PROFILE_ALREADY_EXISTS,
      message: `Profile already exists for player: ${playerId}`,
      httpStatus: 409,
      correlationId,
      userMessage: 'Profile already exists.'
    });
  }

  protected getDefaultUserMessage(): string {
    return 'A profile already exists for this player.';
  }
}

export class AvatarUploadError extends BaseError {
  constructor(message: string, details?: any, correlationId?: string) {
    super({
      code: ErrorCode.PROFILE_AVATAR_ERROR,
      message,
      details,
      httpStatus: 400,
      correlationId,
      userMessage: 'Failed to upload avatar.'
    });
  }

  protected getDefaultUserMessage(): string {
    return 'Avatar upload failed. Please try again.';
  }
}