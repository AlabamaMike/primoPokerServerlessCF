/**
 * Simple game test to debug connection and game flow
 */

import { test, expect, createTestTable, setupPlayers } from './test-base';

test.describe('Simple Game Flow Test', () => {
  test('Basic 2-player game', async ({
    config,
    logger,
    apiClient,
    wsHelper,
    playerSimulator,
  }) => {
    logger.minimal('Starting simple 2-player game test');
    
    // Setup just 2 players for simplicity
    const players = await setupPlayers(playerSimulator, 2, config.testUsers);
    logger.log(`Created ${players.length} test players`);
    
    // Create table
    const tableId = await createTestTable(apiClient, players[0].tokens!.accessToken, {
      maxPlayers: 2,
      smallBlind: 10,
      bigBlind: 20,
      minBuyIn: 200,
    });
    logger.log(`Created table: ${tableId}`);
    
    // Join both players
    for (const player of players) {
      await playerSimulator.joinTable(player.id, tableId, 500);
      logger.log(`${player.username} joined table`);
    }
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check table state via API
    const tableState = await apiClient.getTable(tableId);
    logger.log(`Table state after joins:`);
    logger.log(`  Phase: ${tableState.phase}`);
    logger.log(`  Players: ${tableState.playerCount}`);
    logger.log(`  Current bet: ${tableState.currentBet}`);
    
    // List all messages received so far
    logger.minimal('\nMessages received by players:');
    for (const player of players) {
      const messages = wsHelper.getMessages(player.id);
      logger.log(`\n${player.username} received ${messages.length} messages:`);
      messages.forEach(msg => {
        const payloadStr = msg.payload ? JSON.stringify(msg.payload).substring(0, 100) : 'no payload';
        logger.log(`  - ${msg.type}: ${payloadStr}...`);
      });
    }
    
    // If game is in pre_flop, try to play one action
    if (tableState.phase === 'pre_flop') {
      logger.minimal('\nGame is in pre_flop, attempting to play...');
      
      // Get the latest game state from a WebSocket message
      const latestMessages = wsHelper.getMessages(players[0].id);
      const gameStateMsg = latestMessages
        .reverse()
        .find(m => m.type === 'table_state_update' && m.payload?.gameState);
      
      if (gameStateMsg?.payload?.gameState) {
        const gameState = gameStateMsg.payload.gameState;
        logger.log(`Game state from WS: currentPlayer=${gameState.currentPlayer}, pot=${gameState.pot}`);
        
        const activePlayerId = gameState.currentPlayer;
        const actingPlayer = players.find(p => p.id === activePlayerId);
        
        if (actingPlayer) {
          logger.log(`It's ${actingPlayer.username}'s turn`);
          
          // Wait for the player to receive the game state
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Send a simple action
          await wsHelper.sendAction(actingPlayer.id, 'call');
          logger.log(`${actingPlayer.username} sent call action`);
          
          // Wait for state update
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Check new state
          const newState = await apiClient.getTable(tableId);
          logger.log(`\nTable state after action:`);
          logger.log(`  Phase: ${newState.phase}`);
          logger.log(`  Current bet: ${newState.currentBet}`);
          logger.log(`  Pot: ${newState.pot}`);
        }
      }
    }
    
    logger.minimal('\n✅ Simple game test completed');
  });
});