import { IRequest, Router } from 'itty-router';
import { 
  ApiResponse,
  ValidationUtils,
  RandomUtils,
  WorkerEnvironment,
  ErrorCode
} from '@primo-poker/shared';
import { logger } from '@primo-poker/core';
import { AuthenticationManager, TokenPayload } from '@primo-poker/security';
import { 
  CreateProfileDataSchema, 
  UpdateProfileDataSchema,
  CreateProfileData,
  UpdateProfileData,
  ProfileCacheManager,
  fetchProfileWithCache,
  createErrorResponse,
  createSuccessResponse,
  extractCorrelationId,
  ProfileErrorCode,
  withErrorHandling,
  ProfileNotFoundError
} from '@primo-poker/profiles';

// Extended request interface with authentication
interface AuthenticatedRequest extends IRequest {
  user?: TokenPayload;
  env?: WorkerEnv;
}

type WorkerEnv = WorkerEnvironment & {
  PROFILE_DO: DurableObjectNamespace;
  AVATAR_BUCKET: R2Bucket;
  MAX_AVATAR_SIZE?: string;
  CDN_BASE_URL?: string;
};

export const profileRoutes = Router();

// Initialize cache manager
const cacheManager = new ProfileCacheManager({
  publicProfileTtl: 3600, // 1 hour for public profiles
  privateProfileTtl: 60,  // 1 minute for private profiles
  cacheControl: {
    public: true,
    private: false,
    sMaxAge: 3600,
    staleWhileRevalidate: 86400
  }
});

// Authentication middleware with correlation ID
async function authenticateRequest(request: AuthenticatedRequest): Promise<Response | void> {
  const correlationId = extractCorrelationId(request);
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader?.startsWith('Bearer ')) {
    return createErrorResponse(
      ErrorCode.AUTH_UNAUTHORIZED,
      'Missing or invalid authorization header',
      correlationId
    );
  }

  const token = authHeader.slice(7);
  
  if (request.env?.JWT_SECRET) {
    const authManager = new AuthenticationManager(request.env.JWT_SECRET);
    const result = await authManager.verifyAccessToken(token);
    
    if (!result.valid) {
      return createErrorResponse(
        ErrorCode.AUTH_INVALID_TOKEN,
        result.error || 'Invalid token',
        correlationId
      );
    }

    if (result.payload) {
      request.user = result.payload;
    }
  }
}

// Get current user's profile with caching
profileRoutes.get('/api/profiles/me', authenticateRequest, withErrorHandling(async (request: AuthenticatedRequest) => {
  const correlationId = extractCorrelationId(request);
  logger.setContext({ correlationId, operation: 'getMyProfile' });

  if (!request.user || !request.env?.PROFILE_DO) {
    return createErrorResponse(
      ProfileErrorCode.SERVICE_UNAVAILABLE,
      'Not authenticated or service unavailable',
      correlationId
    );
  }

  // Use caching for private profiles
  return fetchProfileWithCache(
    request,
    request.user.userId,
    false, // private profile
    async () => {
      const profileDO = request.env!.PROFILE_DO.idFromName('profiles');
      const profileObj = request.env!.PROFILE_DO.get(profileDO);

      const response = await profileObj.fetch(
        `http://internal/profile/${request.user!.userId}`,
        { method: 'GET' }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Profile not found');
      }

      return await response.json();
    },
    cacheManager
  );
}, 'getMyProfile'));

