const API_URL = 'https://primo-poker-server.alabamamike.workers.dev';

// Create a new test user with timestamp to ensure uniqueness
const timestamp = Date.now();
const TEST_USER = {
  username: `testuser${timestamp}`,
  email: `testuser${timestamp}@test.com`,
  password: 'TestPassword123!'
};

async function testFreshLogin() {
  console.log('=== TESTING FRESH LOGIN AND JOIN ===\n');
  
  try {
    // Step 1: Register new user
    console.log('1. Registering new user...');
    const registerResponse = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_USER)
    });
    
    const registerData = await registerResponse.json();
    if (!registerData.success) {
      throw new Error(`Registration failed: ${JSON.stringify(registerData)}`);
    }
    console.log(`   Registered: ${TEST_USER.username} ✅`);

    // Step 2: Login
    console.log('\n2. Logging in...');
    const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: TEST_USER.username,
        password: TEST_USER.password
      })
    });
    
    const loginData = await loginResponse.json();
    if (!loginData.success) {
      throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
    }
    
    const token = loginData.data.tokens.accessToken;
    console.log(`   Logged in with fresh token ✅`);

    // Step 3: Create table
    console.log('\n3. Creating table...');
    const createResponse = await fetch(`${API_URL}/api/tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: 'Fresh Token Test Table',
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
    if (!createData.success) {
      console.log('Create failed:', createData);
      throw new Error(`Failed to create table: ${JSON.stringify(createData)}`);
    }
    
    const tableId = createData.data?.tableId || createData.tableId;
    console.log(`   Created table: ${tableId} ✅`);

    // Step 4: Join table
    console.log('\n4. Joining table with fresh token...');
    const joinResponse = await fetch(`${API_URL}/api/tables/${tableId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ buyIn: 100 })
    });
    
    const joinData = await joinResponse.json();
    console.log('   Join response:', JSON.stringify(joinData, null, 2));
    
    if (joinData.success) {
      console.log('   ✅ Successfully joined table with fresh token!');
    } else {
      console.log('   ❌ Join failed:', joinData.error);
    }

    // Step 5: Leave table
    console.log('\n5. Leaving table...');
    const leaveResponse = await fetch(`${API_URL}/api/tables/${tableId}/leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    const leaveData = await leaveResponse.json();
    console.log(`   Leave result: ${leaveData.success ? '✅' : '❌'}`);

    console.log('\n=== SUMMARY ===');
    console.log('Fresh token works:', joinData.success ? '✅ YES' : '❌ NO');
    console.log('\nThe UI issue is likely due to:');
    console.log('1. Old/expired tokens stored in localStorage');
    console.log('2. Users need to log out and log back in to get fresh tokens');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

testFreshLogin();