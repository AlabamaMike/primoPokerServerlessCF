import { z } from 'zod';
import { PokerAPIRoutes } from '../../routes';
import {
  createMockRequest,
  verifyContract,
  expectSuccessResponse,
  expectErrorResponse,
  testSchemaValidation,
  runEndpointTests,
  createMockEnv,
} from './contract-test-utils';
import { AuthenticationManager, PasswordManager } from '@primo-poker/security';
import { RandomUtils } from '@primo-poker/shared';

// Request schemas
const RegisterRequestSchema = z.object({
  username: z.string().min(3).max(20),
  email: z.string().email(),
  password: z.string().min(6),
});

const LoginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

// Response schemas
const AuthResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    username: z.string(),
    email: z.string().email(),
    chipCount: z.number().positive(),
  }),
  tokens: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresIn: z.number(),
    tokenType: z.literal('Bearer'),
  }),
  message: z.string().optional(),
});

const RefreshTokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  tokenType: z.literal('Bearer'),
});

describe('Authentication API Contract Tests', () => {
  let api: PokerAPIRoutes;
  let router: any;

  beforeEach(() => {
    api = new PokerAPIRoutes();
    router = api.getRouter();
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should validate request schema', async () => {
      await testSchemaValidation(
        RegisterRequestSchema,
        {
          username: 'testuser',
          email: 'test@example.com',
          password: 'password123',
        },
        [
          { data: { username: 'ab', email: 'test@example.com', password: 'pass123' }, expectedError: 'too small' },
          { data: { username: 'testuser', email: 'invalid-email', password: 'pass123' }, expectedError: 'Invalid email' },
          { data: { username: 'testuser', email: 'test@example.com', password: '12345' }, expectedError: 'too small' },
          { data: { username: '', email: 'test@example.com', password: 'pass123' }, expectedError: 'too small' },
        ]
      );
    });

    it('should successfully register a new user', async () => {
      const request = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/auth/register',
        body: {
          username: 'newuser',
          email: 'newuser@example.com',
          password: 'password123',
        },
      });

      // Mock DB responses
      const mockEnv = request.env as any;
      mockEnv.DB.prepare().first
        .mockResolvedValueOnce(null) // Username not found
        .mockResolvedValueOnce(null); // Email not found

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          requestSchema: RegisterRequestSchema,
          responseSchema: AuthResponseSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
      expect(result.body.data).toMatchObject({
        user: {
          username: 'newuser',
          email: 'newuser@example.com',
          chipCount: 1000,
        },
      });
    });

    it('should reject duplicate username', async () => {
      const request = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/auth/register',
        body: {
          username: 'existinguser',
          email: 'new@example.com',
          password: 'password123',
        },
      });

      // Mock existing user
      const mockEnv = request.env as any;
      mockEnv.DB.prepare().first.mockResolvedValueOnce({
        id: 'existing-id',
        username: 'existinguser',
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(409);
      expectErrorResponse(body, '409', /Username already exists/);
    });

    it('should reject duplicate email', async () => {
      const request = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/auth/register',
        body: {
          username: 'newuser',
          email: 'existing@example.com',
          password: 'password123',
        },
      });

      // Mock no existing username but existing email
      const mockEnv = request.env as any;
      mockEnv.DB.prepare().first
        .mockResolvedValueOnce(null) // Username not found
        .mockResolvedValueOnce({ // Email found
          id: 'existing-id',
          email: 'existing@example.com',
        });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(409);
      expectErrorResponse(body, '409', /Email already exists/);
    });

    it('should validate email format', async () => {
      const invalidEmails = ['notanemail', 'missing@', '@example.com', 'user@'];
      
      for (const email of invalidEmails) {
        const request = createMockRequest({
          method: 'POST',
          url: 'http://localhost/api/auth/register',
          body: {
            username: 'testuser',
            email,
            password: 'password123',
          },
        });

        const response = await router.handle(request);
        const body = await response.json();

        expect(response.status).toBe(400);
        expectErrorResponse(body, '400', /Invalid email format/);
      }
    });

    it('should validate password strength', async () => {
      const request = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/auth/register',
        body: {
          username: 'testuser',
          email: 'test@example.com',
          password: '12345', // Too short
        },
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expectErrorResponse(body, '400', /Password must be at least 6 characters long/);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should validate request schema', async () => {
      await testSchemaValidation(
        LoginRequestSchema,
        {
          username: 'testuser',
          password: 'password123',
        },
        [
          { data: { username: '', password: 'password123' }, expectedError: 'too small' },
          { data: { username: 'testuser', password: '' }, expectedError: 'too small' },
          { data: {}, expectedError: 'Required' },
        ]
      );
    });

    it('should successfully login with valid credentials', async () => {
      const request = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/auth/login',
        body: {
          username: 'testuser',
          password: 'password123',
        },
      });

      // Mock successful authentication
      jest.spyOn(AuthenticationManager.prototype, 'authenticate').mockResolvedValueOnce({
        success: true,
        user: {
          id: 'user-id',
          username: 'testuser',
          email: 'test@example.com',
          chipCount: 1000,
        },
        tokens: {
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          expiresIn: 3600,
          tokenType: 'Bearer' as const,
        },
      });

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          requestSchema: LoginRequestSchema,
          responseSchema: AuthResponseSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
    });

    it('should reject invalid credentials', async () => {
      const request = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/auth/login',
        body: {
          username: 'testuser',
          password: 'wrongpassword',
        },
      });

      // Mock failed authentication
      jest.spyOn(AuthenticationManager.prototype, 'authenticate').mockResolvedValueOnce({
        success: false,
        error: 'Invalid credentials',
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expectErrorResponse(body, '401', /Invalid credentials/);
    });

    it('should handle missing credentials', async () => {
      const tests = [
        { username: '', password: 'password' },
        { username: 'user', password: '' },
        { username: null, password: 'password' },
        { username: 'user', password: null },
      ];

      for (const testCase of tests) {
        const request = createMockRequest({
          method: 'POST',
          url: 'http://localhost/api/auth/login',
          body: testCase,
        });

        const response = await router.handle(request);
        const body = await response.json();

        expect(response.status).toBe(400);
        expectErrorResponse(body, '400', /Username and password required/);
      }
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should validate request schema', async () => {
      await testSchemaValidation(
        RefreshTokenRequestSchema,
        {
          refreshToken: 'valid-refresh-token',
        },
        [
          { data: { refreshToken: '' }, expectedError: 'too small' },
          { data: {}, expectedError: 'Required' },
        ]
      );
    });

    it('should successfully refresh tokens', async () => {
      const request = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/auth/refresh',
        body: {
          refreshToken: 'valid-refresh-token',
        },
      });

      // Mock successful token refresh
      jest.spyOn(AuthenticationManager.prototype, 'refreshTokens').mockResolvedValueOnce({
        success: true,
        tokens: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          expiresIn: 3600,
          tokenType: 'Bearer' as const,
        },
      });

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          requestSchema: RefreshTokenRequestSchema,
          responseSchema: RefreshTokenResponseSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
    });

    it('should reject invalid refresh token', async () => {
      const request = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/auth/refresh',
        body: {
          refreshToken: 'invalid-token',
        },
      });

      // Mock failed token refresh
      jest.spyOn(AuthenticationManager.prototype, 'refreshTokens').mockResolvedValueOnce({
        success: false,
        error: 'Invalid refresh token',
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expectErrorResponse(body, '401', /Invalid refresh token/);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should require authentication', async () => {
      const request = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/auth/logout',
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expectErrorResponse(body, '401', /Missing or invalid authorization header/);
    });

    it('should successfully logout authenticated user', async () => {
      const request = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/auth/logout',
        headers: {
          'Authorization': 'Bearer valid-token',
        },
      });

      // Mock successful token verification
      jest.spyOn(AuthenticationManager.prototype, 'verifyAccessToken').mockResolvedValueOnce({
        valid: true,
        payload: {
          userId: 'user-id',
          username: 'testuser',
          email: 'test@example.com',
          roles: ['player'],
          sessionId: 'session-id',
          iat: Date.now() / 1000,
          exp: Date.now() / 1000 + 3600,
        },
      });

      // Mock successful session revocation
      jest.spyOn(AuthenticationManager.prototype, 'revokeSession').mockResolvedValueOnce();

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expectSuccessResponse(body);
      expect(body.data).toEqual({ message: 'Logged out successfully' });
    });
  });

  describe('Authentication Flow Integration', () => {
    it('should complete full authentication flow', async () => {
      // 1. Register
      const registerRequest = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/auth/register',
        body: {
          username: 'flowuser',
          email: 'flow@example.com',
          password: 'flowpass123',
        },
      });

      const mockEnv = registerRequest.env as any;
      mockEnv.DB.prepare().first
        .mockResolvedValueOnce(null) // Username not found
        .mockResolvedValueOnce(null); // Email not found

      const registerResponse = await router.handle(registerRequest);
      const registerBody = await registerResponse.json();

      expect(registerResponse.status).toBe(200);
      expectSuccessResponse(registerBody);
      expect(registerBody.data.tokens).toBeDefined();

      // 2. Login
      const loginRequest = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/auth/login',
        body: {
          username: 'flowuser',
          password: 'flowpass123',
        },
      });

      jest.spyOn(AuthenticationManager.prototype, 'authenticate').mockResolvedValueOnce({
        success: true,
        user: {
          id: 'flow-user-id',
          username: 'flowuser',
          email: 'flow@example.com',
          chipCount: 1000,
        },
        tokens: {
          accessToken: 'flow-access-token',
          refreshToken: 'flow-refresh-token',
          expiresIn: 3600,
          tokenType: 'Bearer' as const,
        },
      });

      const loginResponse = await router.handle(loginRequest);
      const loginBody = await loginResponse.json();

      expect(loginResponse.status).toBe(200);
      expectSuccessResponse(loginBody);

      // 3. Refresh token
      const refreshRequest = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/auth/refresh',
        body: {
          refreshToken: 'flow-refresh-token',
        },
      });

      jest.spyOn(AuthenticationManager.prototype, 'refreshTokens').mockResolvedValueOnce({
        success: true,
        tokens: {
          accessToken: 'new-flow-access-token',
          refreshToken: 'new-flow-refresh-token',
          expiresIn: 3600,
          tokenType: 'Bearer' as const,
        },
      });

      const refreshResponse = await router.handle(refreshRequest);
      const refreshBody = await refreshResponse.json();

      expect(refreshResponse.status).toBe(200);
      expectSuccessResponse(refreshBody);

      // 4. Logout
      const logoutRequest = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/auth/logout',
        headers: {
          'Authorization': 'Bearer new-flow-access-token',
        },
      });

      jest.spyOn(AuthenticationManager.prototype, 'verifyAccessToken').mockResolvedValueOnce({
        valid: true,
        payload: {
          userId: 'flow-user-id',
          username: 'flowuser',
          email: 'flow@example.com',
          roles: ['player'],
          sessionId: 'flow-session-id',
          iat: Date.now() / 1000,
          exp: Date.now() / 1000 + 3600,
        },
      });

      jest.spyOn(AuthenticationManager.prototype, 'revokeSession').mockResolvedValueOnce();

      const logoutResponse = await router.handle(logoutRequest);
      const logoutBody = await logoutResponse.json();

      expect(logoutResponse.status).toBe(200);
      expectSuccessResponse(logoutBody);
    });
  });
});