// Create or update current user's profile
profileRoutes.put('/api/profiles/me', authenticateRequest, async (request: AuthenticatedRequest) => {
  const correlationId = request.headers.get('X-Correlation-ID') || RandomUtils.generateUUID();
  logger.setContext({ correlationId, operation: 'updateMyProfile' });

  try {
    if (!request.user || !request.env?.PROFILE_DO) {
      return errorResponse('Not authenticated or service unavailable', 401);
    }

    const body = await request.json();
    
    // Check if profile exists
    const profileDO = request.env.PROFILE_DO.idFromName('profiles');
    const profileObj = request.env.PROFILE_DO.get(profileDO);

    const checkResponse = await profileObj.fetch(
      `http://internal/profile/${request.user.userId}`,
      { method: 'GET' }
    );

    let response: Response;
    
    if (checkResponse.status === 404) {
      // Create new profile
      const createData: CreateProfileData = {
        playerId: request.user.userId,
        displayName: body.displayName || request.user.username,
        bio: body.bio || '',
        avatarUrl: body.avatarUrl,
        countryCode: body.countryCode,
        isPublic: body.isPublic ?? true
      };

      const validationResult = CreateProfileDataSchema.safeParse(createData);
      if (!validationResult.success) {
        return errorResponse('Invalid profile data', 400);
      }

      response = await profileObj.fetch(
        `http://internal/profile`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createData)
        }
      );
    } else {
      // Update existing profile
      const updateData: UpdateProfileData = {
        displayName: body.displayName,
        bio: body.bio,
        avatarUrl: body.avatarUrl,
        countryCode: body.countryCode,
        isPublic: body.isPublic
      };

      const validationResult = UpdateProfileDataSchema.safeParse(updateData);
      if (!validationResult.success) {
        return errorResponse('Invalid profile data', 400);
      }

      response = await profileObj.fetch(
        `http://internal/profile/${request.user.userId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        }
      );
    }

    if (!response.ok) {
      const error = await response.text();
      return errorResponse(error || 'Failed to update profile', response.status);
    }

    const profile = await response.json();
    return successResponse(profile);
  } catch (error: any) {
    logger.error('Update profile error', error);
    return createErrorResponse(
      ProfileErrorCode.PROFILE_UPDATE_FAILED,
      error.message || 'Failed to update profile',
      correlationId,
      error
    );
  } finally {
    logger.clearContext();
  }
});

// Get public profile by player ID with caching
profileRoutes.get('/api/profiles/:playerId', withErrorHandling(async (request: AuthenticatedRequest) => {
  const correlationId = extractCorrelationId(request);
  logger.setContext({ correlationId, operation: 'getPublicProfile' });

  const playerId = request.params?.playerId;
  if (!playerId || !request.env?.PROFILE_DO) {
    return createErrorResponse(
      ProfileErrorCode.PROFILE_INVALID_DATA,
      'Invalid request',
      correlationId
    );
  }

  // Use caching for public profiles
  return fetchProfileWithCache(
    request,
    playerId,
    true, // public profile
    async () => {
      const profileDO = request.env!.PROFILE_DO.idFromName('profiles');
      const profileObj = request.env!.PROFILE_DO.get(profileDO);

      const response = await profileObj.fetch(
        `http://internal/profile/${playerId}?public=true`,
        { method: 'GET' }
      );

      if (!response.ok) {
        const error = await response.text();
        if (response.status === 404) {
          throw new ProfileNotFoundError(playerId, correlationId);
        }
        throw new Error(error || 'Profile not found');
      }

      return await response.json();
    },
    cacheManager
  );
}, 'getPublicProfile'));

