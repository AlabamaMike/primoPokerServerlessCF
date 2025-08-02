const API_URL = 'https://primo-poker-server.alabamamike.workers.dev';

// Test user
const TEST_USER = {
  username: 'smoketest1754114281188',
  password: 'Test1754114281188!'
};

async function loginUser(username, password) {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  
  const data = await response.json();
  if (!data.success) {
    throw new Error(`Failed to login: ${JSON.stringify(data)}`);
  }
  
  return {
    token: data.data.tokens.accessToken,
    userId: data.data.user.id,
    username: data.data.user.username
  };
}

async function testJoinTableError() {
  console.log('=== TESTING JOIN TABLE ERROR ===\n');
  
  try {
    // Step 1: Login
    console.log('1. Logging in...');
    const user = await loginUser(TEST_USER.username, TEST_USER.password);
    console.log(`   Logged in as ${user.username} ✅`);

    // Step 2: Get existing tables
    console.log('\n2. Getting table list...');
    const tablesResponse = await fetch(`${API_URL}/api/tables`, {
      headers: {
        'Authorization': `Bearer ${user.token}`
      }
    });
    
    const tablesData = await tablesResponse.json();
    console.log(`   Found ${tablesData.data?.length || 0} tables`);
    
    let tableId;
    
    if (tablesData.data && tablesData.data.length > 0) {
      // Use existing table
      tableId = tablesData.data[0].tableId;
      console.log(`   Using existing table: ${tableId}`);
    } else {
      // Create new table
      console.log('\n3. Creating new table...');
      const createResponse = await fetch(`${API_URL}/api/tables`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({
          name: 'Join Error Test Table',
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
      tableId = createData.data?.tableId || createData.tableId;
      console.log(`   Created table: ${tableId} ✅`);
    }

    // Step 3: Try different join scenarios
    console.log('\n4. Testing join scenarios...');
    
    // Test 1: Join with valid buy-in
    console.log('\n   Test 1: Valid buy-in (100)');
    const join1Response = await fetch(`${API_URL}/api/tables/${tableId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user.token}`
      },
      body: JSON.stringify({ buyIn: 100 })
    });
    
    const join1Data = await join1Response.json();
    console.log('   Response:', JSON.stringify(join1Data, null, 2));
    console.log('   Status:', join1Response.status);
    
    // Test 2: Try to join again (should fail)
    console.log('\n   Test 2: Join again (should fail)');
    const join2Response = await fetch(`${API_URL}/api/tables/${tableId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user.token}`
      },
      body: JSON.stringify({ buyIn: 100 })
    });
    
    const join2Data = await join2Response.json();
    console.log('   Response:', JSON.stringify(join2Data, null, 2));
    
    // Test 3: Join with invalid buy-in
    console.log('\n   Test 3: Invalid buy-in (10 - below minimum)');
    const join3Response = await fetch(`${API_URL}/api/tables/${tableId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user.token}`
      },
      body: JSON.stringify({ buyIn: 10 })
    });
    
    const join3Data = await join3Response.json();
    console.log('   Response:', JSON.stringify(join3Data, null, 2));
    
    // Step 4: Check table state
    console.log('\n5. Checking final table state...');
    const stateResponse = await fetch(`${API_URL}/api/tables/${tableId}`, {
      headers: {
        'Authorization': `Bearer ${user.token}`
      }
    });
    
    const stateData = await stateResponse.json();
    if (stateData.success) {
      console.log(`   Players at table: ${stateData.data.playerCount || stateData.data.players?.length || 0}`);
      console.log(`   Table active: ${stateData.data.isActive ? 'YES' : 'NO'}`);
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

testJoinTableError();