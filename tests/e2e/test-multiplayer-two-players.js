const { chromium } = require('playwright');

const API_URL = 'https://primo-poker-server.alabamamike.workers.dev';
const FRONTEND_URL = 'https://6e77d385.primo-poker-frontend.pages.dev';

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
    // Try to register if login fails
    console.log(`Login failed for ${username}, trying to register...`);
    const registerResponse = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
        email: `${username}@test.com`
      })
    });
    
    const registerData = await registerResponse.json();
    if (!registerData.success) {
      throw new Error(`Failed to register ${username}: ${JSON.stringify(registerData)}`);
    }
    
    // Try login again
    return loginUser(username, password);
  }
  
  return {
    token: data.data.tokens.accessToken,
    userId: data.data.user.id,
    username: data.data.user.username
  };
}

async function testTwoPlayerGame() {
  console.log('=== TESTING TWO PLAYER MULTIPLAYER GAME ===\n');
  
  try {
    // Step 1: Login both players
    console.log('1. Logging in both players...');
    const player1 = await loginUser(PLAYER1.username, PLAYER1.password);
    console.log(`   Player 1 (${player1.username}): ✅`);
    
    const player2 = await loginUser(PLAYER2.username, PLAYER2.password);
    console.log(`   Player 2 (${player2.username}): ✅`);

    // Step 2: Player 1 creates a table
    console.log('\n2. Player 1 creating table...');
    const createResponse = await fetch(`${API_URL}/api/tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${player1.token}`
      },
      body: JSON.stringify({
        name: 'Two Player Test Table',
        gameType: 'texas_holdem',
        bettingStructure: 'no_limit',
        gameFormat: 'cash',
        maxPlayers: 6,
        minBuyIn: 40,
        maxBuyIn: 200,
        smallBlind: 1,
        bigBlind: 2,
        ante: 0,
        timeBank: 30,
        isPrivate: false
      })
    });
    
    const createData = await createResponse.json();
    console.log('   Create response:', JSON.stringify(createData, null, 2));
    
    if (!createData.success) {
      throw new Error(`Failed to create table: ${JSON.stringify(createData)}`);
    }
    
    const tableId = createData.data?.tableId || createData.tableId;
    if (!tableId) {
      throw new Error('No tableId in response');
    }
    console.log(`   Table created: ${tableId} ✅`);

    // Step 3: Both players join the table
    console.log('\n3. Both players joining table...');
    
    // Player 1 joins
    const join1Response = await fetch(`${API_URL}/api/tables/${tableId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${player1.token}`
      },
      body: JSON.stringify({ buyIn: 100 })
    });
    
    const join1Data = await join1Response.json();
    console.log(`   Player 1 join: ${join1Data.success ? '✅' : '❌'}`);
    
    // Player 2 joins
    const join2Response = await fetch(`${API_URL}/api/tables/${tableId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${player2.token}`
      },
      body: JSON.stringify({ buyIn: 100 })
    });
    
    const join2Data = await join2Response.json();
    console.log(`   Player 2 join: ${join2Data.success ? '✅' : '❌'}`);

    // Step 4: Check table state
    console.log('\n4. Checking table state...');
    const stateResponse = await fetch(`${API_URL}/api/tables/${tableId}`, {
      headers: {
        'Authorization': `Bearer ${player1.token}`
      }
    });
    
    const stateData = await stateResponse.json();
    if (stateData.success) {
      const state = stateData.data;
      console.log(`   Players at table: ${state.playerCount || state.players?.length || 0}`);
      console.log(`   Game active: ${state.isActive ? 'YES' : 'NO'}`);
      console.log(`   Game phase: ${state.gameState?.phase || 'Not started'}`);
      
      if (state.players && Array.isArray(state.players)) {
        state.players.forEach(p => {
          console.log(`   - ${p.username}: ${p.chipCount} chips at seat ${p.position?.seat}`);
        });
      }
    }

    // Step 5: Test with browsers to check WebSocket and UI
    console.log('\n5. Opening browsers for both players...');
    const browser = await chromium.launch({ headless: true });
    
    // Player 1 browser
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    
    // Navigate directly to lobby with auth token
    await page1.goto(`${FRONTEND_URL}/lobby`);
    await page1.evaluate((token) => {
      localStorage.setItem('auth_token', token);
    }, player1.token);
    await page1.reload();
    
    await page1.waitForTimeout(2000);
    await page1.screenshot({ path: 'two-player-test-player1.png' });
    console.log('   Player 1 screenshot saved');
    
    // Check if game started
    console.log('\n6. Waiting for game to start (need 2+ players)...');
    await page1.waitForTimeout(3000);
    
    // Try an action
    console.log('\n7. Testing game action...');
    const actionResponse = await fetch(`${API_URL}/api/tables/${tableId}/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${player1.token}`
      },
      body: JSON.stringify({
        action: 'check'
      })
    });
    
    const actionData = await actionResponse.json();
    console.log(`   Action result: ${actionData.success ? 'SUCCESS' : 'FAILED'}`);
    if (!actionData.success && actionData.error) {
      console.log(`   Error: ${actionData.error.message || actionData.error}`);
    }
    
    await browser.close();
    
    // Summary
    console.log('\n=== TWO PLAYER GAME TEST SUMMARY ===');
    console.log(`Table created: ✅`);
    console.log(`Both players joined: ${join1Data.success && join2Data.success ? '✅' : '❌'}`);
    console.log(`Table has 2 players: ${(stateData.data?.playerCount === 2) ? '✅' : '❌'}`);
    console.log(`Game started automatically: ${stateData.data?.isActive ? '✅' : '❌'}`);
    console.log(`\nTable URL: ${FRONTEND_URL}/game/${tableId}/`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

testTwoPlayerGame();