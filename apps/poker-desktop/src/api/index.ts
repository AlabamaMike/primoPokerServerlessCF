// Type-safe API client exports
export { 
  TypeSafeApiClient, 
  apiClient, 
  createApiClient,
  type ApiResponse,
  type ApiSuccessResponse,
  type ApiErrorResponse,
  type RequestConfig,
  type EndpointDefinition
} from './type-safe-client'

// API endpoints
export { 
  api,
  authEndpoints,
  playerEndpoints,
  tableEndpoints,
  gameEndpoints,
  walletEndpoints,
  healthEndpoint
} from './endpoints'

// React hooks
export {
  useApi,
  useApiMutation,
  useApiQuery,
  useOptimisticMutation,
  type UseApiOptions,
  type UseApiResult
} from './hooks'

// Re-export error types from shared package for convenience
export {
  BaseError,
  ErrorCode,
  AuthenticationError,
  ValidationError,
  ConnectionError,
  SystemError,
  GameError,
  PlayerError,
  isRetryableError,
  getUserMessageFromError,
  getHttpStatusFromError
} from '@primo-poker/shared'