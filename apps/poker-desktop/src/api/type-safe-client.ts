import { z } from 'zod'
import { 
  BaseError, 
  ErrorCode, 
  AuthenticationError,
  ValidationError,
  ConnectionError,
  SystemError,
  ErrorContextSchema
} from '@primo-poker/shared'
import { useAuthStore } from '../stores/auth-store'

// API Response Types
export interface ApiSuccessResponse<T = unknown> {
  success: true
  data: T
  metadata?: Record<string, unknown>
}

export interface ApiErrorResponse {
  success: false
  error: string
  code?: ErrorCode
  details?: unknown
  correlationId?: string
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse

// Request configuration
export interface RequestConfig extends Omit<RequestInit, 'body'> {
  params?: Record<string, string | number | boolean>
  body?: unknown
  timeout?: number
  validateResponse?: boolean
  schema?: z.ZodSchema<unknown>
}

// Type-safe endpoint definitions
export interface EndpointDefinition<TRequest = void, TResponse = unknown> {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  requestSchema?: z.ZodSchema<TRequest>
  responseSchema?: z.ZodSchema<TResponse>
  authenticated?: boolean
}

// Error mapping function
function mapHttpStatusToErrorCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return ErrorCode.VALIDATION_FAILED
    case 401:
      return ErrorCode.AUTH_UNAUTHORIZED
    case 403:
      return ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS
    case 404:
      return ErrorCode.GAME_NOT_FOUND
    case 409:
      return ErrorCode.PLAYER_ALREADY_AT_TABLE
    case 429:
      return ErrorCode.RATE_LIMIT_EXCEEDED
    case 500:
      return ErrorCode.INTERNAL_ERROR
    case 503:
      return ErrorCode.SERVICE_UNAVAILABLE
    default:
      return ErrorCode.UNKNOWN_ERROR
  }
}

// Create appropriate error based on response
function createApiError(response: Response, errorData?: ApiErrorResponse): BaseError {
  const code = errorData?.code || mapHttpStatusToErrorCode(response.status)
  const message = errorData?.error || response.statusText || 'Request failed'
  const details = errorData?.details

  switch (response.status) {
    case 401:
    case 403:
      return new AuthenticationError(message, code, details)
    case 400:
    case 422:
      return new ValidationError(message, code, details)
    case 502:
    case 503:
    case 504:
      return new ConnectionError(message, code, details)
    default:
      return new SystemError(message, code, details)
  }
}

// Type-safe API client class
export class TypeSafeApiClient {
  private baseUrl: string
  private defaultTimeout: number
  private getToken: () => string | undefined

  constructor(options: {
    baseUrl?: string
    timeout?: number
    getToken?: () => string | undefined
  } = {}) {
    this.baseUrl = options.baseUrl || 'https://primo-poker-server.alabamamike.workers.dev'
    this.defaultTimeout = options.timeout || 30000
    this.getToken = options.getToken || (() => useAuthStore.getState().token)
  }

  // Build URL with query parameters
  private buildUrl(path: string, params?: Record<string, string | number | boolean>): string {
    const url = new URL(path, this.baseUrl)
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value))
      })
    }
    
    return url.toString()
  }

  // Validate request data against schema
  private validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T {
    try {
      return schema.parse(data)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(
          `Request validation failed: ${error.errors.map(e => e.message).join(', ')}`,
          ErrorCode.VALIDATION_FAILED,
          { zodErrors: error.errors }
        )
      }
      throw error
    }
  }

  // Validate response data against schema
  private validateResponse<T>(schema: z.ZodSchema<T>, data: unknown): T {
    try {
      return schema.parse(data)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(
          `Response validation failed: ${error.errors.map(e => e.message).join(', ')}`,
          ErrorCode.VALIDATION_FAILED,
          { zodErrors: error.errors }
        )
      }
      throw error
    }
  }

  // Main request method
  async request<TResponse = unknown>(
    endpoint: string,
    config: RequestConfig = {}
  ): Promise<TResponse> {
    const {
      method = 'GET',
      params,
      body,
      timeout = this.defaultTimeout,
      validateResponse = true,
      schema,
      headers = {},
      ...fetchOptions
    } = config

    const url = this.buildUrl(endpoint, params)
    const token = this.getToken()

    // Build headers
    const requestHeaders: HeadersInit = {
      'Content-Type': 'application/json',
      ...headers,
    }

    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`
    }

    // Create abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        ...fetchOptions,
      })

      clearTimeout(timeoutId)

      // Parse response
      let responseData: unknown
      const contentType = response.headers.get('content-type')
      
      if (contentType?.includes('application/json')) {
        responseData = await response.json()
      } else {
        responseData = await response.text()
      }

      // Handle errors
      if (!response.ok) {
        const errorResponse = responseData as ApiErrorResponse
        throw createApiError(response, errorResponse)
      }

      // Extract data from successful response
      const apiResponse = responseData as ApiSuccessResponse<TResponse>
      const data = apiResponse.data

      // Validate response if schema provided
      if (validateResponse && schema) {
        return this.validateResponse(schema, data)
      }

      return data as TResponse
    } catch (error) {
      clearTimeout(timeoutId)

      // Handle fetch errors
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new ConnectionError(
            'Request timeout',
            ErrorCode.CONNECTION_TIMEOUT,
            { timeout }
          )
        }
        if (error instanceof BaseError) {
          throw error
        }
        throw new ConnectionError(
          error.message,
          ErrorCode.CONNECTION_FAILED,
          { originalError: error }
        )
      }
      
      throw new SystemError(
        'Unknown error occurred',
        ErrorCode.UNKNOWN_ERROR,
        { originalError: error }
      )
    }
  }

  // Typed endpoint method creator
  createEndpoint<TRequest = void, TResponse = unknown>(
    definition: EndpointDefinition<TRequest, TResponse>
  ) {
    return async (request?: TRequest, config?: Omit<RequestConfig, 'method' | 'body' | 'schema'>): Promise<TResponse> => {
      // Validate request if schema provided
      let validatedRequest: TRequest | undefined
      if (definition.requestSchema && request !== undefined) {
        validatedRequest = this.validateRequest(definition.requestSchema, request)
      }

      // Perform request
      return this.request<TResponse>(definition.path, {
        method: definition.method,
        body: validatedRequest,
        schema: definition.responseSchema,
        validateResponse: !!definition.responseSchema,
        ...config,
      })
    }
  }

  // Convenience methods
  get<T = unknown>(endpoint: string, config?: Omit<RequestConfig, 'method'>): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: 'GET' })
  }

  post<T = unknown>(endpoint: string, body?: unknown, config?: Omit<RequestConfig, 'method' | 'body'>): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: 'POST', body })
  }

  put<T = unknown>(endpoint: string, body?: unknown, config?: Omit<RequestConfig, 'method' | 'body'>): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: 'PUT', body })
  }

  patch<T = unknown>(endpoint: string, body?: unknown, config?: Omit<RequestConfig, 'method' | 'body'>): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: 'PATCH', body })
  }

  delete<T = unknown>(endpoint: string, config?: Omit<RequestConfig, 'method'>): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: 'DELETE' })
  }
}

// Default client instance
export const apiClient = new TypeSafeApiClient()

// Export for testing
export const createApiClient = (options?: ConstructorParameters<typeof TypeSafeApiClient>[0]) => {
  return new TypeSafeApiClient(options)
}