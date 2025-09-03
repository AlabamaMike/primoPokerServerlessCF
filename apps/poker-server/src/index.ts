// Version: 1.0.3 - Request size limits and input sanitization
import { PokerAPIRoutes, WebSocketManager, RNGApiHandler, createRNGApiRouter, RNG_API_ROUTES, CacheHeadersMiddleware, CacheableRequest, requestSizeLimiter } from '@primo-poker/api';
import { TableDurableObject, GameTableDurableObject, SecureRNGDurableObject, RateLimitDurableObject, CacheDO } from '@primo-poker/persistence';
import { ProfileDurableObject, StatisticsAggregator } from '@primo-poker/profiles';
import { logger, LogLevel, errorReporter, ErrorReporter } from '@primo-poker/core';
import { StatsPeriod } from '@primo-poker/shared';

// Export Durable Objects for Cloudflare Workers
export { TableDurableObject, GameTableDurableObject, SecureRNGDurableObject, RateLimitDurableObject, ProfileDurableObject, CacheDO };

// Environment interface
interface Env {
  DB: D1Database;
  SESSION_STORE: KVNamespace;
  METRICS_NAMESPACE: KVNamespace; // For metrics storage
  HAND_HISTORY_BUCKET: R2Bucket;
  AUDIT_BUCKET: R2Bucket; // For RNG audit logs
  AVATAR_BUCKET: R2Bucket; // For player avatars
  TABLE_OBJECTS: DurableObjectNamespace;
  GAME_TABLES: DurableObjectNamespace; // Our new GameTable Durable Objects
  SECURE_RNG_DO: DurableObjectNamespace; // SecureRNG Durable Objects
  RATE_LIMIT_DO: DurableObjectNamespace; // Rate Limiting Durable Objects
  GAME_TABLE_DO: DurableObjectNamespace; // For permission checks
  PROFILE_DO: DurableObjectNamespace; // Profile Durable Objects
  CACHE_DO: DurableObjectNamespace; // Distributed Cache Durable Objects
  TOURNAMENT_QUEUE: Queue;
  ANALYTICS: AnalyticsEngineDataset;
  
  // Secrets
  JWT_SECRET: string;
  DATABASE_ENCRYPTION_KEY: string;
  ANTHROPIC_API_KEY?: string;
  
  // Environment variables
  ENVIRONMENT: string;
  NODE_ENV?: string;
  ALLOWED_ORIGINS?: string;
  MAX_AVATAR_SIZE?: string;
  CDN_BASE_URL?: string;
}

