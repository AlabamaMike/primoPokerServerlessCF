export * from './repositories';
export * from './durable-objects';
export * from './game-table-do';
export * from './table-registry-do';
export * from './lobby-manager';
export * from './secure-rng-do';
export * from './friend-repository';
export * from './player-notes-repository';
export * from './statistics-repository';
export * from './cache-do';

// Re-export key interfaces and classes
export type {
  IPlayerRepository,
  IGameRepository,
  ITournamentRepository,
  Tournament,
  TournamentStructure,
  BlindLevel,
} from './repositories';

export type { Env } from './durable-objects';

export {
  D1PlayerRepository,
  D1GameRepository,
  D1TournamentRepository,
  R2HandHistoryStorage,
  KVSessionStore,
} from './repositories';

export { TableDurableObject } from './durable-objects';
export { GameTableDurableObject } from './game-table-do';
export { TableRegistryDurableObject } from './table-registry-do';
export { LobbyManager } from './lobby-manager';
export { WalletManager } from './wallet-manager';
export { SecureRNGDurableObject } from './secure-rng-do';
export type { RNGRequest, RNGResponse, RNGStatus, AuditLog, StoredState } from './secure-rng-do';
export { RateLimitDurableObject } from './rate-limit-do';
export { CacheDO } from './cache-do';
export type { CacheEntry, CacheOptions, CacheBatchOperation, CacheStats } from './cache-do';
export { CacheHelper } from './cache-helper';

// Phase 2 Durable Objects
export { LobbyCoordinatorDurableObject } from './lobby-coordinator-do';
export type { LobbyCoordinatorState, SeatReservation, LobbyWebSocketConnection } from './lobby-coordinator-do';
export { WalletManagerDurableObject } from './wallet-manager-do';
export type { 
  WalletManagerState, 
  WalletTransaction, 
  DailyLimit, 
  FrozenAmount, 
  TransferRequest, 
  TransactionFilter 
} from './wallet-manager-do';
export { ChatModeratorDurableObject } from './chat-moderator-do';
export type { 
  ChatModeratorState, 
  ChatHistoryEntry, 
  MutedUser, 
  ReportedMessage, 
  ChannelConfig, 
  ModerationStats, 
  ChatWebSocketConnection, 
  MessageFilter 
} from './chat-moderator-do';

// Monitoring exports
export { MetricsCollector } from './monitoring/metrics';
export type { 
  RequestMetric, 
  ErrorMetric, 
  ResponseTimeMetric, 
  RateLimitMetric, 
  DurableObjectHealthMetric, 
  MetricsSummary 
} from './monitoring/metrics';
export { 
  METRICS_TTL, 
  TIME_WINDOWS, 
  PERFORMANCE_THRESHOLDS, 
  SAMPLING_RATES,
  FLUSH_INTERVALS,
  PERCENTILES 
} from './monitoring/constants';
export { PerformanceMonitorDO } from './performance-monitor-do';
export type {
  PerformanceMetrics,
  AggregatedMetrics,
  TimeSeriesData,
  AlertCondition,
  Alert,
  CacheMetrics,
  ApiMetrics,
  WebSocketMetrics,
  EdgeMetrics,
  RegionMetrics,
  PerformanceDashboard,
} from './monitoring/performance-types';

// Sharding exports
export { ShardingStrategy, ShardingManager } from './sharding-strategy';
export type { ShardingConfig, ShardInfo } from './sharding-strategy';
export { 
  getShardedDurableObject, 
  getWalletDurableObject, 
  getChatDurableObject, 
  getLobbyDurableObject 
} from './sharding-strategy';

// Migration exports
export { DurableObjectMigrator, migrator } from './do-migration';
export type { MigrationConfig, Migration, MigrationResult, VersionedState } from './do-migration';
export { 
  lobbyCoordinatorMigrations, 
  walletManagerMigrations, 
  chatModeratorMigrations,
  ensureLatestVersion,
  getMigrationStatus
} from './do-migration';

// Validation exports
export * from './validation';

// Real-time update exports
export { TableStateChangeDetector } from './table-state-detector';
export type { TableChange, TableChangeType } from './table-state-detector';
export { DeltaUpdateGenerator } from './delta-update-generator';
export type { JsonPatchOperation } from './delta-update-generator';
export { LobbyBroadcastManager } from './lobby-broadcast-manager';
export type { BroadcastConfig, LobbyUpdateMessage } from './lobby-broadcast-manager';

// Tournament coordinator exports
export { TournamentCoordinator } from './durable-objects/tournament-coordinator';
export type {
  TournamentConfig,
  TableInfo,
  TournamentPlayer,
  TournamentData
} from './durable-objects/tournament-coordinator';