// Upload avatar with enhanced validation
profileRoutes.post('/api/profiles/me/avatar', authenticateRequest, withErrorHandling(async (request: AuthenticatedRequest) => {
  const correlationId = extractCorrelationId(request);
  logger.setContext({ correlationId, operation: 'uploadAvatar' });

  if (!request.user || !request.env?.PROFILE_DO) {
    return createErrorResponse(
      ProfileErrorCode.SERVICE_UNAVAILABLE,
      'Not authenticated or service unavailable',
      correlationId
    );
  }

  const contentType = request.headers.get('Content-Type');
  if (!contentType?.includes('multipart/form-data')) {
    return createErrorResponse(
      ProfileErrorCode.AVATAR_INVALID_FORMAT,
      'Invalid content type. Expected multipart/form-data',
      correlationId
    );
  }

  const formData = await request.formData();
  const file = formData.get('avatar') as File;

  if (!file) {
    return createErrorResponse(
      ProfileErrorCode.AVATAR_UPLOAD_FAILED,
      'No avatar file provided',
      correlationId
    );
  }

  // Check file size
  const maxSize = parseInt(request.env.MAX_AVATAR_SIZE || '5242880'); // 5MB default
  if (file.size > maxSize) {
    return createErrorResponse(
      ProfileErrorCode.AVATAR_TOO_LARGE,
      `File size exceeds maximum allowed size of ${maxSize} bytes`,
      correlationId,
      { size: file.size, maxSize }
    );
  }

  try {
    // Forward to profile DO
    const profileDO = request.env.PROFILE_DO.idFromName('profiles');
    const profileObj = request.env.PROFILE_DO.get(profileDO);

    const uploadFormData = new FormData();
    uploadFormData.append('avatar', file);

    const response = await profileObj.fetch(
      `http://internal/profile/${request.user.userId}/avatar`,
      {
        method: 'POST',
        body: uploadFormData
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return errorResponse(error || 'Failed to upload avatar', response.status);
    }

    const result = await response.json();
    
    // Invalidate profile cache after avatar update
    await cacheManager.invalidateProfile(request.user.userId);
    
    return createSuccessResponse(result, correlationId);
  } catch (error: any) {
    logger.error('Upload avatar error', error);
    return createErrorResponse(
      ProfileErrorCode.AVATAR_UPLOAD_FAILED,
      error.message || 'Failed to upload avatar',
      correlationId,
      error
    );
  } finally {
    logger.clearContext();
  }
}, 'uploadAvatar'));

// Delete current user's profile
profileRoutes.delete('/api/profiles/me', authenticateRequest, async (request: AuthenticatedRequest) => {
  const correlationId = request.headers.get('X-Correlation-ID') || RandomUtils.generateUUID();
  logger.setContext({ correlationId, operation: 'deleteMyProfile' });

  try {
    if (!request.user || !request.env?.PROFILE_DO) {
      return errorResponse('Not authenticated or service unavailable', 401);
    }

    const profileDO = request.env.PROFILE_DO.idFromName('profiles');
    const profileObj = request.env.PROFILE_DO.get(profileDO);

    const response = await profileObj.fetch(
      `http://internal/profile/${request.user.userId}`,
      { method: 'DELETE' }
    );

    if (!response.ok && response.status !== 204) {
      const error = await response.text();
      return errorResponse(error || 'Failed to delete profile', response.status);
    }

    return new Response(null, { 
      status: 204,
      headers: getCorsHeaders()
    });
  } catch (error) {
    logger.error('Delete profile error', error);
    return errorResponse('Failed to delete profile', 500);
  } finally {
    logger.clearContext();
  }
});

// List all public profiles (with pagination)
profileRoutes.get('/api/profiles', async (request: AuthenticatedRequest) => {
  const correlationId = request.headers.get('X-Correlation-ID') || RandomUtils.generateUUID();
  logger.setContext({ correlationId, operation: 'listProfiles' });

  try {
    if (!request.env?.PROFILE_DO) {
      return errorResponse('Service unavailable', 503);
    }

    // TODO: Implement pagination and filtering
    const profileDO = request.env.PROFILE_DO.idFromName('profiles');
    const profileObj = request.env.PROFILE_DO.get(profileDO);

    const response = await profileObj.fetch(
      `http://internal/profiles`,
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.text();
      return errorResponse(error || 'Failed to fetch profiles', response.status);
    }

    const profiles = await response.json();
    
    // Filter to only public profiles
    const publicProfiles = profiles.filter((p: any) => p.isPublic);
    
    return successResponse(publicProfiles);
  } catch (error) {
    logger.error('List profiles error', error);
    return errorResponse('Failed to fetch profiles', 500);
  } finally {
    logger.clearContext();
  }
});

// Get player statistics with caching
profileRoutes.get('/api/profiles/:playerId/statistics', withErrorHandling(async (request: AuthenticatedRequest) => {
  const correlationId = extractCorrelationId(request);
  logger.setContext({ correlationId, operation: 'getPlayerStatistics' });

  const playerId = request.params?.playerId;
  if (!playerId || !request.env?.PROFILE_DO) {
    return createErrorResponse(
      ProfileErrorCode.PROFILE_INVALID_DATA,
      'Invalid request',
      correlationId
    );
  }

  const profileDO = request.env.PROFILE_DO.idFromName('profiles');
  const profileObj = request.env.PROFILE_DO.get(profileDO);

  const response = await profileObj.fetch(
    `http://internal/statistics/player/${playerId}`,
    { method: 'GET' }
  );

  if (!response.ok) {
    const error = await response.text();
    return createErrorResponse(
      ProfileErrorCode.STATISTICS_NOT_FOUND,
      error || 'Statistics not found',
      correlationId
    );
  }

  const stats = await response.json();
  return createSuccessResponse(stats, correlationId, cacheManager.getCacheHeaders(true));
}, 'getPlayerStatistics'));

// Get player session history
profileRoutes.get('/api/profiles/:playerId/sessions', async (request: AuthenticatedRequest) => {
  const correlationId = request.headers.get('X-Correlation-ID') || RandomUtils.generateUUID();
  logger.setContext({ correlationId, operation: 'getSessionHistory' });

  try {
    const playerId = request.params?.playerId;
    if (!playerId || !request.env?.PROFILE_DO) {
      return errorResponse('Invalid request', 400);
    }

    const url = new URL(request.url);
    const limit = url.searchParams.get('limit') || '20';

    const profileDO = request.env.PROFILE_DO.idFromName('profiles');
    const profileObj = request.env.PROFILE_DO.get(profileDO);

    const response = await profileObj.fetch(
      `http://internal/statistics/sessions/${playerId}?limit=${limit}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.text();
      return errorResponse(error || 'Sessions not found', response.status);
    }

    const sessions = await response.json();
    return successResponse(sessions);
  } catch (error) {
    logger.error('Get sessions error', error);
    return errorResponse('Failed to fetch sessions', 500);
  } finally {
    logger.clearContext();
  }
});

// Get player achievements
profileRoutes.get('/api/profiles/:playerId/achievements', async (request: AuthenticatedRequest) => {
  const correlationId = request.headers.get('X-Correlation-ID') || RandomUtils.generateUUID();
  logger.setContext({ correlationId, operation: 'getPlayerAchievements' });

  try {
    const playerId = request.params?.playerId;
    if (!playerId || !request.env?.PROFILE_DO) {
      return errorResponse('Invalid request', 400);
    }

    const profileDO = request.env.PROFILE_DO.idFromName('profiles');
    const profileObj = request.env.PROFILE_DO.get(profileDO);

    const response = await profileObj.fetch(
      `http://internal/achievements/player/${playerId}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.text();
      return errorResponse(error || 'Achievements not found', response.status);
    }

    const achievements = await response.json();
    return successResponse(achievements);
  } catch (error) {
    logger.error('Get achievements error', error);
    return errorResponse('Failed to fetch achievements', 500);
  } finally {
    logger.clearContext();
  }
});

// Get achievement progress
profileRoutes.get('/api/profiles/me/achievement-progress', authenticateRequest, async (request: AuthenticatedRequest) => {
  const correlationId = request.headers.get('X-Correlation-ID') || RandomUtils.generateUUID();
  logger.setContext({ correlationId, operation: 'getMyAchievementProgress' });

  try {
    if (!request.user || !request.env?.PROFILE_DO) {
      return errorResponse('Not authenticated or service unavailable', 401);
    }

    const profileDO = request.env.PROFILE_DO.idFromName('profiles');
    const profileObj = request.env.PROFILE_DO.get(profileDO);

    const response = await profileObj.fetch(
      `http://internal/achievements/progress/${request.user.userId}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.text();
      return errorResponse(error || 'Progress not found', response.status);
    }

    const progress = await response.json();
    return successResponse(progress);
  } catch (error) {
    logger.error('Get achievement progress error', error);
    return errorResponse('Failed to fetch progress', 500);
  } finally {
    logger.clearContext();
  }
});

// Get global achievement statistics
profileRoutes.get('/api/achievements/stats', async (request: AuthenticatedRequest) => {
  const correlationId = request.headers.get('X-Correlation-ID') || RandomUtils.generateUUID();
  logger.setContext({ correlationId, operation: 'getAchievementStats' });

  try {
    if (!request.env?.PROFILE_DO) {
      return errorResponse('Service unavailable', 503);
    }

    const profileDO = request.env.PROFILE_DO.idFromName('profiles');
    const profileObj = request.env.PROFILE_DO.get(profileDO);

    const response = await profileObj.fetch(
      `http://internal/achievements/stats`,
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.text();
      return errorResponse(error || 'Failed to fetch stats', response.status);
    }

    const stats = await response.json();
    return successResponse(stats);
  } catch (error) {
    logger.error('Get achievement stats error', error);
    return errorResponse('Failed to fetch stats', 500);
  } finally {
    logger.clearContext();
  }
});

// Note: Helper functions removed in favor of centralized error handling in profile-errors.ts