// Initialize API routes and WebSocket manager
let apiRoutes: PokerAPIRoutes;
let wsManager: WebSocketManager;
let rngApiRouter: ReturnType<typeof createRNGApiRouter>;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Configure logging based on environment
    const logLevel = env.ENVIRONMENT === 'production' ? LogLevel.INFO : LogLevel.DEBUG;
    logger.setLogLevel(logLevel);
    
    // Configure error reporting (getInstance will handle options properly)
    ErrorReporter.getInstance({
      analyticsEndpoint: env.ANALYTICS,
      kvNamespace: env.SESSION_STORE as any, // Using SESSION_STORE for error storage
      environment: env.ENVIRONMENT,
      samplingRate: env.ENVIRONMENT === 'production' ? 0.1 : 1.0, // 10% sampling in production
    });
    
    // Initialize services
    if (!apiRoutes) {
      apiRoutes = new PokerAPIRoutes();
    }
    
    if (!wsManager) {
      wsManager = new WebSocketManager(env.JWT_SECRET);
    }
    
    if (!rngApiRouter) {
      rngApiRouter = createRNGApiRouter(env);
    }

    try {
      const url = new URL(request.url);
      
      // Handle WebSocket upgrade requests
      if (request.headers.get('Upgrade') === 'websocket') {
        return handleWebSocketUpgrade(request, env);
      }

      // Handle API routes
      if (url.pathname.startsWith('/api/')) {
        // Apply global request size limit for POST/PUT/PATCH requests
        if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
          const contentLength = request.headers.get('content-length');
          if (contentLength) {
            const size = parseInt(contentLength, 10);
            const maxSize = 1048576; // 1MB global limit
            if (size > maxSize) {
              logger.warn('Request size limit exceeded at worker level', {
                size,
                limit: maxSize,
                path: url.pathname,
                method: request.method
              });
              
              return new Response(JSON.stringify({
                success: false,
                error: {
                  code: '413',
                  message: 'Request payload too large'
                },
                timestamp: new Date().toISOString()
              }), {
                status: 413,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        }
        
        // Check if it's an RNG API route
        for (const [path, operation] of Object.entries(RNG_API_ROUTES)) {
          if (url.pathname === path) {
            return await rngApiRouter.handleRequest(request, operation);
          }
        }
        
        // Handle other API routes
        const extendedRequest = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
        });
        
        // Attach environment to the request object
        (extendedRequest as any).env = env;
        
        // Get response from API routes
        const response = await apiRoutes.getRouter().handle(extendedRequest);
        
        // Apply cache headers based on route and authentication
        const cachedResponse = await CacheHeadersMiddleware.middleware()(extendedRequest as CacheableRequest, response);
        
        // Apply ETag middleware for cacheable responses
        const finalResponse = await CacheHeadersMiddleware.etagMiddleware()(extendedRequest as CacheableRequest, cachedResponse);
        
        return finalResponse;
      }

      // Handle static content or SPA routing
      if (url.pathname === '/' || url.pathname.startsWith('/app/')) {
        const htmlResponse = new Response(getIndexHTML(), {
          headers: { 'Content-Type': 'text/html' },
        });
        
        // Apply cache headers for static HTML
        return CacheHeadersMiddleware.setCacheHeaders(htmlResponse, 'cache', { ttl: 3600, edge: true }, request.url);
      }

      // 404 for other routes
      return new Response('Not Found', { status: 404 });

    } catch (error) {
      const headers: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        headers[key] = value;
      });
      
      const context = { 
        url: request.url,
        method: request.method,
        headers
      };
      
      logger.critical('Worker error', error, context);
      
      // Report error automatically
      await errorReporter.report(error, context);
      
      // Log error to analytics (legacy, kept for compatibility)
      if (env.ANALYTICS) {
        env.ANALYTICS.writeDataPoint({
          blobs: [
            'error',
            error instanceof Error ? error.message : 'Unknown error',
            request.url,
          ],
          doubles: [Date.now()],
          indexes: [env.ENVIRONMENT],
        });
      }

      return new Response('Internal Server Error', { status: 500 });
    }
  },

  // Queue handler for tournament processing
  async queue(batch: MessageBatch<any>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processTournamentMessage(message.body, env);
        message.ack();
      } catch (error) {
        logger.error('Queue processing error', error, { 
          messageId: message.id,
          messageBody: message.body 
        });
        await errorReporter.report(error, {
          queue: 'tournament',
          messageId: message.id,
          messageBody: message.body,
        });
        message.retry();
      }
    }
  },

  // Scheduled event handler for cleanup and maintenance
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    switch (event.cron) {
      case '*/15 * * * *': // Every 15 minutes
        ctx.waitUntil(cleanupStaleConnections(env));
        break;
      case '0 */6 * * *': // Every 6 hours
        ctx.waitUntil(cleanupOldHandHistory(env));
        break;
      case '0 2 * * *': // Daily at 2 AM
        ctx.waitUntil(runDailyMaintenance(env));
        break;
      case '0 * * * *': // Every hour
        ctx.waitUntil(runHourlyStatisticsAggregation(env));
        break;
      case '0 3 * * *': // Daily at 3 AM
        ctx.waitUntil(runDailyStatisticsAggregation(env));
        break;
      case '0 4 * * 1': // Weekly on Monday at 4 AM
        ctx.waitUntil(runWeeklyStatisticsAggregation(env));
        break;
      case '0 5 1 * *': // Monthly on the 1st at 5 AM
        ctx.waitUntil(runMonthlyStatisticsAggregation(env));
        break;
    }
  },
};

