import { TableDurableObject, GameTableDurableObject, SecureRNGDurableObject } from '@primo-poker/persistence';
export { TableDurableObject, GameTableDurableObject, SecureRNGDurableObject };
interface Env {
    DB: D1Database;
    SESSION_STORE: KVNamespace;
    HAND_HISTORY_BUCKET: R2Bucket;
    AUDIT_BUCKET: R2Bucket;
    TABLE_OBJECTS: DurableObjectNamespace;
    GAME_TABLES: DurableObjectNamespace;
    SECURE_RNG_DO: DurableObjectNamespace;
    TOURNAMENT_QUEUE: Queue;
    ANALYTICS: AnalyticsEngineDataset;
    JWT_SECRET: string;
    DATABASE_ENCRYPTION_KEY: string;
    ANTHROPIC_API_KEY?: string;
    ENVIRONMENT: string;
    NODE_ENV?: string;
}
declare const _default: {
    fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
    queue(batch: MessageBatch<any>, env: Env): Promise<void>;
    scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void>;
};
export default _default;
//# sourceMappingURL=index.d.ts.map