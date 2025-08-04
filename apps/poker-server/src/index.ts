// Version: 1.0.2 - Security fixes applied with full audit logging
import { PokerAPIRoutes, WebSocketManager, RNGApiHandler, createRNGApiRouter, RNG_API_ROUTES } from '@primo-poker/api';
import { TableDurableObject, GameTableDurableObject, SecureRNGDurableObject, RateLimitDurableObject } from '@primo-poker/persistence';

// Export Durable Objects for Cloudflare Workers
export { TableDurableObject, GameTableDurableObject, SecureRNGDurableObject, RateLimitDurableObject };

// Environment interface
interface Env {
  DB: D1Database;
  SESSION_STORE: KVNamespace;
  HAND_HISTORY_BUCKET: R2Bucket;
  AUDIT_BUCKET: R2Bucket; // For RNG audit logs
  TABLE_OBJECTS: DurableObjectNamespace;
  GAME_TABLES: DurableObjectNamespace; // Our new GameTable Durable Objects
  SECURE_RNG_DO: DurableObjectNamespace; // SecureRNG Durable Objects
  RATE_LIMIT_DO: DurableObjectNamespace; // Rate Limiting Durable Objects
  GAME_TABLE_DO: DurableObjectNamespace; // For permission checks
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
}

// Initialize API routes and WebSocket manager
let apiRoutes: PokerAPIRoutes;
let wsManager: WebSocketManager;
let rngApiRouter: ReturnType<typeof createRNGApiRouter>;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
        
        return await apiRoutes.getRouter().handle(extendedRequest);
      }

      // Handle static content or SPA routing
      if (url.pathname === '/' || url.pathname.startsWith('/app/')) {
        return new Response(getIndexHTML(), {
          headers: { 'Content-Type': 'text/html' },
        });
      }

      // 404 for other routes
      return new Response('Not Found', { status: 404 });

    } catch (error) {
      console.error('Worker error:', error);
      
      // Log error to analytics
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
        console.error('Queue processing error:', error);
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
    }
  },
};

// WebSocket upgrade handler
async function handleWebSocketUpgrade(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const tableId = url.searchParams.get('tableId');

  console.log('[WS] Upgrade request received:', {
    url: url.toString(),
    hasToken: !!token,
    tokenLength: token?.length,
    tableId,
    origin: request.headers.get('origin'),
    upgrade: request.headers.get('upgrade')
  });

  // Validate required parameters
  if (!token) {
    console.error('[WS] Missing token parameter');
    return new Response('Missing token parameter', { status: 400 });
  }

  if (!tableId) {
    console.error('[WS] Missing tableId parameter');
    return new Response('Missing tableId parameter', { status: 400 });
  }

  // Validate tableId is not a special route
  if (tableId === 'lobby' || tableId === 'undefined' || tableId === 'null') {
    console.error('[WS] Invalid tableId:', tableId);
    return new Response(`Invalid tableId: ${tableId}. WebSocket connections are only supported for game tables.`, { status: 400 });
  }

  // Validate JWT token using AuthenticationManager
  let decodedPayload: any;
  
  try {
    console.log('[WS] Validating token for table:', tableId);
    
    // Initialize authentication manager
    const authManager = new (await import('@primo-poker/security')).AuthenticationManager(env.JWT_SECRET);
    
    // Verify the JWT token
    const verifyResult = await authManager.verifyAccessToken(token);
    
    if (!verifyResult.valid || !verifyResult.payload) {
      console.error('[WS] Token verification failed:', verifyResult.error);
      return new Response(verifyResult.error || 'Invalid token', { status: 401 });
    }
    
    decodedPayload = verifyResult.payload;
    console.log('[WS] Token verified for user:', decodedPayload.userId, 'username:', decodedPayload.username);

    // Get or create GameTable Durable Object
    const gameTableId = env.GAME_TABLES.idFromName(tableId);
    const gameTable = env.GAME_TABLES.get(gameTableId);

    console.log('[WS] Forwarding to GameTable Durable Object:', gameTableId.toString());

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

    console.log('[WS] Forwarding request to Durable Object with headers:', {
      playerId: decodedPayload.userId,
      username: decodedPayload.username,
      tableId
    });

    // Forward to Durable Object - it will handle the WebSocket upgrade
    const response = await gameTable.fetch(websocketRequest);
    
    console.log('[WS] Durable Object response status:', response.status);
    
    // Return the response from the Durable Object
    return response;

  } catch (error) {
    console.error('[WS] WebSocket upgrade error:', error);
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
  console.log(`Starting tournament: ${tournamentId}`);
}

async function advanceBlinds(tournamentId: string, env: Env): Promise<void> {
  // Implementation for advancing blind levels
  console.log(`Advancing blinds for tournament: ${tournamentId}`);
}

async function eliminatePlayer(tournamentId: string, playerId: string, env: Env): Promise<void> {
  // Implementation for player elimination
  console.log(`Eliminating player ${playerId} from tournament: ${tournamentId}`);
}

async function finishTournament(tournamentId: string, env: Env): Promise<void> {
  // Implementation for finishing tournament
  console.log(`Finishing tournament: ${tournamentId}`);
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
    console.error('Hand history cleanup error:', error);
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
    console.error('Daily maintenance error:', error);
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
