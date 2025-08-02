const API_URL = 'https://primo-poker-server.alabamamike.workers.dev';

async function createProperTable() {
  console.log('Creating table with proper schema...\n');
  
  // First, login to get a token
  console.log('1. Logging in...');
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
  const userId = loginData.data.user.id;
  console.log('✅ Login successful');
  
  // Create a table with all required fields
  console.log('\n2. Creating table with complete configuration...');
  const tableConfig = {
    name: 'Test Multiplayer Cash Game',
    gameType: 'CASH',  // Must match enum value
    bettingStructure: 'NO_LIMIT',  // Required field
    gameFormat: 'TEXAS_HOLDEM',  // Required field
    maxPlayers: 6,
    minBuyIn: 40,
    maxBuyIn: 200,
    smallBlind: 1,
    bigBlind: 2,
    ante: 0,
    timeBank: 30,
    isPrivate: false
  };
  
  const createResponse = await fetch(`${API_URL}/api/tables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify(tableConfig)
  });
  
  const createData = await createResponse.json();
  console.log('Create response:', JSON.stringify(createData, null, 2));
  
  if (createData.success) {
    const tableId = createData.data.id || createData.data.tableId;
    console.log(`\n✅ Table created successfully!`);
    console.log(`Table ID: ${tableId}`);
    console.log(`\nYou can now join this table at:`);
    console.log(`https://6e77d385.primo-poker-frontend.pages.dev/game/${tableId}/`);
    
    // Try to join the table
    console.log('\n3. Attempting to join the table...');
    const joinResponse = await fetch(`${API_URL}/api/tables/${tableId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        tableId: tableId,
        playerId: userId,
        buyIn: 100
      })
    });
    
    const joinData = await joinResponse.json();
    console.log('Join response:', JSON.stringify(joinData, null, 2));
    
    if (joinData.success) {
      console.log('\n✅ Successfully joined the table!');
      console.log('You should now be able to play at the table.');
    } else {
      console.log('\n❌ Failed to join table:', joinData.error);
    }
    
    // Check table status
    console.log('\n4. Checking table status...');
    const tableStatus = await fetch(`${API_URL}/api/tables/${tableId}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    const statusData = await tableStatus.json();
    console.log('Table status:', JSON.stringify(statusData, null, 2));
    
  } else {
    console.log('\n❌ Failed to create table');
    if (createData.error?.details) {
      console.log('Validation errors:', createData.error.details);
    }
  }
}

createProperTable().catch(console.error);