/**
 * Base test class for multiplayer poker tests
 */

import { test as base } from '@playwright/test';
import { TestConfig, getTestConfig } from './config';
import { TestLogger } from './helpers/logger';
import { ApiClient } from './helpers/api-client';
import { WebSocketHelper } from './helpers/websocket-helper';
import { PlayerSimulator, SimulatedPlayer } from './helpers/player-simulator';
import { GameValidator } from './helpers/game-validator';

export interface TestFixtures {
  config: TestConfig;
  logger: TestLogger;
  apiClient: ApiClient;
  wsHelper: WebSocketHelper;
  playerSimulator: PlayerSimulator;
  gameValidator: GameValidator;
  testCleanup: () => Promise<void>;
}

export const test = base.extend<TestFixtures>({
  config: async ({}, use) => {
    const config = getTestConfig();
    await use(config);
  },

  logger: async ({ config }, use, testInfo) => {
    const logger = new TestLogger(config, testInfo.title);
    logger.testStart(testInfo.title);
    
    await use(logger);
    
    // Save hand histories after test
    await logger.saveHandHistories();
    logger.testComplete(testInfo.status === 'passed');
  },

  apiClient: async ({ config, logger }, use) => {
    const client = new ApiClient(config, logger);
    
    // Verify API is healthy
    const healthy = await client.healthCheck();
    if (!healthy) {
      throw new Error('API health check failed');
    }
    
    await use(client);
  },

  wsHelper: async ({ config, logger }, use) => {
    const helper = new WebSocketHelper(config, logger);
    
    // Set up heartbeat interval
    const heartbeatInterval = setInterval(() => {
      helper.sendHeartbeats().catch(() => {
        // Ignore heartbeat errors
      });
    }, config.timing.heartbeatInterval);
    
    await use(helper);
    
    // Cleanup
    clearInterval(heartbeatInterval);
    helper.disconnectAll();
  },

  playerSimulator: async ({ config, logger, apiClient, wsHelper }, use) => {
    const simulator = new PlayerSimulator(config, logger, apiClient, wsHelper);
    await use(simulator);
    
    // Disconnect all players after test
    await simulator.disconnectAll();
  },

  gameValidator: async ({ logger }, use) => {
    const validator = new GameValidator(logger);
    await use(validator);
  },

  testCleanup: async ({ playerSimulator, wsHelper }, use) => {
    const cleanup = async () => {
      // Disconnect all players
      await playerSimulator.disconnectAll();
      wsHelper.disconnectAll();
    };
    
    await use(cleanup);
    
    // Run cleanup after test
    await cleanup();
  },
});

export { expect } from '@playwright/test';

// Test helpers
export async function createTestTable(
  apiClient: ApiClient,
  creatorToken: string,
  config?: Partial<any>
): Promise<string> {
  const tableConfig = {
    name: `Test Table ${Date.now()}`,
    gameType: 'texas_holdem',
    bettingStructure: 'no_limit',
    gameFormat: 'cash',
    maxPlayers: 9,
    minBuyIn: 100,
    maxBuyIn: 1000,
    smallBlind: 5,
    bigBlind: 10,
    ante: 0,
    timeBank: 30,
    isPrivate: false,
    ...config,
  };

  const table = await apiClient.createTable(creatorToken, tableConfig);
  return table.tableId;
}

export async function setupPlayers(
  playerSimulator: PlayerSimulator,
  count: number,
  testUsers: any[]
): Promise<SimulatedPlayer[]> {
  const players: SimulatedPlayer[] = [];
  
  for (let i = 0; i < count; i++) {
    const user = testUsers[i];
    const player = await playerSimulator.setupPlayer(
      user.email,
      user.username,
      user.password
    );
    players.push(player);
  }
  
  return players;
}

