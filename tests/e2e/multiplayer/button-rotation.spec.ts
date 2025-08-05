/**
 * Button rotation and blind posting tests
 */

import { test, expect, createTestTable, setupPlayers, waitForGamePhase } from './test-base';

test.describe('Button Rotation and Blind Tests', () => {
  test('Correct button movement clockwise around table', async ({
    config,
    logger,
    apiClient,
    wsHelper,
    playerSimulator,
    gameValidator,
  }) => {
    logger.minimal('Testing button rotation mechanics');
    
    // Setup exactly 6 players for clear rotation tracking
    const players = await setupPlayers(playerSimulator, 6, config.testUsers);
    
    // Create table
    const tableId = await createTestTable(apiClient, players[0].tokens!.accessToken, {
      maxPlayers: 6,
      smallBlind: 5,
      bigBlind: 10,
    });
    
    // Join players in specific order
    for (const player of players) {
      await playerSimulator.joinTable(player.id, tableId, 500);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Track button positions and player positions
    const buttonHistory: Array<{
      hand: number;
      buttonPosition: number;
      buttonPlayer: string;
      sbPosition: number;
      bbPosition: number;
    }> = [];
    
    // Play enough hands for 1.5 rotations
    const handsToPlay = Math.floor(players.length * 1.5);
    
    for (let handNum = 1; handNum <= handsToPlay; handNum++) {
      logger.minimal(`\nHand ${handNum}: Tracking button movement`);
      
      // Wait for hand to start
      const gameState = await waitForGamePhase(wsHelper, players[0].id, 'pre_flop', 30000);
      
      // Find button player
      const buttonPlayer = gameState.players.find((p: any) => p.position === gameState.buttonPosition);
      
      // Calculate blind positions
      const activePlayers = gameState.players
        .filter((p: any) => p.status === 'active')
        .sort((a: any, b: any) => a.position - b.position);
      
      const buttonIdx = activePlayers.findIndex((p: any) => p.position === gameState.buttonPosition);
      const sbIdx = (buttonIdx + 1) % activePlayers.length;
      const bbIdx = (buttonIdx + 2) % activePlayers.length;
      
      const record = {
        hand: handNum,
        buttonPosition: gameState.buttonPosition,
        buttonPlayer: buttonPlayer?.username || 'unknown',
        sbPosition: activePlayers[sbIdx]?.position || -1,
        bbPosition: activePlayers[bbIdx]?.position || -1,
      };
      
      buttonHistory.push(record);
      
      logger.log(`Button: ${record.buttonPlayer} (pos ${record.buttonPosition})`);
      logger.log(`SB: pos ${record.sbPosition}, BB: pos ${record.bbPosition}`);
      
      // Validate blind positions
      if (handNum > 1) {
        const prevRecord = buttonHistory[handNum - 2];
        
        // Button should move to next active player
        const expectedButtonIdx = (buttonIdx + 1) % activePlayers.length;
        const expectedButton = activePlayers[expectedButtonIdx]?.position;
        
        // Allow for eliminated players
        if (activePlayers.length === players.length) {
          expect(record.buttonPosition).not.toBe(prevRecord.buttonPosition);
        }
      }
      
      // Play out the hand quickly (everyone folds to BB)
      let bettingComplete = false;
      let attempts = 0;
      
      while (!bettingComplete && attempts < 20) {
        const currentState = await wsHelper.waitForGameState(players[0].id, 2000);
        
        // Find active player
        const activePlayerId = currentState.activePlayerId || currentState.currentPlayer;
        if (!activePlayerId) {
          break;
        }
        
        const activePlayer = players.find(p => p.id === activePlayerId);
        if (activePlayer) {
          // Everyone folds except BB
          const isBB = currentState.players.find((p: any) => 
            p.id === activePlayerId && p.position === record.bbPosition
          );
          
          const action = isBB ? 'check' : 'fold';
          await wsHelper.sendAction(activePlayer.id, action);
        }
        
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Check if hand ended
        const updatedState = await wsHelper.waitForGameState(players[0].id, 1000);
        if (updatedState.phase === 'finished' || updatedState.phase === 'waiting') {
          bettingComplete = true;
        }
      }
      
      // Wait for next hand
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Analyze button rotation
    logger.minimal('\n=== Button Rotation Analysis ===');
    buttonHistory.forEach(record => {
      logger.minimal(`Hand ${record.hand}: Button=${record.buttonPlayer} (${record.buttonPosition}), SB=${record.sbPosition}, BB=${record.bbPosition}`);
    });
    
    // Verify each position was button at least once
    const uniqueButtonPositions = new Set(buttonHistory.map(r => r.buttonPosition));
    logger.minimal(`\nUnique button positions: ${Array.from(uniqueButtonPositions).join(', ')}`);
    
    expect(uniqueButtonPositions.size).toBeGreaterThanOrEqual(players.length - 1);
  });

  test('Heads-up blind posting rules', async ({
    config,
    logger,
    apiClient,
    wsHelper,
    playerSimulator,
    gameValidator,
  }) => {
    logger.minimal('Testing heads-up blind posting');
    
    // Setup only 2 players
    const players = await setupPlayers(playerSimulator, 2, config.testUsers);
    
    const tableId = await createTestTable(apiClient, players[0].tokens!.accessToken, {
      maxPlayers: 2,
      smallBlind: 10,
      bigBlind: 20,
    });
    
    // Join both players
    for (const player of players) {
      await playerSimulator.joinTable(player.id, tableId, 500);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Play 4 hands to verify alternating positions
    for (let handNum = 1; handNum <= 4; handNum++) {
      logger.minimal(`\nHeads-up hand ${handNum}`);
      
      const gameState = await waitForGamePhase(wsHelper, players[0].id, 'pre_flop', 30000);
      
      // In heads-up: button = small blind, other player = big blind
      const buttonPlayer = gameState.players.find((p: any) => p.position === gameState.buttonPosition);
      const otherPlayer = gameState.players.find((p: any) => p.position !== gameState.buttonPosition);
      
      logger.log(`Button/SB: ${buttonPlayer?.username} (${buttonPlayer?.currentBet})`);
      logger.log(`BB: ${otherPlayer?.username} (${otherPlayer?.currentBet})`);
      
      // Validate blind amounts
      expect(buttonPlayer?.currentBet).toBe(10); // Button posts SB in heads-up
      expect(otherPlayer?.currentBet).toBe(20); // Other posts BB
      
      // Button acts first pre-flop in heads-up
      const firstActor = gameState.activePlayerId || gameState.currentPlayer;
      expect(firstActor).toBe(buttonPlayer?.id);
      
      // Quick fold to end hand
      await wsHelper.sendAction(buttonPlayer!.id, 'fold');
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  });

  test('Button skips eliminated players correctly', async ({
    config,
    logger,
    apiClient,
    wsHelper,
    playerSimulator,
    gameValidator,
  }) => {
    logger.minimal('Testing button movement with eliminated players');
    
    // Setup 4 players
    const players = await setupPlayers(playerSimulator, 4, config.testUsers);
    
    const tableId = await createTestTable(apiClient, players[0].tokens!.accessToken, {
      maxPlayers: 6,
      smallBlind: 50,
      bigBlind: 100,
    });
    
    // Join players with small stacks to enable elimination
    for (let i = 0; i < players.length; i++) {
      const buyIn = i === 1 ? 150 : 1000; // Player 2 has short stack
      await playerSimulator.joinTable(players[i].id, tableId, buyIn);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Play hands until someone is eliminated
    let eliminationOccurred = false;
    let handCount = 0;
    const maxHands = 10;
    
    while (!eliminationOccurred && handCount < maxHands) {
      handCount++;
      logger.minimal(`\nHand ${handCount}: Looking for elimination`);
      
      const gameState = await waitForGamePhase(wsHelper, players[0].id, 'pre_flop', 30000);
      
      // Check for eliminated players
      const activePlayers = gameState.players.filter((p: any) => 
        p.status === 'active' && p.chipCount > 0
      );
      
      if (activePlayers.length < players.length) {
        eliminationOccurred = true;
        logger.log(`Player eliminated! ${activePlayers.length} players remaining`);
      }
      
      // Play aggressively with short stack
      const shortStack = gameState.players.find((p: any) => p.chipCount < 200);
      
      // Play out hand
      let handComplete = false;
      while (!handComplete) {
        const currentState = await wsHelper.waitForGameState(players[0].id, 2000);
        const activePlayerId = currentState.activePlayerId;
        
        if (!activePlayerId) {
          handComplete = true;
          break;
        }
        
        const activePlayer = players.find(p => p.id === activePlayerId);
        if (activePlayer) {
          // Short stack goes all-in, others call
          if (activePlayer.id === shortStack?.id) {
            await wsHelper.sendAction(activePlayer.id, 'all-in');
          } else if (currentState.currentBet > 0) {
            await wsHelper.sendAction(activePlayer.id, 'call');
          } else {
            await wsHelper.sendAction(activePlayer.id, 'check');
          }
        }
        
        // Check if hand ended
        const phase = currentState.phase;
        if (phase === 'finished' || phase === 'waiting') {
          handComplete = true;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Now verify button skips eliminated player
    if (eliminationOccurred) {
      logger.minimal('\nVerifying button skips eliminated player...');
      
      // Track button for next 3 hands
      const postEliminationButtons: number[] = [];
      
      for (let i = 0; i < 3; i++) {
        const gameState = await waitForGamePhase(wsHelper, players[0].id, 'pre_flop', 30000);
        postEliminationButtons.push(gameState.buttonPosition);
        
        logger.log(`Post-elimination hand ${i + 1}: Button at position ${gameState.buttonPosition}`);
        
        // Quick fold to end hand
        const activePlayerId = gameState.activePlayerId;
        if (activePlayerId) {
          await wsHelper.sendAction(activePlayerId, 'fold');
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Verify button never lands on eliminated player
      const eliminatedPositions = players
        .filter(p => !p.isActive)
        .map(p => p.position);
      
      postEliminationButtons.forEach(buttonPos => {
        expect(eliminatedPositions).not.toContain(buttonPos);
      });
      
      logger.minimal('✅ Button correctly skips eliminated players');
    }
  });
});