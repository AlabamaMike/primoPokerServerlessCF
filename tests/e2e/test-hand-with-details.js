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

async function testHandWithDetails() {
  console.log('=== TESTING HAND WITH FULL DETAILS ===\n');
  
  try {
    // Step 1: Login both players
    const player1 = await loginUser(PLAYER1.username, PLAYER1.password);
    const player2 = await loginUser(PLAYER2.username, PLAYER2.password);
    console.log('✅ Both players logged in');

    // Step 2: Create table
    const createResponse = await fetch(`${API_URL}/api/tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${player1.token}`
      },
      body: JSON.stringify({
        name: 'Detailed Test Table',
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
    console.log(`✅ Table created: ${tableId}`);

    // Step 3: Connect WebSockets
    const ws1 = new WebSocket(`${WS_URL}?token=${player1.token}&tableId=${tableId}`);
    const ws2 = new WebSocket(`${WS_URL}?token=${player2.token}&tableId=${tableId}`);
    
    const allMessages = [];
    
    ws1.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      allMessages.push({ player: 1, msg });
      console.log(`\n[P1] ${msg.type}:`, JSON.stringify(msg.data, null, 2));
    });
    
    ws2.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      allMessages.push({ player: 2, msg });
      console.log(`\n[P2] ${msg.type}:`, JSON.stringify(msg.data, null, 2));
    });
    
    // Wait for connections
    await Promise.all([
      new Promise(resolve => ws1.on('open', resolve)),
      new Promise(resolve => ws2.on('open', resolve))
    ]);
    console.log('✅ WebSockets connected');

    // Step 4: Join table with REST API first
    console.log('\n--- JOINING VIA REST API ---');
    
    const join1Response = await fetch(`${API_URL}/api/tables/${tableId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${player1.token}`
      },
      body: JSON.stringify({ buyIn: 100 })
    });
    
    const join1Data = await join1Response.json();
    console.log('P1 REST join:', join1Data);
    
    const join2Response = await fetch(`${API_URL}/api/tables/${tableId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${player2.token}`
      },
      body: JSON.stringify({ buyIn: 100 })
    });
    
    const join2Data = await join2Response.json();
    console.log('P2 REST join:', join2Data);
    
    // Check if game started info is in the response
    if (join2Data.gameStarted) {
      console.log('✅ Game started in REST response');
      console.log('Game state from REST:', JSON.stringify(join2Data.gameState, null, 2));
    }
    
    // Wait for WebSocket updates
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Now also join via WebSocket to ensure we're connected
    console.log('\n--- JOINING VIA WEBSOCKET ---');
    
    ws1.send(JSON.stringify({
      type: 'join_table',
      payload: {
        playerId: player1.userId,
        username: player1.username,
        chipCount: 100
      }
    }));
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    ws2.send(JSON.stringify({
      type: 'join_table',
      payload: {
        playerId: player2.userId,
        username: player2.username,
        chipCount: 100
      }
    }));
    
    // Wait for game updates
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Close connections
    ws1.close();
    ws2.close();
    
    // Analyze results
    console.log('\n=== MESSAGE ANALYSIS ===');
    console.log(`Total messages: ${allMessages.length}`);
    
    const gameStartedMessages = allMessages.filter(m => m.msg.type === 'game_started');
    const holeCardMessages = allMessages.filter(m => m.msg.type === 'hole_cards');
    const errorMessages = allMessages.filter(m => m.msg.type === 'error');
    
    console.log(`Game started messages: ${gameStartedMessages.length}`);
    console.log(`Hole card messages: ${holeCardMessages.length}`);
    console.log(`Error messages: ${errorMessages.length}`);
    
    if (errorMessages.length > 0) {
      console.log('\nErrors found:');
      errorMessages.forEach(e => {
        console.log(`[P${e.player}] Error:`, e.msg.data);
      });
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

testHandWithDetails();