export async function waitForGamePhase(
  wsHelper: WebSocketHelper,
  playerId: string,
  targetPhase: string,
  timeout: number = 30000
): Promise<any> {
  const startTime = Date.now();
  let lastPhase = 'unknown';
  
  while (Date.now() - startTime < timeout) {
    try {
      const gameState = await wsHelper.waitForGameState(playerId, 2000);
      
      if (gameState.phase !== lastPhase) {
        console.log(`Game phase changed: ${lastPhase} -> ${gameState.phase}`);
        lastPhase = gameState.phase;
      }
      
      if (gameState.phase === targetPhase) {
        return gameState;
      }
    } catch (error) {
      // Log the error but continue waiting
      console.log(`Waiting for game state... (${Math.floor((Date.now() - startTime) / 1000)}s)`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error(`Timeout waiting for game phase: ${targetPhase} (current phase: ${lastPhase})`);
}

export async function playHand(
  playerSimulator: PlayerSimulator,
  wsHelper: WebSocketHelper,
  gameValidator: GameValidator,
  players: SimulatedPlayer[],
  logger: TestLogger
): Promise<void> {
  // Get initial game state from WebSocket messages
  const messages = wsHelper.getMessages(players[0].id);
  const gameStartMsg = messages.reverse().find(m => m.type === 'game_started');
  const stateMsg = messages.find(m => m.type === 'table_state_update' && m.payload?.gameState);
  
  const gameState = stateMsg?.payload?.gameState || gameStartMsg?.payload;
  if (!gameState) {
    throw new Error('No game state found in WebSocket messages');
  }
  
  logger.startHand(gameState.handNumber || 0, players, gameState.buttonPosition || 0);
  
  // Play through betting rounds until hand completes
  let currentPhase = gameState.phase;
  let handComplete = false;
  
  while (!handComplete) {
    logger.log(`Current phase: ${currentPhase}`);
    
    // Get latest game state
    const latestState = await getLatestGameState(wsHelper, players[0].id);
    
    // Log community cards when they appear
    if (latestState.communityCards && latestState.communityCards.length > 0) {
      const cards = latestState.communityCards.map((c: any) => `${c.rank}${c.suit[0]}`);
      logger.recordCommunityCards(cards);
    }
    
    // Validate game state
    const validation = gameValidator.validateGameState({
      players: latestState.players || [],
      pot: latestState.pot || 0,
      currentBet: latestState.currentBet || 0,
      phase: latestState.phase,
      buttonPosition: latestState.buttonPosition || 0,
      communityCards: latestState.communityCards,
    });
    
    if (!validation.valid) {
      logger.error(`Game validation failed: ${validation.errors.join(', ')}`);
      // Debug output
      logger.log(`Debug: buttonPosition=${latestState.buttonPosition}, players=${JSON.stringify(latestState.players?.map((p: any) => ({ id: p.id.substring(0, 8), position: p.position, status: p.status })))}`);
    }
    
    // Handle betting for current phase
    if (latestState.currentPlayer || latestState.activePlayerId) {
      await handleBettingRound(playerSimulator, wsHelper, players, latestState, logger);
    }
    
    // Check if hand is complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    const newState = await getLatestGameState(wsHelper, players[0].id);
    
    if (newState.phase === 'finished' || newState.phase === 'showdown' || newState.phase === 'waiting') {
      handComplete = true;
      
      // Log winners if available
      if (newState.winners) {
        logger.recordWinners(newState.winners);
      }
    } else if (newState.phase !== currentPhase) {
      currentPhase = newState.phase;
    }
  }
  
  logger.endHand();
}

async function getLatestGameState(wsHelper: WebSocketHelper, playerId: string): Promise<any> {
  // Try to get from WebSocket messages first
  const messages = wsHelper.getMessages(playerId);
  const stateMsg = messages
    .reverse()
    .find(m => m.type === 'table_state_update' && m.payload?.gameState);
  
  if (stateMsg?.payload?.gameState) {
    return stateMsg.payload.gameState;
  }
  
  // Fallback to waiting for game state
  try {
    return await wsHelper.waitForGameState(playerId, 2000);
  } catch {
    return { phase: 'unknown' };
  }
}

async function handleBettingRound(
  playerSimulator: PlayerSimulator,
  wsHelper: WebSocketHelper,
  players: SimulatedPlayer[],
  gameState: any,
  logger: TestLogger
): Promise<void> {
  const maxActions = 20; // Prevent infinite loops
  let actionCount = 0;
  
  // Continue until betting is complete
  const maxActionsPerRound = 10; // Limit actions per betting round
  while (actionCount < Math.min(maxActions, maxActionsPerRound)) {
    // Find player to act
    const actingPlayerId = gameState.currentPlayer || gameState.activePlayerId;
    if (!actingPlayerId) {
      break; // Betting round complete
    }
    
    const actingPlayer = players.find(p => p.id === actingPlayerId);
    if (!actingPlayer) {
      logger.error(`Acting player ${actingPlayerId} not found`);
      break;
    }
    
    // Make simple decision
    const toCall = (gameState.currentBet || 0) - (actingPlayer.currentBet || 0);
    let action = 'check';
    
    if (toCall > 0) {
      // Facing a bet - mostly fold to end hands quickly
      action = Math.random() > 0.8 ? 'call' : 'fold';
    } else {
      // No bet to call - mostly check
      action = Math.random() > 0.9 ? 'bet' : 'check';
    }
    
    try {
      logger.recordAction(actingPlayer.id, action);
      await wsHelper.sendAction(actingPlayer.id, action);
    } catch (error) {
      logger.error(`Failed to send action for ${actingPlayer.username}: ${error}`);
      // Skip to next player
      break;
    }
    
    // Wait for state update
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Get new game state
    const newState = await getLatestGameState(wsHelper, players[0].id);
    
    // Check if betting round is complete
    if (newState.phase !== gameState.phase || 
        newState.bettingComplete || 
        newState.allPlayersActed ||
        !newState.currentPlayer) {
      break;
    }
    
    gameState = newState;
    actionCount++;
  }
}