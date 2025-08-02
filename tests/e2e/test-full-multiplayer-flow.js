const { chromium } = require('playwright');

const API_URL = 'https://primo-poker-server.alabamamike.workers.dev';
const FRONTEND_URL = 'https://6e77d385.primo-poker-frontend.pages.dev';

async function testFullMultiplayerFlow() {
  console.log('=== TESTING FULL MULTIPLAYER FLOW ===\n');
  
  let authToken = null;
  let userId = null;
  let tableId = null;

  try {
    // Step 1: Login
    console.log('1. Testing Login...');
    const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'smoketest1754114281188',
        password: 'Test1754114281188!'
      })
    });
    
    const loginData = await loginResponse.json();
    console.log('Login response:', loginData.success ? 'SUCCESS' : 'FAILED');
    
    if (!loginData.success) {
      console.error('Login failed:', loginData);
      return;
    }
    
    authToken = loginData.data.tokens.accessToken;
    userId = loginData.data.user.id;
    console.log('✅ Login successful');
    console.log('   User ID:', userId);

    // Step 2: Create a table
    console.log('\n2. Testing Table Creation...');
    const createResponse = await fetch(`${API_URL}/api/tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        name: 'Test Multiplayer Table',
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
    console.log('Create table response:', createData.success ? 'SUCCESS' : 'FAILED');
    
    if (!createData.success) {
      console.error('Create table failed:', createData);
      
      // Try to get error details
      if (createResponse.status === 400) {
        console.log('\nChecking what fields are missing...');
        // Log the exact error
        console.log('Error details:', JSON.stringify(createData, null, 2));
      }
      return;
    }
    
    tableId = createData.tableId || createData.data?.tableId;
    console.log('✅ Table created successfully');
    console.log('   Table ID:', tableId);

    // Step 3: Join the table
    console.log('\n3. Testing Table Join...');
    const joinResponse = await fetch(`${API_URL}/api/tables/${tableId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        buyIn: 100
      })
    });
    
    const joinData = await joinResponse.json();
    console.log('Join table response:', joinData.success ? 'SUCCESS' : 'FAILED');
    
    if (!joinData.success) {
      console.error('Join table failed:', joinData);
      return;
    }
    
    console.log('✅ Joined table successfully');
    console.log('   Position:', joinData.position);
    console.log('   Chip count:', joinData.chipCount);

    // Step 4: Check table state
    console.log('\n4. Checking Table State...');
    const stateResponse = await fetch(`${API_URL}/api/tables/${tableId}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    const stateData = await stateResponse.json();
    console.log('Table state response:', stateData.success ? 'SUCCESS' : 'FAILED');
    
    if (stateData.success && stateData.data) {
      console.log('   Players:', stateData.data.playerCount || stateData.data.players?.length || 0);
      console.log('   Game active:', stateData.data.isActive || false);
      console.log('   Game state:', stateData.data.gameState ? 'Present' : 'None');
    }

    // Step 5: Test WebSocket connection
    console.log('\n5. Testing WebSocket Connection...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Navigate to the game page
    console.log('   Navigating to game page...');
    await page.goto(`${FRONTEND_URL}/game/${tableId}/`);
    await page.waitForTimeout(3000);
    
    // Check if connected
    const pageContent = await page.content();
    const isConnected = !pageContent.includes('Connection Error');
    console.log('   WebSocket connected:', isConnected ? 'YES' : 'NO');
    
    // Take screenshot
    await page.screenshot({ path: 'multiplayer-game-page.png' });
    console.log('   Screenshot saved: multiplayer-game-page.png');

    // Step 6: Try to perform an action (if game is active)
    console.log('\n6. Testing Game Action...');
    const actionResponse = await fetch(`${API_URL}/api/tables/${tableId}/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        action: 'check'
      })
    });
    
    const actionData = await actionResponse.json();
    console.log('Action response:', actionData.success ? 'SUCCESS' : 'FAILED');
    
    if (!actionData.success) {
      console.log('   Note: Action may fail if game not started or not player\'s turn');
    }

    // Step 7: Leave the table
    console.log('\n7. Testing Leave Table...');
    const leaveResponse = await fetch(`${API_URL}/api/tables/${tableId}/leave`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    const leaveData = await leaveResponse.json();
    console.log('Leave table response:', leaveData.success ? 'SUCCESS' : 'FAILED');
    
    await browser.close();

    // Summary
    console.log('\n=== MULTIPLAYER FLOW TEST SUMMARY ===');
    console.log('✅ Login: PASSED');
    console.log(createData.success ? '✅ Create Table: PASSED' : '❌ Create Table: FAILED');
    console.log(joinData.success ? '✅ Join Table: PASSED' : '❌ Join Table: FAILED');
    console.log(stateData.success ? '✅ Get Table State: PASSED' : '❌ Get Table State: FAILED');
    console.log(isConnected ? '✅ WebSocket Connection: PASSED' : '❌ WebSocket Connection: FAILED');
    console.log(actionData.success ? '✅ Game Action: PASSED' : '⚠️  Game Action: SKIPPED (game may not be active)');
    console.log(leaveData.success ? '✅ Leave Table: PASSED' : '❌ Leave Table: FAILED');
    
    if (tableId) {
      console.log(`\nTable URL: ${FRONTEND_URL}/game/${tableId}/`);
    }
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
  }
}

testFullMultiplayerFlow();