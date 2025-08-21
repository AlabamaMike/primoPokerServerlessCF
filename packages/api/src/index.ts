export * from './routes';
export * from './websocket';
export * from './websocket-manager';
export * from './spectator-manager';
export * from './tournament-viewer';
export * from './rng-api';

// WebSocket Infrastructure exports
export * from './websocket-multiplexed';
export * from './websocket-compressed';
export * from './websocket-batched';
export * from './websocket-connection-pool';

// Re-export key classes
export { PokerAPIRoutes } from './routes';
export { WebSocketManager } from './websocket';
export { WebSocketManager as EnhancedWebSocketManager } from './websocket-manager';
export { SpectatorManager } from './spectator-manager';
export { TournamentViewer } from './tournament-viewer';
export type { WebSocketConnection } from './websocket';

// WebSocket Infrastructure classes
export { MultiplexedWebSocketManager, WebSocketChannel } from './websocket-multiplexed';
export { CompressedWebSocketManager } from './websocket-compressed';
export { BatchingWebSocketManager } from './websocket-batched';
export { ConnectionPoolManager } from './websocket-connection-pool';

// RNG API exports
export { RNGApiHandler, createRNGApiRouter, RNG_API_ROUTES } from './rng-api';

// Chat Infrastructure exports
export { ChatEnhancedWebSocketManager } from './websocket-chat-enhanced';
export { ChatPersistenceRepository } from './repositories/chat-repository';
export type { ChatMessageRecord, ChatMessageInput, ChatHistoryParams, ChatStats } from './repositories/chat-repository';
export type { ChatWebSocketEnv, ChatHistoryRequest, ChatCommand } from './websocket-chat-enhanced';

// Chat Moderation exports
export { ContentValidator } from './chat-moderation/content-validator';
export { ModerationActionsManager } from './chat-moderation/moderation-actions';
export { ReportSystem } from './chat-moderation/report-system';
export { createModerationRoutes } from './routes/moderation';
export type { ValidationResult, ViolationType } from './chat-moderation/content-validator';
export type { ModerationAction, ModerationActionType, PlayerRestrictions } from './chat-moderation/moderation-actions';
export type { MessageReport, ReportStatus, ReportStats } from './chat-moderation/report-system';

// Cache middleware exports
export { CacheHeadersMiddleware } from './middleware/cache-headers';
export type { CacheableRequest } from './middleware/cache-headers';
export { CacheInvalidationHandler } from './utils/cache-invalidation';
export type { CacheInvalidationEnv } from './utils/cache-invalidation';
export { cacheConfig, CacheControl, CACHEABLE_CONTENT_TYPES, CACHEABLE_API_ROUTES, NON_CACHEABLE_API_ROUTES } from './middleware/cache-config';
export type { CacheTTL, CacheConfig } from './middleware/cache-config';

// Request Coalescing exports
export { RequestCoalescer, defaultCoalescer, withCoalescing } from './middleware/request-coalescer';
export type { CoalescingOptions } from './middleware/request-coalescer';

// Enhanced Idempotency exports  
export { idempotencyManager, createIdempotencyManager, withIdempotency } from './middleware/idempotency';
export type { IdempotencyOptions } from './middleware/idempotency';

// Response Validation exports
export { 
  ResponseValidator, 
  createResponseValidator, 
  validateApiResponse,
  ResponseValidationError 
} from './middleware/response-validator';
export type { ValidationOptions } from './middleware/response-validator';

export {
  createValidatedSuccessResponse,
  createValidatedErrorResponse,
  withResponseValidation,
  responseBuilder,
  getResponseValidator,
  ValidatedResponseBuilder
} from './utils/validated-response-helpers';

export {
  ResponseSchemaRegistry,
  ApiResponseSchema,
  SuccessResponseSchema,
  ErrorResponseSchema,
  PaginatedResponseSchema,
  // Auth schemas
  LoginResponseSchema,
  RegisterResponseSchema,
  RefreshTokenResponseSchema,
  // Player schemas
  PlayerProfileResponseSchema,
  // Table schemas
  TablesListResponseSchema,
  CreateTableResponseSchema,
  TableStateResponseSchema,
  JoinTableResponseSchema,
  TableSeatsResponseSchema,
  // Wallet schemas
  WalletResponseSchema,
  BalanceResponseSchema,
  DepositResponseSchema,
  TransactionHistoryResponseSchema,
  // Health check schema
  HealthCheckResponseSchema
} from './validation/response-schemas';
export type { ResponseSchemaKey } from './validation/response-schemas';

// OpenAPI Documentation exports
export * from './openapi';
export { OpenAPIGenerator, generateOpenAPISpec, createApiResponseSchema, createPaginatedResponseSchema } from './openapi';
export type { OpenAPIV3 } from './openapi';
