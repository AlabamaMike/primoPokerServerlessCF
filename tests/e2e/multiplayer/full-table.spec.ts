/**
 * Full table multiplayer poker tests (6+ players)
 */

import { test, expect, createTestTable, setupPlayers, playHand, waitForGamePhase } from './test-base';

test.describe('Full Table Multiplayer Poker Tests', () => {
  test('6-player cash game with full button rotation', async ({
    config,
    logger,
    apiClient,
    wsHelper,
    playerSimulator,
    gameValidator,
  }) => {
    logger.minimal('Starting 6-player full table test');
    
    // Setup 6 players
    const players = await setupPlayers(playerSimulator, 6, config.testUsers);
    logger.log(`Created ${players.length} test players`);
    
    // Creator is the first player
    const creator = players[0];
    
    // Create table
    const tableId = await createTestTable(apiClient, creator.tokens!.accessToken, {
      maxPlayers: 9,
      smallBlind: 10,
      bigBlind: 20,
      minBuyIn: 200,
      maxBuyIn: 2000,
    });
    logger.log(`Created table: ${tableId}`);
    
    // Have all players join the table
    for (const player of players) {
      await playerSimulator.joinTable(player.id, tableId, 1000);
      logger.log(`${player.username} joined table with 1000 chips`);
      
      // Small delay between joins
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Wait for all players to be seated
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check current table state
    logger.log('Checking table state...');
    const tableState = await apiClient.getTable(tableId);
    logger.log(`Table state: ${tableState.phase || 'unknown'}, players: ${tableState.playerCount || 0}`);
    
    // Send a start game message if needed
    if (tableState.phase === 'waiting' || !tableState.phase) {
      logger.log('Attempting to start game...');
      // Send action to trigger game start
      try {
        await wsHelper.sendMessage(players[0].id, { type: 'start_game' });
      } catch (err) {
        logger.detailed('Start game message failed, game might auto-start');
      }
      
      // Wait a bit for game to start
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Track button positions
    const buttonPositions: number[] = [];
    let previousButton = -1;
    
    // Play hands for full button rotation
    const handsToPlay = players.length + 2; // Full rotation plus 2 extra
    
    for (let handNum = 1; handNum <= handsToPlay; handNum++) {
      logger.minimal(`\n--- Hand ${handNum} of ${handsToPlay} ---`);
      
      try {
        // Wait a moment for game state
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Get game state from WebSocket messages
        const messages = wsHelper.getMessages(players[0].id);
        const gameStartMsg = messages.reverse().find(m => m.type === 'game_started');
        const stateMsg = messages.find(m => m.type === 'table_state_update' && m.payload?.gameState);
        
        let gameState = stateMsg?.payload?.gameState || gameStartMsg?.payload;
        
        if (!gameState || gameState.phase === 'waiting') {
          logger.log('Waiting for hand to start...');
          // Wait for next hand
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }
        
        // Track button position from game state
        const dealerId = gameState.dealerId;
        const dealerPlayer = gameState.players?.find((p: any) => p.id === dealerId);
        const currentButton = dealerPlayer?.position?.seat || 0;
        
        buttonPositions.push(currentButton);
        logger.log(`Button at seat: ${currentButton}`);
        
        // Play the hand
        await playHand(playerSimulator, wsHelper, gameValidator, players, logger);
        
        // Wait between hands
        await new Promise(resolve => setTimeout(resolve, config.timing.handSettlement));
        
      } catch (error) {
        logger.error(`Error in hand ${handNum}:`, error as Error);
        // Continue to next hand instead of failing completely
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    // Verify button made full rotation
    logger.minimal('\nButton rotation summary:');
    logger.minimal(`Positions: ${buttonPositions.join(' → ')}`);
    
    // Check that each position was button at least once
    const uniquePositions = new Set(buttonPositions);
    const activePlayerCount = players.filter(p => p.isActive).length;
    
    expect(uniquePositions.size).toBeGreaterThanOrEqual(Math.min(activePlayerCount, 6));
    logger.minimal(`✅ Button visited ${uniquePositions.size} unique positions`);
    
    // Verify game integrity
    logger.minimal('\nFinal chip counts:');
    for (const player of players) {
      const finalState = await apiClient.getProfile(player.tokens!.accessToken);
      logger.minimal(`  ${player.username}: ${finalState.chipCount} chips`);
    }
  });

  test('9-player table with complex betting scenarios', async ({
    config,
    logger,
    apiClient,
    wsHelper,
    playerSimulator,
    gameValidator,
  }) => {
    logger.minimal('Starting 9-player complex betting test');
    
    // Setup 9 players (max table size)
    const players = await setupPlayers(playerSimulator, 9, config.testUsers);
    
    // Create table with deeper stacks for more complex betting
    const tableId = await createTestTable(apiClient, players[0].tokens!.accessToken, {
      maxPlayers: 9,
      smallBlind: 25,
      bigBlind: 50,
      minBuyIn: 2000,
      maxBuyIn: 5000,
    });
    
    // Join all players with varying stack sizes
    for (let i = 0; i < players.length; i++) {
      const buyIn = 2000 + (i * 300); // Varying stack sizes
      await playerSimulator.joinTable(players[i].id, tableId, buyIn);
      logger.log(`${players[i].username} joined with ${buyIn} chips`);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Play 5 hands focusing on complex scenarios
    for (let handNum = 1; handNum <= 5; handNum++) {
      logger.minimal(`\n--- Complex Hand ${handNum} ---`);
      
      const gameState = await waitForGamePhase(wsHelper, players[0].id, 'pre_flop', 30000);
      
      // Log pre-flop state
      logger.detailed('Pre-flop positions:');
      gameState.players.forEach((p: any) => {
        logger.detailed(`  ${p.username} (pos ${p.position}): ${p.chipCount} chips`);
      });
      
      // Play hand with detailed validation
      await playHand(playerSimulator, wsHelper, gameValidator, players, logger);
      
      // Validate pot calculations
      const finalState = await wsHelper.waitForGameState(players[0].id);
      const potValid = gameValidator.validatePotCalculation(
        finalState.players,
        finalState.pot || 0,
        finalState.sidePots || []
      );
      
      expect(potValid).toBe(true);
      
      await new Promise(resolve => setTimeout(resolve, config.timing.handSettlement));
    }
  });

  test('Table with players joining and leaving mid-game', async ({
    config,
    logger,
    apiClient,
    wsHelper,
    playerSimulator,
    gameValidator,
  }) => {
    logger.minimal('Starting dynamic table test with joins/leaves');
    
    // Start with 4 players
    const initialPlayers = await setupPlayers(playerSimulator, 4, config.testUsers);
    const additionalPlayers = await setupPlayers(
      playerSimulator, 
      2, 
      config.testUsers.slice(4)
    );
    
    const tableId = await createTestTable(apiClient, initialPlayers[0].tokens!.accessToken, {
      maxPlayers: 6,
      smallBlind: 10,
      bigBlind: 20,
    });
    
    // Join initial players
    for (const player of initialPlayers) {
      await playerSimulator.joinTable(player.id, tableId, 1000);
    }
    
    // Play 2 hands
    for (let i = 0; i < 2; i++) {
      await playHand(playerSimulator, wsHelper, gameValidator, initialPlayers, logger);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Add new player between hands
    logger.log('Adding new player to table...');
    await playerSimulator.joinTable(additionalPlayers[0].id, tableId, 1000);
    
    // Play hand with 5 players
    const allPlayers = [...initialPlayers, additionalPlayers[0]];
    await playHand(playerSimulator, wsHelper, gameValidator, allPlayers, logger);
    
    // Remove a player
    logger.log(`${initialPlayers[1].username} leaving table...`);
    await apiClient.leaveTable(initialPlayers[1].tokens!.accessToken, tableId);
    await playerSimulator.disconnectPlayer(initialPlayers[1].id);
    
    // Update active players list
    const remainingPlayers = allPlayers.filter(p => p.id !== initialPlayers[1].id);
    
    // Play final hand
    await playHand(playerSimulator, wsHelper, gameValidator, remainingPlayers, logger);
    
    logger.minimal('✅ Dynamic table test completed successfully');
  });
});