const API_URL = 'https://primo-poker-server.alabamamike.workers.dev';

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

async function testLeaveAndJoin() {
  console.log('=== TESTING LEAVE AND JOIN ===\n');
  
  try {
    // Step 1: Login both players
    console.log('1. Logging in both players...');
    const player1 = await loginUser(PLAYER1.username, PLAYER1.password);
    const player2 = await loginUser(PLAYER2.username, PLAYER2.password);
    console.log('   Both players logged in ✅');

    // Step 2: Create a new table
    console.log('\n2. Creating new table...');
    const createResponse = await fetch(`${API_URL}/api/tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${player1.token}`
      },
      body: JSON.stringify({
        name: 'Leave and Join Test',
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
    console.log(`   Created table: ${tableId} ✅`);

    // Step 3: Player 1 joins
    console.log('\n3. Player 1 joining table...');
    const join1Response = await fetch(`${API_URL}/api/tables/${tableId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${player1.token}`
      },
      body: JSON.stringify({ buyIn: 100 })
    });
    
    const join1Data = await join1Response.json();
    console.log(`   Join result: ${join1Data.success ? '✅' : '❌'}`);
    if (!join1Data.success) {
      console.log('   Error:', join1Data.error);
    }

    // Step 4: Check table state
    console.log('\n4. Checking table state...');
    const state1Response = await fetch(`${API_URL}/api/tables/${tableId}`, {
      headers: {
        'Authorization': `Bearer ${player1.token}`
      }
    });
    
    const state1Data = await state1Response.json();
    console.log(`   Players at table: ${state1Data.data?.playerCount || 0}`);

    // Step 5: Player 1 leaves
    console.log('\n5. Player 1 leaving table...');
    const leaveResponse = await fetch(`${API_URL}/api/tables/${tableId}/leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${player1.token}`
      }
    });
    
    const leaveData = await leaveResponse.json();
    console.log(`   Leave result: ${leaveData.success ? '✅' : '❌'}`);
    if (!leaveData.success) {
      console.log('   Error:', leaveData.error);
    }

    // Step 6: Check table state after leave
    console.log('\n6. Checking table state after leave...');
    const state2Response = await fetch(`${API_URL}/api/tables/${tableId}`, {
      headers: {
        'Authorization': `Bearer ${player1.token}`
      }
    });
    
    const state2Data = await state2Response.json();
    console.log(`   Players at table: ${state2Data.data?.playerCount || 0}`);

    // Step 7: Player 1 joins again
    console.log('\n7. Player 1 joining table again...');
    const rejoinResponse = await fetch(`${API_URL}/api/tables/${tableId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${player1.token}`
      },
      body: JSON.stringify({ buyIn: 150 })
    });
    
    const rejoinData = await rejoinResponse.json();
    console.log(`   Rejoin result: ${rejoinData.success ? '✅' : '❌'}`);
    if (!rejoinData.success) {
      console.log('   Error:', rejoinData.error);
    }

    // Final state
    console.log('\n8. Final table state...');
    const finalStateResponse = await fetch(`${API_URL}/api/tables/${tableId}`, {
      headers: {
        'Authorization': `Bearer ${player1.token}`
      }
    });
    
    const finalStateData = await finalStateResponse.json();
    console.log(`   Players at table: ${finalStateData.data?.playerCount || 0}`);
    
    console.log('\n=== SUMMARY ===');
    console.log('Leave table functionality:', leaveData.success ? '✅ Working' : '❌ Not working');
    console.log('Rejoin after leave:', rejoinData.success ? '✅ Working' : '❌ Not working');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

testLeaveAndJoin();