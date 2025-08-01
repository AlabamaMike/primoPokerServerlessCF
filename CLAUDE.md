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