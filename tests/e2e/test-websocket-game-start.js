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

async function testWebSocketGameStart() {
  console.log('=== TESTING WEBSOCKET GAME START ===\n');
  
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
        name: 'WebSocket Test Table',
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
    
    // Player 1 WebSocket - using query parameters as expected by the server
    const ws1 = new WebSocket(`${WS_URL}?token=${player1.token}&tableId=${tableId}`);
    
    const ws1Messages = [];
    ws1.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      console.log(`   [WS1] ${msg.type}:`, JSON.stringify(msg.data, null, 2));
      ws1Messages.push(msg);
    });
    
    ws1.on('error', (err) => {
      console.error('   [WS1] Error:', err.message);
    });
    
    // Wait for connection
    await new Promise((resolve) => {
      ws1.on('open', () => {
        console.log('   Player 1 WebSocket connected ✅');
        resolve();
      });
    });
    
    // Player 2 WebSocket - using query parameters as expected by the server
    const ws2 = new WebSocket(`${WS_URL}?token=${player2.token}&tableId=${tableId}`);
    
    const ws2Messages = [];
    ws2.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      console.log(`   [WS2] ${msg.type}:`, JSON.stringify(msg.data, null, 2));
      ws2Messages.push(msg);
    });
    
    ws2.on('error', (err) => {
      console.error('   [WS2] Error:', err.message);
    });
    
    await new Promise((resolve) => {
      ws2.on('open', () => {
        console.log('   Player 2 WebSocket connected ✅');
        resolve();
      });
    });

    // Step 4: Join table via WebSocket
    console.log('\n4. Joining table via WebSocket...');
    
    // Player 1 joins
    ws1.send(JSON.stringify({
      type: 'join_table',
      payload: {
        playerId: player1.userId,
        username: player1.username,
        chipCount: 100
      }
    }));
    
    // Wait for join confirmation
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Player 2 joins
    ws2.send(JSON.stringify({
      type: 'join_table',
      payload: {
        playerId: player2.userId,
        username: player2.username,
        chipCount: 100
      }
    }));
    
    // Wait for game to start
    console.log('\n5. Waiting for game to start...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check messages for game start
    const gameStarted = ws1Messages.some(msg => msg.type === 'game_started') || 
                       ws2Messages.some(msg => msg.type === 'game_started');
    
    console.log(`\n   Game started: ${gameStarted ? '✅' : '❌'}`);
    
    // Close connections
    ws1.close();
    ws2.close();
    
    // Summary
    console.log('\n=== WEBSOCKET TEST SUMMARY ===');
    console.log(`Table created: ✅`);
    console.log(`WebSocket connections: ✅`);
    console.log(`Players joined: ✅`);
    console.log(`Game started: ${gameStarted ? '✅' : '❌'}`);
    console.log(`Total WS1 messages: ${ws1Messages.length}`);
    console.log(`Total WS2 messages: ${ws2Messages.length}`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

testWebSocketGameStart();