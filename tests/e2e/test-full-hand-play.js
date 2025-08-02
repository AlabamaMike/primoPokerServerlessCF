const WebSocket = require('ws');

const API_URL = 'https://primo-poker-server.alabamamike.workers.dev';
const WS_URL = 'wss://primo-poker-server.alabamamike.workers.dev';

// Test users
const PLAYER1 = {
  username: 'smoketest1754114281188',
  password: 'Test1754114281188!'
};

const PLAYER2 = {
  username: 'testuser2',
  password: 'TestPassword123!'
};

async function loginUser(username, password) {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  
  const data = await response.json();
  if (!data.success) {
    throw new Error(`Failed to login ${username}: ${JSON.stringify(data)}`);
  }
  
  return {
    token: data.data.tokens.accessToken,
    userId: data.data.user.id,
    username: data.data.user.username
  };
}

async function testFullHandPlay() {
  console.log('=== TESTING FULL HAND PLAY ===\n');
  
  try {
    // Step 1: Login both players
    console.log('1. Logging in both players...');
    const player1 = await loginUser(PLAYER1.username, PLAYER1.password);
    const player2 = await loginUser(PLAYER2.username, PLAYER2.password);
    console.log('   Both players logged in ✅');

    // Step 2: Create table
    console.log('\n2. Creating table...');
    const createResponse = await fetch(`${API_URL}/api/tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${player1.token}`
      },
      body: JSON.stringify({
        name: 'Full Hand Test Table',
        gameType: 'texas_holdem',
        bettingStructure: 'no_limit',
        gameFormat: 'cash',
        maxPlayers: 6,
        minBuyIn: 40,
        maxBuyIn: 200,
        smallBlind: 1,
        bigBlind: 2
      })
    });
    
    const createData = await createResponse.json();
    const tableId = createData.data?.tableId || createData.tableId;
    console.log(`   Table created: ${tableId} ✅`);

    // Step 3: Connect WebSockets
    console.log('\n3. Connecting WebSockets...');
    
    // Player 1 WebSocket
    const ws1 = new WebSocket(`${WS_URL}?token=${player1.token}&tableId=${tableId}`);
    
    const player1State = {
      messages: [],
      holeCards: null,
      gameStarted: false
    };
    
    ws1.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      player1State.messages.push(msg);
      
      if (msg.type === 'hole_cards') {
        player1State.holeCards = msg.data.cards;
        console.log(`   [P1] Received hole cards: ${JSON.stringify(msg.data.cards)}`);
      } else if (msg.type === 'game_started') {
        player1State.gameStarted = true;
      }
      
      console.log(`   [P1] ${msg.type}`);
    });
    
    await new Promise((resolve) => {
      ws1.on('open', () => {
        console.log('   Player 1 WebSocket connected ✅');
        resolve();
      });
    });
    
    // Player 2 WebSocket
    const ws2 = new WebSocket(`${WS_URL}?token=${player2.token}&tableId=${tableId}`);
    
    const player2State = {
      messages: [],
      holeCards: null,
      gameStarted: false
    };
    
    ws2.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      player2State.messages.push(msg);
      
      if (msg.type === 'hole_cards') {
        player2State.holeCards = msg.data.cards;
        console.log(`   [P2] Received hole cards: ${JSON.stringify(msg.data.cards)}`);
      } else if (msg.type === 'game_started') {
        player2State.gameStarted = true;
      }
      
      console.log(`   [P2] ${msg.type}`);
    });
    
    await new Promise((resolve) => {
      ws2.on('open', () => {
        console.log('   Player 2 WebSocket connected ✅');
        resolve();
      });
    });

    // Step 4: Join table
    console.log('\n4. Both players joining table...');
    
    ws1.send(JSON.stringify({
      type: 'join_table',
      payload: {
        playerId: player1.userId,
        username: player1.username,
        chipCount: 100
      }
    }));
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    ws2.send(JSON.stringify({
      type: 'join_table',
      payload: {
        playerId: player2.userId,
        username: player2.username,
        chipCount: 100
      }
    }));
    
    // Wait for game to start
    console.log('\n5. Waiting for game to start and hole cards...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check game state
    const latestStateMsg = player1State.messages.findLast(m => m.type === 'table_state_update');
    const gameState = latestStateMsg?.data?.gameState;
    
    console.log('\n   Game State Check:');
    console.log(`   - Game started: ${player1State.gameStarted ? '✅' : '❌'}`);
    console.log(`   - P1 hole cards: ${player1State.holeCards ? '✅' : '❌'}`);
    console.log(`   - P2 hole cards: ${player2State.holeCards ? '✅' : '❌'}`);
    console.log(`   - Game phase: ${gameState?.phase || 'Not started'}`);
    console.log(`   - Pot: ${gameState?.pot || 0}`);
    console.log(`   - Current bet: ${gameState?.currentBet || 0}`);
    console.log(`   - Active player: ${gameState?.currentPlayer === player1.userId ? 'Player 1' : 'Player 2'}`);
    
    // Step 6: Play a hand
    console.log('\n6. Playing the hand...');
    
    // Determine who should act first
    const isPlayer1Turn = gameState?.currentPlayer === player1.userId;
    const activeWs = isPlayer1Turn ? ws1 : ws2;
    const activePlayer = isPlayer1Turn ? player1 : player2;
    
    console.log(`   ${isPlayer1Turn ? 'Player 1' : 'Player 2'} to act first`);
    
    // First action: Call
    activeWs.send(JSON.stringify({
      type: 'player_action',
      payload: {
        playerId: activePlayer.userId,
        action: 'call'
      }
    }));
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Second player: Check
    const secondWs = isPlayer1Turn ? ws2 : ws1;
    const secondPlayer = isPlayer1Turn ? player2 : player1;
    
    secondWs.send(JSON.stringify({
      type: 'player_action',
      payload: {
        playerId: secondPlayer.userId,
        action: 'check'
      }
    }));
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if we moved to flop
    const flopStateMsg = player1State.messages.findLast(m => m.type === 'table_state_update');
    const flopState = flopStateMsg?.data?.gameState;
    
    console.log(`\n   Post-preflop State:`);
    console.log(`   - Phase: ${flopState?.phase}`);
    console.log(`   - Community cards: ${JSON.stringify(flopState?.communityCards)}`);
    console.log(`   - Pot: ${flopState?.pot}`);
    
    // Close connections
    ws1.close();
    ws2.close();
    
    // Summary
    console.log('\n=== FULL HAND TEST SUMMARY ===');
    console.log(`Game started: ${player1State.gameStarted ? '✅' : '❌'}`);
    console.log(`Hole cards dealt: ${(player1State.holeCards && player2State.holeCards) ? '✅' : '❌'}`);
    console.log(`Pre-flop betting: ${flopState?.phase !== 'pre_flop' ? '✅' : '❌'}`);
    console.log(`Flop dealt: ${(flopState?.communityCards?.length >= 3) ? '✅' : '❌'}`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testFullHandPlay();