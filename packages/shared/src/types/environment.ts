/**
 * Environment interface for Cloudflare Workers
 */

import type { D1Database, KVNamespace, R2Bucket, DurableObjectNamespace, Queue, AnalyticsEngineDataset } from '@cloudflare/workers-types';

export interface WorkerEnvironment {
  // Core Services
  DB: D1Database;
  SESSION_STORE: KVNamespace;
  METRICS_NAMESPACE: KVNamespace;
  HAND_HISTORY_BUCKET: R2Bucket;
  AUDIT_BUCKET: R2Bucket;
  
  // Durable Objects
  TABLE_OBJECTS: DurableObjectNamespace;
  GAME_TABLES: DurableObjectNamespace;
  SECURE_RNG_DO: DurableObjectNamespace;
  RATE_LIMIT_DO: DurableObjectNamespace;
  GAME_TABLE_DO: DurableObjectNamespace;
  
  // Queues
  TOURNAMENT_QUEUE: Queue;
  
  // Analytics
  ANALYTICS: AnalyticsEngineDataset;
  
  // Secrets
  JWT_SECRET: string;
  DATABASE_ENCRYPTION_KEY: string;
  ANTHROPIC_API_KEY?: string;
  
  // Environment variables
  ENVIRONMENT: 'development' | 'staging' | 'production';
  NODE_ENV?: string;
  ALLOWED_ORIGINS?: string;
  WEBSOCKET_URL?: string;
  VERSION?: string;
}