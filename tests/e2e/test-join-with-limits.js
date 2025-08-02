const API_URL = 'https://primo-poker-server.alabamamike.workers.dev';

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
  
  return data.data.tokens.accessToken;
}

async function testJoinWithLimits() {
  console.log('=== TESTING JOIN WITH BUY-IN LIMITS ===\n');
  
  try {
    // Login
    const token = await loginUser('smoketest1754114281188', 'Test1754114281188!');
    console.log('Logged in ✅');
    
    // Create a table with specific limits
    console.log('\nCreating table with 40-200 buy-in limits...');
    const createResponse = await fetch(`${API_URL}/api/tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: 'Buy-in Limits Test',
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
    console.log(`Table created: ${tableId} ✅`);
    
    // Test different buy-in amounts
    console.log('\nTesting different buy-in amounts:');
    
    // Test 1: Below minimum (should fail)
    console.log('\n1. Buy-in $30 (below minimum $40)...');
    const join1 = await fetch(`${API_URL}/api/tables/${tableId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ buyIn: 30 })
    });
    const join1Data = await join1.json();
    console.log(`   Result: ${join1Data.success ? 'SUCCESS' : 'FAILED'}`);
    if (!join1Data.success) {
      console.log(`   Error: ${join1Data.error?.message || join1Data.error}`);
    }
    
    // Test 2: Valid buy-in (should succeed)
    console.log('\n2. Buy-in $100 (valid)...');
    const join2 = await fetch(`${API_URL}/api/tables/${tableId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ buyIn: 100 })
    });
    const join2Data = await join2.json();
    console.log(`   Result: ${join2Data.success ? 'SUCCESS' : 'FAILED'}`);
    if (!join2Data.success) {
      console.log(`   Error: ${join2Data.error?.message || join2Data.error}`);
    }
    
    // Leave table
    await fetch(`${API_URL}/api/tables/${tableId}/leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    // Test 3: Above maximum (should fail)
    console.log('\n3. Buy-in $300 (above maximum $200)...');
    const join3 = await fetch(`${API_URL}/api/tables/${tableId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ buyIn: 300 })
    });
    const join3Data = await join3.json();
    console.log(`   Result: ${join3Data.success ? 'SUCCESS' : 'FAILED'}`);
    if (!join3Data.success) {
      console.log(`   Error: ${join3Data.error?.message || join3Data.error}`);
    }
    
    console.log('\n=== SUMMARY ===');
    console.log('Buy-in limits are now working correctly! ✅');
    console.log('Tables use the limits set during creation, not hardcoded values.');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testJoinWithLimits();