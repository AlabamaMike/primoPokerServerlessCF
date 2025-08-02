const API_URL = 'https://primo-poker-server.alabamamike.workers.dev';

async function createAndJoinTable() {
  console.log('Testing table creation and join flow...\n');
  
  // First, login to get a token
  console.log('1. Logging in to get auth token...');
  const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: 'smoketest1754114281188',
      password: 'Test1754114281188!'
    })
  });
  
  const loginData = await loginResponse.json();
  if (!loginData.success) {
    console.error('Login failed:', loginData);
    return;
  }
  
  const authToken = loginData.data.tokens.accessToken;
  console.log('✅ Login successful, got token');
  
  // Get current tables
  console.log('\n2. Checking existing tables...');
  const tablesResponse = await fetch(`${API_URL}/api/tables`, {
    headers: {
      'Authorization': `Bearer ${authToken}`
    }
  });
  
  const tablesData = await tablesResponse.json();
  console.log('Current tables:', tablesData);
  
  // Create a new table
  console.log('\n3. Creating a new table...');
  const createResponse = await fetch(`${API_URL}/api/tables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      name: 'Test Multiplayer Table',
      gameType: 'cash',
      stakes: { smallBlind: 1, bigBlind: 2 },
      maxPlayers: 6,
      minBuyIn: 40,
      maxBuyIn: 200,
      config: {
        name: 'Test Multiplayer Table',
        gameType: 'cash',
        stakes: { smallBlind: 1, bigBlind: 2 },
        maxPlayers: 6,
        minBuyIn: 40,
        maxBuyIn: 200
      }
    })
  });
  
  const createData = await createResponse.json();
  console.log('Create table response:', createData);
  
  if (createData.success && createData.data?.tableId) {
    const tableId = createData.data.tableId;
    console.log(`\n✅ Table created with ID: ${tableId}`);
    
    // Try to join the table
    console.log('\n4. Joining the table...');
    const joinResponse = await fetch(`${API_URL}/api/tables/${tableId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        tableId: tableId,
        playerId: loginData.data.user.id,
        buyIn: 100
      })
    });
    
    const joinData = await joinResponse.json();
    console.log('Join table response:', joinData);
    
    if (joinData.success) {
      console.log('\n✅ Successfully joined table!');
      console.log(`Navigate to: https://6e77d385.primo-poker-frontend.pages.dev/game/${tableId}/`);
    }
  }
  
  // Check tables again
  console.log('\n5. Checking tables after creation...');
  const finalTablesResponse = await fetch(`${API_URL}/api/tables`, {
    headers: {
      'Authorization': `Bearer ${authToken}`
    }
  });
  
  const finalTablesData = await finalTablesResponse.json();
  console.log('Updated tables list:', finalTablesData);
}

createAndJoinTable().catch(console.error);