// WebSocket upgrade handler
async function handleWebSocketUpgrade(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || undefined;
  const tableId = url.searchParams.get('tableId') || undefined;

  logger.info('[WS] Upgrade request received', {
    url: url.toString(),
    hasToken: !!token,
    tokenLength: token?.length || 0,
    tableId: tableId || '',
    origin: request.headers.get('origin') || '',
    upgrade: request.headers.get('upgrade') || ''
  });

  // Validate required parameters
  if (!token) {
    logger.error('[WS] Missing token parameter');
    return new Response('Missing token parameter', { status: 400 });
  }

  if (!tableId) {
    logger.error('[WS] Missing tableId parameter');
    return new Response('Missing tableId parameter', { status: 400 });
  }

  // Validate tableId is not a special route
  if (tableId === 'lobby' || tableId === 'undefined' || tableId === 'null') {
    logger.error('[WS] Invalid tableId', undefined, { tableId });
    return new Response(`Invalid tableId: ${tableId}. WebSocket connections are only supported for game tables.`, { status: 400 });
  }

  // Validate JWT token using AuthenticationManager
  let decodedPayload: any;
  
  try {
    logger.info('[WS] Validating token for table', { tableId });
    
    // Initialize authentication manager
    const authManager = new (await import('@primo-poker/security')).AuthenticationManager(env.JWT_SECRET);
    
    // Verify the JWT token
    const verifyResult = await authManager.verifyAccessToken(token);
    
    if (!verifyResult.valid || !verifyResult.payload) {
      logger.error('[WS] Token verification failed', undefined, { error: verifyResult.error });
      return new Response(verifyResult.error || 'Invalid token', { status: 401 });
    }
    
    decodedPayload = verifyResult.payload;
    logger.info('[WS] Token verified for user', { userId: decodedPayload.userId, username: decodedPayload.username });

    // Get or create GameTable Durable Object
    const gameTableId = env.GAME_TABLES.idFromName(tableId);
    const gameTable = env.GAME_TABLES.get(gameTableId);

    logger.info('[WS] Forwarding to GameTable Durable Object', { gameTableId: gameTableId.toString() });

    // Forward WebSocket upgrade request to the GameTable Durable Object
    // We need to preserve the WebSocket upgrade headers and add authentication info
    const headers = new Headers(request.headers)
    headers.set('X-Player-ID', decodedPayload.userId)
    headers.set('X-Username', decodedPayload.username)
    headers.set('X-Table-ID', tableId)
    headers.set('X-Roles', decodedPayload.roles?.join(',') || 'player')
    headers.set('Upgrade', 'websocket')
    headers.set('Connection', 'Upgrade')
    
    // Add CORS headers for WebSocket
    headers.set('Access-Control-Allow-Origin', env.ALLOWED_ORIGINS || '*')
    headers.set('Access-Control-Allow-Credentials', 'true')
    
    const websocketRequest = new Request(request.url, {
      method: 'GET',
      headers
    });

    logger.info('[WS] Forwarding request to Durable Object with headers', {
      playerId: decodedPayload.userId,
      username: decodedPayload.username,
      tableId
    });

    // Forward to Durable Object - it will handle the WebSocket upgrade
    const response = await gameTable.fetch(websocketRequest);
    
    logger.info('[WS] Durable Object response status', { status: response.status });
    
    // Return the response from the Durable Object
    return response;

  } catch (error) {
    logger.error('[WS] WebSocket upgrade error', error as Error);
    return new Response('Authentication failed', { status: 401 });
  }
}

// Tournament message processing
async function processTournamentMessage(message: any, env: Env): Promise<void> {
  switch (message.type) {
    case 'start_tournament':
      await startTournament(message.tournamentId, env);
      break;
    case 'advance_blinds':
      await advanceBlinds(message.tournamentId, env);
      break;
    case 'eliminate_player':
      await eliminatePlayer(message.tournamentId, message.playerId, env);
      break;
    case 'finish_tournament':
      await finishTournament(message.tournamentId, env);
      break;
  }
}

async function startTournament(tournamentId: string, env: Env): Promise<void> {
  // Implementation for starting tournament
  logger.info('Starting tournament', { tournamentId });
}

async function advanceBlinds(tournamentId: string, env: Env): Promise<void> {
  // Implementation for advancing blind levels
  logger.info('Advancing blinds for tournament', { tournamentId });
}

