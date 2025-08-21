import { z } from 'zod';
import { PokerAPIRoutes } from '../../routes';
import {
  createMockRequest,
  createAuthenticatedRequest,
  verifyContract,
  expectSuccessResponse,
  expectErrorResponse,
  testSchemaValidation,
  createTestUser,
} from './contract-test-utils';
import { AuthenticationManager } from '@primo-poker/security';
import { PlayerStatus } from '@primo-poker/shared';

// Request schemas
const UpdateProfileRequestSchema = z.object({
  username: z.string().min(3).max(20).optional(),
  email: z.string().email().optional(),
});

// Response schemas
const PlayerProfileResponseSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  email: z.string().email(),
  chipCount: z.number().nonnegative(),
  status: z.nativeEnum(PlayerStatus),
  isDealer: z.boolean(),
  timeBank: z.number().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

describe('Player API Contract Tests', () => {
  let api: PokerAPIRoutes;
  let router: any;

  beforeEach(() => {
    api = new PokerAPIRoutes();
    router = api.getRouter();
    jest.clearAllMocks();

    // Mock authentication for protected routes
    jest.spyOn(AuthenticationManager.prototype, 'verifyAccessToken').mockResolvedValue({
      valid: true,
      payload: {
        userId: 'test-user-id',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['player'],
        sessionId: 'test-session',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      },
    });
  });

  describe('GET /api/players/me', () => {
    it('should require authentication', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost/api/players/me',
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expectErrorResponse(body, '401', /Missing or invalid authorization header/);
    });

    it('should return authenticated player profile', async () => {
      const mockPlayer = {
        id: 'test-user-id',
        username: 'testuser',
        email: 'test@example.com',
        chipCount: 1500,
        status: PlayerStatus.ACTIVE,
        isDealer: false,
        timeBank: 30000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const request = createAuthenticatedRequest({
        method: 'GET',
        url: 'http://localhost/api/players/me',
      });

      // Mock DB response
      const mockEnv = request.env as any;
      mockEnv.DB.prepare().first.mockResolvedValueOnce(mockPlayer);

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          responseSchema: PlayerProfileResponseSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
      expect(result.body.data).toEqual(mockPlayer);
    });

    it('should handle player not found', async () => {
      const request = createAuthenticatedRequest({
        method: 'GET',
        url: 'http://localhost/api/players/me',
      });

      // Mock DB response - player not found
      const mockEnv = request.env as any;
      mockEnv.DB.prepare().first.mockResolvedValueOnce(null);

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(404);
      expectErrorResponse(body, '404', /Player not found/);
    });

    it('should handle database errors gracefully', async () => {
      const request = createAuthenticatedRequest({
        method: 'GET',
        url: 'http://localhost/api/players/me',
      });

      // Mock DB error
      const mockEnv = request.env as any;
      mockEnv.DB.prepare().first.mockRejectedValueOnce(new Error('Database connection failed'));

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expectErrorResponse(body, '500', /Failed to fetch profile/);
    });
  });

  describe('PUT /api/players/me', () => {
    it('should validate request schema', async () => {
      await testSchemaValidation(
        UpdateProfileRequestSchema,
        {
          username: 'newusername',
          email: 'newemail@example.com',
        },
        [
          { data: { username: 'ab' }, expectedError: 'too small' },
          { data: { username: 'a'.repeat(21) }, expectedError: 'too small' },
          { data: { email: 'invalid-email' }, expectedError: 'Invalid email' },
        ]
      );
    });

    it('should require authentication', async () => {
      const request = createMockRequest({
        method: 'PUT',
        url: 'http://localhost/api/players/me',
        body: { username: 'newname' },
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expectErrorResponse(body, '401', /Missing or invalid authorization header/);
    });

    it('should update username successfully', async () => {
      const request = createAuthenticatedRequest({
        method: 'PUT',
        url: 'http://localhost/api/players/me',
        body: { username: 'newusername' },
      });

      const updatedPlayer = {
        id: 'test-user-id',
        username: 'newusername',
        email: 'test@example.com',
        chipCount: 1500,
        status: PlayerStatus.ACTIVE,
        isDealer: false,
        timeBank: 30000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Mock DB update
      const mockEnv = request.env as any;
      mockEnv.DB.prepare().first.mockResolvedValueOnce(updatedPlayer);

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          requestSchema: UpdateProfileRequestSchema,
          responseSchema: PlayerProfileResponseSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
      expect(result.body.data.username).toBe('newusername');
    });

    it('should update email successfully', async () => {
      const request = createAuthenticatedRequest({
        method: 'PUT',
        url: 'http://localhost/api/players/me',
        body: { email: 'newemail@example.com' },
      });

      const updatedPlayer = {
        id: 'test-user-id',
        username: 'testuser',
        email: 'newemail@example.com',
        chipCount: 1500,
        status: PlayerStatus.ACTIVE,
        isDealer: false,
        timeBank: 30000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Mock DB update
      const mockEnv = request.env as any;
      mockEnv.DB.prepare().first.mockResolvedValueOnce(updatedPlayer);

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          requestSchema: UpdateProfileRequestSchema,
          responseSchema: PlayerProfileResponseSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
      expect(result.body.data.email).toBe('newemail@example.com');
    });

    it('should update both username and email', async () => {
      const request = createAuthenticatedRequest({
        method: 'PUT',
        url: 'http://localhost/api/players/me',
        body: {
          username: 'newusername',
          email: 'newemail@example.com',
        },
      });

      const updatedPlayer = {
        id: 'test-user-id',
        username: 'newusername',
        email: 'newemail@example.com',
        chipCount: 1500,
        status: PlayerStatus.ACTIVE,
        isDealer: false,
        timeBank: 30000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Mock DB update
      const mockEnv = request.env as any;
      mockEnv.DB.prepare().first.mockResolvedValueOnce(updatedPlayer);

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          requestSchema: UpdateProfileRequestSchema,
          responseSchema: PlayerProfileResponseSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
      expect(result.body.data.username).toBe('newusername');
      expect(result.body.data.email).toBe('newemail@example.com');
    });

    it('should sanitize username input', async () => {
      const request = createAuthenticatedRequest({
        method: 'PUT',
        url: 'http://localhost/api/players/me',
        body: { username: '  NewUser123!@#  ' }, // Username with special chars and spaces
      });

      const updatedPlayer = {
        id: 'test-user-id',
        username: 'NewUser123', // Sanitized
        email: 'test@example.com',
        chipCount: 1500,
        status: PlayerStatus.ACTIVE,
        isDealer: false,
        timeBank: 30000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Mock DB update
      const mockEnv = request.env as any;
      mockEnv.DB.prepare().first.mockResolvedValueOnce(updatedPlayer);

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expectSuccessResponse(body);
      expect(body.data.username).toBe('NewUser123');
    });

    it('should handle empty update request', async () => {
      const request = createAuthenticatedRequest({
        method: 'PUT',
        url: 'http://localhost/api/players/me',
        body: {}, // No updates
      });

      const existingPlayer = {
        id: 'test-user-id',
        username: 'testuser',
        email: 'test@example.com',
        chipCount: 1500,
        status: PlayerStatus.ACTIVE,
        isDealer: false,
        timeBank: 30000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Mock DB - returns existing player
      const mockEnv = request.env as any;
      mockEnv.DB.prepare().first.mockResolvedValueOnce(existingPlayer);

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expectSuccessResponse(body);
      expect(body.data).toEqual(existingPlayer);
    });

    it('should handle database errors gracefully', async () => {
      const request = createAuthenticatedRequest({
        method: 'PUT',
        url: 'http://localhost/api/players/me',
        body: { username: 'newname' },
      });

      // Mock DB error
      const mockEnv = request.env as any;
      mockEnv.DB.prepare().first.mockRejectedValueOnce(new Error('Database connection failed'));

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expectErrorResponse(body, '500', /Failed to update profile/);
    });
  });

  describe('Player Profile Edge Cases', () => {
    it('should handle player with minimal data', async () => {
      const minimalPlayer = {
        id: 'test-user-id',
        username: 'user',
        email: 'u@e.co',
        chipCount: 0,
        status: PlayerStatus.ACTIVE,
        isDealer: false,
        timeBank: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const request = createAuthenticatedRequest({
        method: 'GET',
        url: 'http://localhost/api/players/me',
      });

      // Mock DB response
      const mockEnv = request.env as any;
      mockEnv.DB.prepare().first.mockResolvedValueOnce(minimalPlayer);

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          responseSchema: PlayerProfileResponseSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
    });

    it('should handle player with maximum values', async () => {
      const maxPlayer = {
        id: 'test-user-id',
        username: 'a'.repeat(20), // Max length
        email: 'verylongemailaddress@verylongdomainname.com',
        chipCount: Number.MAX_SAFE_INTEGER,
        status: PlayerStatus.ACTIVE,
        isDealer: true,
        timeBank: 999999999,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const request = createAuthenticatedRequest({
        method: 'GET',
        url: 'http://localhost/api/players/me',
      });

      // Mock DB response
      const mockEnv = request.env as any;
      mockEnv.DB.prepare().first.mockResolvedValueOnce(maxPlayer);

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          responseSchema: PlayerProfileResponseSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
    });

    it('should handle different player statuses', async () => {
      const statuses = [
        PlayerStatus.ACTIVE,
        PlayerStatus.INACTIVE,
        PlayerStatus.SITTING_OUT,
        PlayerStatus.DISCONNECTED,
      ];

      for (const status of statuses) {
        const player = {
          id: 'test-user-id',
          username: 'testuser',
          email: 'test@example.com',
          chipCount: 1000,
          status,
          isDealer: false,
          timeBank: 30000,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const request = createAuthenticatedRequest({
          method: 'GET',
          url: 'http://localhost/api/players/me',
        });

        // Mock DB response
        const mockEnv = request.env as any;
        mockEnv.DB.prepare().first.mockResolvedValueOnce(player);

        const result = await verifyContract(
          router.handle.bind(router),
          request,
          {
            responseSchema: PlayerProfileResponseSchema,
            statusCode: 200,
          }
        );

        expect(result.isValid).toBe(true);
        expectSuccessResponse(result.body);
        expect(result.body.data.status).toBe(status);
      }
    });
  });
});