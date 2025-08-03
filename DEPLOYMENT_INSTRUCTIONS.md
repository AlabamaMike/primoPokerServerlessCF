# Deployment Instructions for Multiplayer Poker Application

## Current Issue
The production deployment is showing the single-player demo instead of the multiplayer implementation. This guide will help you deploy the correct version.

## Prerequisites
- Cloudflare account with Workers and Pages enabled
- Wrangler CLI installed (`npm install -g wrangler`)
- Authenticated with Cloudflare (`wrangler login`)

## Backend Deployment (Cloudflare Workers)

### 1. Verify Backend Configuration
The backend is already configured in `apps/poker-server/wrangler.toml`

### 2. Deploy Backend
```bash
cd /workspaces/primoPokerServerlessCF
npm run deploy
```

This will deploy the poker server with:
- WebSocket support
- Durable Objects for game state
- API endpoints at `https://primo-poker-server.alabamamike.workers.dev`

## Frontend Deployment (Cloudflare Pages)

### 1. Build Frontend with Production Variables
```bash
cd /workspaces/primoPokerServerlessCF/apps/poker-frontend

# Set environment variables for build
export NEXT_PUBLIC_API_URL=https://primo-poker-server.alabamamike.workers.dev
export NEXT_PUBLIC_WS_URL=wss://primo-poker-server.alabamamike.workers.dev
export NEXT_PUBLIC_ENVIRONMENT=production
export NEXT_PUBLIC_ENABLE_MULTIPLAYER=true

# Build the frontend
npm run build
```

### 2. Deploy to Cloudflare Pages

#### Option A: Using Wrangler (Recommended)
```bash
# From the poker-frontend directory
npx wrangler pages deploy out --project-name=primo-poker-frontend
```

#### Option B: Using Cloudflare Dashboard
1. Go to Cloudflare Dashboard > Pages
2. Create a new project or update existing "primo-poker-frontend"
3. Upload the `out` directory
4. Set environment variables:
   - `NEXT_PUBLIC_API_URL` = `https://primo-poker-server.alabamamike.workers.dev`
   - `NEXT_PUBLIC_WS_URL` = `wss://primo-poker-server.alabamamike.workers.dev`
   - `NEXT_PUBLIC_ENVIRONMENT` = `production`
   - `NEXT_PUBLIC_ENABLE_MULTIPLAYER` = `true`

### 3. Verify Deployment
After deployment, verify:
1. The homepage should redirect to `/login` or `/lobby`
2. No "Single Player Demo" text should appear
3. Tables should route to `/game/{tableId}` not `/demo/table`
4. WebSocket connections should work

## Code Changes Made

### 1. Fixed Routing Issues
- `apps/poker-frontend/src/app/lobby/page.tsx`
  - Changed `router.push('/multiplayer?table=${tableId}')` to `router.push('/game/${tableId}')`
  - Added logic to route demo tables to `/demo/table` and real tables to `/game/{tableId}`

### 2. Removed Demo Fallbacks
- `apps/poker-frontend/src/app/multiplayer/page.tsx`
  - Removed automatic fallback to `/demo/table` when WebSocket not connected
  - Now shows error message instead

### 3. Environment Configuration
- `apps/poker-frontend/wrangler.toml` already has correct production URLs
- `apps/poker-frontend/.env.production` has correct values

## Testing After Deployment

Run the E2E tests to verify everything works:

```bash
cd /workspaces/primoPokerServerlessCF
npm run test:e2e:production
```

Or manually test:
1. Register a new user
2. Login
3. Create a table (should navigate to `/game/{tableId}`)
4. Join as spectator (automatic)
5. Select a seat and buy in
6. Stand up and cash out

## Troubleshooting

### If still seeing demo content:
1. Clear Cloudflare cache: Dashboard > Caching > Purge Everything
2. Check browser cache: Hard refresh (Ctrl+Shift+R)
3. Verify the deployed files don't contain demo references

### If WebSocket errors:
1. Verify backend is deployed and healthy: `curl https://primo-poker-server.alabamamike.workers.dev/api/health`
2. Check Durable Objects are enabled in your Cloudflare account
3. Verify WebSocket upgrade headers are allowed

### Build Issues:
If the build fails with memory errors, try:
```bash
# Increase Node memory
export NODE_OPTIONS="--max-old-space-size=4096"
npm run build
```

## Success Criteria
✅ No "Single Player Demo" text visible
✅ Tables route to `/game/{tableId}`
✅ WebSocket connects to production backend
✅ All Phase 1-5 features work:
  - Automatic spectator mode
  - Seat selection
  - Buy-in process
  - Stand up functionality
  - Wallet integration
  - Real-time updates