async function eliminatePlayer(tournamentId: string, playerId: string, env: Env): Promise<void> {
  // Implementation for player elimination
  logger.info('Eliminating player from tournament', { playerId, tournamentId });
}

async function finishTournament(tournamentId: string, env: Env): Promise<void> {
  // Implementation for finishing tournament
  logger.info('Finishing tournament', { tournamentId });
}

// Maintenance functions
async function cleanupStaleConnections(env: Env): Promise<void> {
  if (wsManager) {
    wsManager.cleanup();
  }
  
  // Log cleanup metrics
  if (env.ANALYTICS) {
    env.ANALYTICS.writeDataPoint({
      blobs: ['cleanup', 'stale_connections'],
      doubles: [Date.now()],
      indexes: [env.ENVIRONMENT],
    });
  }
}

async function cleanupOldHandHistory(env: Env): Promise<void> {
  // Clean up hand history older than 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  try {
    const objects = await env.HAND_HISTORY_BUCKET.list({
      prefix: 'hand-history/',
    });

    for (const object of objects.objects) {
      if (object.uploaded && object.uploaded < thirtyDaysAgo) {
        await env.HAND_HISTORY_BUCKET.delete(object.key);
      }
    }
  } catch (error) {
    logger.error('Hand history cleanup error', error as Error);
  }
}

async function runDailyMaintenance(env: Env): Promise<void> {
  // Run database maintenance
  try {
    await env.DB.prepare(`
      DELETE FROM games 
      WHERE created_at < datetime('now', '-7 days')
      AND phase = 'finished'
    `).run();

    await env.DB.prepare(`
      DELETE FROM sessions 
      WHERE expires_at < datetime('now')
    `).run();

    // Log maintenance completion
    if (env.ANALYTICS) {
      env.ANALYTICS.writeDataPoint({
        blobs: ['maintenance', 'daily_cleanup'],
        doubles: [Date.now()],
        indexes: [env.ENVIRONMENT],
      });
    }
  } catch (error) {
    logger.error('Daily maintenance error', error as Error);
  }
}

// Statistics aggregation functions
async function runHourlyStatisticsAggregation(env: Env): Promise<void> {
  try {
    logger.info('Starting hourly statistics aggregation');
    const aggregator = new StatisticsAggregator(env.DB, env.METRICS_NAMESPACE);
    
    // Run incremental updates for recent activity
    await aggregator.runAggregation(StatsPeriod.DAILY);
    
    // Log completion
    if (env.ANALYTICS) {
      env.ANALYTICS.writeDataPoint({
        blobs: ['statistics', 'hourly_aggregation'],
        doubles: [Date.now()],
        indexes: [env.ENVIRONMENT],
      });
    }
  } catch (error) {
    logger.error('Hourly statistics aggregation error', error as Error);
    await errorReporter.report(error, {
      job: 'hourly_statistics_aggregation',
      environment: env.ENVIRONMENT,
    });
  }
}

async function runDailyStatisticsAggregation(env: Env): Promise<void> {
  try {
    logger.info('Starting daily statistics aggregation');
    const aggregator = new StatisticsAggregator(env.DB, env.METRICS_NAMESPACE);
    
    // Run daily aggregation
    await aggregator.runAggregation(StatsPeriod.DAILY);
    
    // Also update weekly stats for the current week
    await aggregator.runAggregation(StatsPeriod.WEEKLY);
    
    // Log completion
    if (env.ANALYTICS) {
      env.ANALYTICS.writeDataPoint({
        blobs: ['statistics', 'daily_aggregation'],
        doubles: [Date.now()],
        indexes: [env.ENVIRONMENT],
      });
    }
  } catch (error) {
    logger.error('Daily statistics aggregation error', error as Error);
    await errorReporter.report(error, {
      job: 'daily_statistics_aggregation',
      environment: env.ENVIRONMENT,
    });
  }
}

