import { IRequest, Router } from 'itty-router';
import { 
  ApiResponse,
  ValidationUtils,
  RandomUtils,
  WorkerEnvironment
} from '@primo-poker/shared';
import { logger } from '@primo-poker/core';
import { AuthenticationManager, TokenPayload } from '@primo-poker/security';
import { 
  CreateProfileDataSchema, 
  UpdateProfileDataSchema,
  CreateProfileData,
  UpdateProfileData 
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

// Authentication middleware
async function authenticateRequest(request: AuthenticatedRequest): Promise<Response | void> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse('Missing or invalid authorization header', 401);
  }

  const token = authHeader.slice(7);
  
  if (request.env?.JWT_SECRET) {
    const authManager = new AuthenticationManager(request.env.JWT_SECRET);
    const result = await authManager.verifyAccessToken(token);
    
    if (!result.valid) {
      return errorResponse(result.error || 'Invalid token', 401);
    }

    if (result.payload) {
      request.user = result.payload;
    }
  }
}

// Get current user's profile
profileRoutes.get('/api/profiles/me', authenticateRequest, async (request: AuthenticatedRequest) => {
  const correlationId = request.headers.get('X-Correlation-ID') || RandomUtils.generateUUID();
  logger.setContext({ correlationId, operation: 'getMyProfile' });

  try {
    if (!request.user || !request.env?.PROFILE_DO) {
      return errorResponse('Not authenticated or service unavailable', 401);
    }

    const profileDO = request.env.PROFILE_DO.idFromName('profiles');
    const profileObj = request.env.PROFILE_DO.get(profileDO);

    const response = await profileObj.fetch(
      `http://internal/profile/${request.user.userId}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.text();
      return errorResponse(error || 'Profile not found', response.status);
    }

    const profile = await response.json();
    return successResponse(profile);
  } catch (error) {
    logger.error('Get profile error', error);
    return errorResponse('Failed to fetch profile', 500);
  } finally {
    logger.clearContext();
  }
});

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
  } catch (error) {
    logger.error('Update profile error', error);
    return errorResponse('Failed to update profile', 500);
  } finally {
    logger.clearContext();
  }
});

// Get public profile by player ID
profileRoutes.get('/api/profiles/:playerId', async (request: AuthenticatedRequest) => {
  const correlationId = request.headers.get('X-Correlation-ID') || RandomUtils.generateUUID();
  logger.setContext({ correlationId, operation: 'getPublicProfile' });

  try {
    const playerId = request.params?.playerId;
    if (!playerId || !request.env?.PROFILE_DO) {
      return errorResponse('Invalid request', 400);
    }

    const profileDO = request.env.PROFILE_DO.idFromName('profiles');
    const profileObj = request.env.PROFILE_DO.get(profileDO);

    const response = await profileObj.fetch(
      `http://internal/profile/${playerId}?public=true`,
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.text();
      return errorResponse(error || 'Profile not found', response.status);
    }

    const profile = await response.json();
    return successResponse(profile);
  } catch (error) {
    logger.error('Get public profile error', error);
    return errorResponse('Failed to fetch profile', 500);
  } finally {
    logger.clearContext();
  }
});

// Upload avatar
profileRoutes.post('/api/profiles/me/avatar', authenticateRequest, async (request: AuthenticatedRequest) => {
  const correlationId = request.headers.get('X-Correlation-ID') || RandomUtils.generateUUID();
  logger.setContext({ correlationId, operation: 'uploadAvatar' });

  try {
    if (!request.user || !request.env?.PROFILE_DO) {
      return errorResponse('Not authenticated or service unavailable', 401);
    }

    const contentType = request.headers.get('Content-Type');
    if (!contentType?.includes('multipart/form-data')) {
      return errorResponse('Invalid content type. Expected multipart/form-data', 400);
    }

    const formData = await request.formData();
    const file = formData.get('avatar') as File;

    if (!file) {
      return errorResponse('No avatar file provided', 400);
    }

    // Check file size
    const maxSize = parseInt(request.env.MAX_AVATAR_SIZE || '5242880'); // 5MB default
    if (file.size > maxSize) {
      return errorResponse(`File size exceeds maximum allowed size of ${maxSize} bytes`, 413);
    }

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
    return successResponse(result);
  } catch (error) {
    logger.error('Upload avatar error', error);
    return errorResponse('Failed to upload avatar', 500);
  } finally {
    logger.clearContext();
  }
});

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

// Get player statistics
profileRoutes.get('/api/profiles/:playerId/statistics', async (request: AuthenticatedRequest) => {
  const correlationId = request.headers.get('X-Correlation-ID') || RandomUtils.generateUUID();
  logger.setContext({ correlationId, operation: 'getPlayerStatistics' });

  try {
    const playerId = request.params?.playerId;
    if (!playerId || !request.env?.PROFILE_DO) {
      return errorResponse('Invalid request', 400);
    }

    const profileDO = request.env.PROFILE_DO.idFromName('profiles');
    const profileObj = request.env.PROFILE_DO.get(profileDO);

    const response = await profileObj.fetch(
      `http://internal/statistics/player/${playerId}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.text();
      return errorResponse(error || 'Statistics not found', response.status);
    }

    const stats = await response.json();
    return successResponse(stats);
  } catch (error) {
    logger.error('Get statistics error', error);
    return errorResponse('Failed to fetch statistics', 500);
  } finally {
    logger.clearContext();
  }
});

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

// Helper functions
function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function successResponse<T>(data: T): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(response), {
    headers: { 
      'Content-Type': 'application/json',
      ...getCorsHeaders(),
    },
  });
}

function errorResponse(message: string, status: number = 500): Response {
  const response: ApiResponse = {
    success: false,
    error: {
      code: status.toString(),
      message,
    },
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(response), {
    status,
    headers: { 
      'Content-Type': 'application/json',
      ...getCorsHeaders(),
    },
  });
}