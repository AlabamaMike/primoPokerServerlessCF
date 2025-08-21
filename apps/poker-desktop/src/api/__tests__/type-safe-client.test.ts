import { z } from 'zod'
import { TypeSafeApiClient, createApiClient } from '../type-safe-client'
import { 
  ErrorCode, 
  AuthenticationError, 
  ValidationError, 
  ConnectionError,
  SystemError 
} from '@primo-poker/shared'

// Mock fetch
global.fetch = jest.fn()

describe('TypeSafeApiClient', () => {
  let client: TypeSafeApiClient
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>

  beforeEach(() => {
    jest.clearAllMocks()
    client = createApiClient({
      baseUrl: 'https://test-api.example.com',
      timeout: 5000,
      getToken: () => 'test-token'
    })
  })

  describe('request method', () => {
    it('should make successful GET request', async () => {
      const mockData = { id: '1', name: 'Test' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: mockData })
      } as Response)

      const result = await client.get('/api/test')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.example.com/api/test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json'
          })
        })
      )
      expect(result).toEqual(mockData)
    })

    it('should make successful POST request with body', async () => {
      const requestBody = { name: 'New Item' }
      const mockResponse = { id: '2', name: 'New Item' }
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: mockResponse })
      } as Response)

      const result = await client.post('/api/items', requestBody)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.example.com/api/items',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestBody),
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json'
          })
        })
      )
      expect(result).toEqual(mockResponse)
    })

    it('should handle query parameters correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: [] })
      } as Response)

      await client.get('/api/items', {
        params: { page: 1, limit: 10, active: true }
      })

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('page=1')
      expect(calledUrl).toContain('limit=10')
      expect(calledUrl).toContain('active=true')
    })
  })

  describe('error handling', () => {
    it('should throw AuthenticationError for 401 responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: 'Invalid token',
          code: ErrorCode.AUTH_INVALID_TOKEN
        })
      } as Response)

      await expect(client.get('/api/protected')).rejects.toThrow(AuthenticationError)
      await expect(client.get('/api/protected')).rejects.toMatchObject({
        code: ErrorCode.AUTH_INVALID_TOKEN,
        message: 'Invalid token',
        httpStatus: 401
      })
    })

    it('should throw ValidationError for 400 responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: 'Invalid input',
          code: ErrorCode.VALIDATION_FAILED,
          details: { field: 'email', message: 'Invalid email format' }
        })
      } as Response)

      await expect(client.post('/api/users', {})).rejects.toThrow(ValidationError)
      await expect(client.post('/api/users', {})).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Invalid input',
        httpStatus: 400,
        details: { field: 'email', message: 'Invalid email format' }
      })
    })

    it('should throw ConnectionError for network failures', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(client.get('/api/test')).rejects.toThrow(ConnectionError)
      await expect(client.get('/api/test')).rejects.toMatchObject({
        code: ErrorCode.CONNECTION_FAILED,
        message: 'Network error',
        httpStatus: 503
      })
    })

    it('should throw ConnectionError for timeout', async () => {
      // Create a client with very short timeout
      const shortTimeoutClient = createApiClient({
        baseUrl: 'https://test-api.example.com',
        timeout: 10
      })

      // Mock fetch that never resolves
      mockFetch.mockImplementationOnce(() => new Promise(() => {}))

      await expect(shortTimeoutClient.get('/api/slow')).rejects.toThrow(ConnectionError)
      await expect(shortTimeoutClient.get('/api/slow')).rejects.toMatchObject({
        code: ErrorCode.CONNECTION_TIMEOUT,
        message: 'Request timeout'
      })
    })

    it('should throw SystemError for 500 responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: 'Database connection failed'
        })
      } as Response)

      await expect(client.get('/api/test')).rejects.toThrow(SystemError)
      await expect(client.get('/api/test')).rejects.toMatchObject({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Database connection failed',
        httpStatus: 500
      })
    })
  })

  describe('request validation', () => {
    it('should validate request data against schema', async () => {
      const RequestSchema = z.object({
        email: z.string().email(),
        age: z.number().min(18)
      })

      const endpoint = client.createEndpoint({
        method: 'POST',
        path: '/api/users',
        requestSchema: RequestSchema
      })

      // Invalid request - should throw validation error
      await expect(
        endpoint({ email: 'invalid', age: 15 })
      ).rejects.toThrow(ValidationError)

      await expect(
        endpoint({ email: 'invalid', age: 15 })
      ).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_FAILED,
        message: expect.stringContaining('Request validation failed')
      })
    })

    it('should pass validation for valid request data', async () => {
      const RequestSchema = z.object({
        email: z.string().email(),
        age: z.number().min(18)
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { id: '1' } })
      } as Response)

      const endpoint = client.createEndpoint({
        method: 'POST',
        path: '/api/users',
        requestSchema: RequestSchema
      })

      const result = await endpoint({ email: 'test@example.com', age: 25 })
      expect(result).toEqual({ id: '1' })
    })
  })

  describe('response validation', () => {
    it('should validate response data against schema', async () => {
      const ResponseSchema = z.object({
        id: z.string(),
        email: z.string().email()
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { id: '1', email: 'invalid-email' } // Invalid email
        })
      } as Response)

      await expect(
        client.get('/api/user', { schema: ResponseSchema })
      ).rejects.toThrow(ValidationError)

      await expect(
        client.get('/api/user', { schema: ResponseSchema })
      ).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_FAILED,
        message: expect.stringContaining('Response validation failed')
      })
    })

    it('should pass validation for valid response data', async () => {
      const ResponseSchema = z.object({
        id: z.string(),
        email: z.string().email()
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { id: '1', email: 'test@example.com' }
        })
      } as Response)

      const result = await client.get('/api/user', { schema: ResponseSchema })
      expect(result).toEqual({ id: '1', email: 'test@example.com' })
    })

    it('should skip validation when validateResponse is false', async () => {
      const ResponseSchema = z.object({
        id: z.string(),
        email: z.string().email()
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { id: '1', email: 'invalid-email' }
        })
      } as Response)

      const result = await client.get('/api/user', { 
        schema: ResponseSchema,
        validateResponse: false 
      })
      
      expect(result).toEqual({ id: '1', email: 'invalid-email' })
    })
  })

  describe('createEndpoint', () => {
    it('should create typed endpoint with full validation', async () => {
      const UserSchema = z.object({
        id: z.string(),
        name: z.string(),
        email: z.string().email()
      })

      const CreateUserSchema = z.object({
        name: z.string().min(1),
        email: z.string().email()
      })

      const endpoint = client.createEndpoint({
        method: 'POST',
        path: '/api/users',
        requestSchema: CreateUserSchema,
        responseSchema: UserSchema
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { id: '123', name: 'John', email: 'john@example.com' }
        })
      } as Response)

      const result = await endpoint({ name: 'John', email: 'john@example.com' })
      
      expect(result).toEqual({
        id: '123',
        name: 'John',
        email: 'john@example.com'
      })
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.example.com/api/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'John', email: 'john@example.com' })
        })
      )
    })

    it('should handle endpoints without request body', async () => {
      const endpoint = client.createEndpoint({
        method: 'GET',
        path: '/api/health',
        responseSchema: z.object({ status: z.string() })
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { status: 'healthy' } })
      } as Response)

      const result = await endpoint()
      expect(result).toEqual({ status: 'healthy' })
    })
  })

  describe('content type handling', () => {
    it('should handle non-JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'Plain text response',
        json: async () => { throw new Error('Not JSON') }
      } as Response)

      const result = await client.get('/api/text')
      expect(result).toBe('Plain text response')
    })

    it('should handle empty responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers(),
        text: async () => '',
        json: async () => { throw new Error('No content') }
      } as Response)

      const result = await client.delete('/api/resource/123')
      expect(result).toBe('')
    })
  })
})