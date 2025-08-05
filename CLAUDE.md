# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build and Development
- `npm run build` - Build all workspaces
- `npm run dev` - Start development server for poker-server app (uses wrangler dev)
- `npm run clean` - Clean all build artifacts and node_modules

### Testing
- `npm run test` - Run tests across all workspaces
- `npm run test:ci` - Run tests with coverage in CI mode
- For single workspace: `npm run test -w @primo-poker/poker-server`

### Code Quality
- `npm run lint` - Lint all TypeScript files across workspaces
- `npm run type-check` - TypeScript type checking across all workspaces
- Pre-commit hooks automatically run ESLint and Prettier via lint-staged

### Deployment
- `npm run deploy` - Deploy poker-server to Cloudflare Workers
- `wrangler dev` - Local development with Cloudflare Workers environment

## Architecture Overview

This is a serverless poker room application built for Cloudflare's ecosystem using a monorepo structure with TypeScript project references.

### Monorepo Structure
- **Root**: Workspace management, shared configs, and development scripts
- **apps/poker-server**: Main Cloudflare Workers application entry point
- **apps/poker-desktop**: Standalone Tauri desktop client (React + Rust)
- **packages/**: Shared libraries organized by domain

### Package Architecture
- **@primo-poker/shared**: Core types, enums, Zod schemas, and error classes
- **@primo-poker/core**: Poker game logic (hand evaluation, game rules, table management)
- **@primo-poker/security**: Authentication and shuffle verification
- **@primo-poker/persistence**: Durable Objects and data repositories
- **@primo-poker/api**: API routes and WebSocket handlers

### Key Technical Details
- **TypeScript**: Strict mode enabled with composite builds and project references
- **Runtime**: Cloudflare Workers (ES2022, WebWorker environment) 
- **Bundler**: Uses module resolution "bundler" for Cloudflare Workers compatibility
- **Testing**: Jest with ts-jest transformation
- **Path Mapping**: TypeScript paths map to package src directories for development

### Domain Model
The codebase uses domain-driven design patterns:
- **Core Types**: Comprehensive poker types (Card, Player, GameState, etc.) with Zod validation
- **Game Phases**: WAITING → PRE_FLOP → FLOP → TURN → RIVER → SHOWDOWN → FINISHED
- **Event Sourcing**: Domain events for game state changes (GameStartedEvent, BetPlacedEvent, etc.)
- **Error Handling**: Custom poker-specific error classes (GameRuleError, InsufficientFundsError, etc.)

### WebSocket Integration
Real-time game updates via WebSocket messages with typed payloads for game updates, player actions, and chat.

## Important Notes
- Uses Cloudflare Workers runtime, not Node.js - ensure compatibility when adding dependencies
- Durable Objects handle game state persistence and real-time coordination
- All monetary values use number type with positive validation via Zod schemas
- Player actions are validated against current game phase and rules

## Current Status (August 5, 2025)
- **Production Environment**: Backend API fully operational
- **Backend API**: https://primo-poker-server.alabamamike.workers.dev
- **Desktop Client**: Standalone Tauri application in development (apps/poker-desktop)
- **Authentication**: JWT with secure OS keyring storage in desktop client
- **Migration**: Moved from browser-based to desktop client for enhanced security

## Recent Major Changes
1. **Desktop Client**: Created new Tauri-based desktop application
2. **Secure Storage**: Implemented OS keyring for token storage
3. **API Compatibility**: Fixed HTTPS/TLS issues for production backend
4. **E2E Testing**: All tests pass against production backend
5. **Frontend Removal**: Decommissioned browser-based Next.js frontend
6. **Multiplayer Engine Fixes** (August 2025): Comprehensive backend fixes for 6+ player games
   - Fixed WebSocket message format standardization (payload vs data fields)
   - Resolved "Player not at table" authentication errors
   - Implemented proper player state synchronization
   - Fixed button rotation and dealer position tracking
   - Added automatic hand completion and new game triggering
   - Enhanced game state validation for complex multiplayer scenarios

## Test Credentials
- Email: e2e_test_1754187899779@example.com
- Password: TestPass123!_1754187899779

## Verification Commands
- Backend health: `curl https://primo-poker-server.alabamamike.workers.dev/api/health`
- Desktop app: `cd apps/poker-desktop && npm run tauri dev`
- E2E tests: `cd apps/poker-desktop && npm test`
- Multiplayer tests: `cd tests/e2e/multiplayer && npm test simple-game.spec.ts`
- Button rotation test: `cd tests/e2e/multiplayer && npm test button-rotation.spec.ts`