async function runWeeklyStatisticsAggregation(env: Env): Promise<void> {
  try {
    logger.info('Starting weekly statistics aggregation');
    const aggregator = new StatisticsAggregator(env.DB, env.METRICS_NAMESPACE);
    
    // Run weekly aggregation
    await aggregator.runAggregation(StatsPeriod.WEEKLY);
    
    // Also update monthly stats for the current month
    await aggregator.runAggregation(StatsPeriod.MONTHLY);
    
    // Log completion
    if (env.ANALYTICS) {
      env.ANALYTICS.writeDataPoint({
        blobs: ['statistics', 'weekly_aggregation'],
        doubles: [Date.now()],
        indexes: [env.ENVIRONMENT],
      });
    }
  } catch (error) {
    logger.error('Weekly statistics aggregation error', error as Error);
    await errorReporter.report(error, {
      job: 'weekly_statistics_aggregation',
      environment: env.ENVIRONMENT,
    });
  }
}

async function runMonthlyStatisticsAggregation(env: Env): Promise<void> {
  try {
    logger.info('Starting monthly statistics aggregation');
    const aggregator = new StatisticsAggregator(env.DB, env.METRICS_NAMESPACE);
    
    // Run monthly aggregation
    await aggregator.runAggregation(StatsPeriod.MONTHLY);
    
    // Also update yearly and all-time stats
    await aggregator.runAggregation(StatsPeriod.YEARLY);
    await aggregator.runAggregation(StatsPeriod.ALL_TIME);
    
    // Log completion
    if (env.ANALYTICS) {
      env.ANALYTICS.writeDataPoint({
        blobs: ['statistics', 'monthly_aggregation'],
        doubles: [Date.now()],
        indexes: [env.ENVIRONMENT],
      });
    }
  } catch (error) {
    logger.error('Monthly statistics aggregation error', error as Error);
    await errorReporter.report(error, {
      job: 'monthly_statistics_aggregation',
      environment: env.ENVIRONMENT,
    });
  }
}

// Basic HTML for the poker client
function getIndexHTML(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Primo Poker</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
            color: white;
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
        }
        .header h1 {
            font-size: 3rem;
            margin: 0;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .header p {
            font-size: 1.2rem;
            opacity: 0.9;
        }
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 30px;
            margin-bottom: 40px;
        }
        .feature {
            background: rgba(255,255,255,0.1);
            padding: 30px;
            border-radius: 15px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.2);
        }
        .feature h3 {
            margin-top: 0;
            font-size: 1.5rem;
        }
        .cta {
            text-align: center;
            margin-top: 40px;
        }
        .btn {
            display: inline-block;
            padding: 15px 30px;
            background: #ff6b6b;
            color: white;
            text-decoration: none;
            border-radius: 50px;
            font-weight: bold;
            font-size: 1.1rem;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(0,0,0,0.3);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🃏 Primo Poker</h1>
            <p>Professional Serverless Poker Platform</p>
        </div>
        
        <div class="features">
            <div class="feature">
                <h3>🎮 Multiple Game Types</h3>
                <p>Texas Hold'em, Omaha, Seven Card Stud with various betting structures and tournament formats.</p>
            </div>
            <div class="feature">
                <h3>🔒 Provably Fair</h3>
                <p>Cryptographically secure shuffling using Web Crypto API with SHA-256 commitments, verifiable randomness, and complete audit trails.</p>
            </div>
            <div class="feature">
                <h3>⚡ Real-time Play</h3>
                <p>WebSocket-powered live gameplay with instant updates and responsive controls.</p>
            </div>
            <div class="feature">
                <h3>🏆 Tournaments</h3>
                <p>Multi-table tournaments, sit-and-go games, and heads-up matches with automated management.</p>
            </div>
            <div class="feature">
                <h3>☁️ Cloudflare Powered</h3>
                <p>Built on Cloudflare's edge infrastructure for global performance and reliability.</p>
            </div>
            <div class="feature">
                <h3>📊 Advanced Analytics</h3>
                <p>Detailed statistics, hand analysis, and performance tracking for serious players.</p>
            </div>
        </div>
        
        <div class="cta">
            <a href="/app" class="btn">Enter Poker Room</a>
        </div>
    </div>

    <script>
        // Basic WebSocket connection test
        console.log('Primo Poker - Serverless Poker Platform');
        console.log('API Health Check:', '/api/health');
        
        // Test API connection
        fetch('/api/health')
            .then(response => response.json())
            .then(data => console.log('API Status:', data))
            .catch(error => console.error('API Error:', error));
    </script>
</body>
</html>
  `.trim();
}
