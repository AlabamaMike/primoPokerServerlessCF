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

async function testTableStructure() {
  console.log('=== TESTING TABLE STRUCTURE ===\n');
  
  try {
    // Login
    const token = await loginUser('smoketest1754114281188', 'Test1754114281188!');
    console.log('Logged in ✅');
    
    // Create a table
    console.log('\nCreating table...');
    const createResponse = await fetch(`${API_URL}/api/tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: 'Test Table Structure',
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
    console.log('Create response:', JSON.stringify(createData, null, 2));
    
    const tableId = createData.data?.tableId || createData.tableId;
    
    // Get table details
    console.log('\nGetting table details...');
    const tableResponse = await fetch(`${API_URL}/api/tables/${tableId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const tableData = await tableResponse.json();
    console.log('Table details:', JSON.stringify(tableData, null, 2));
    
    // Get table listing
    console.log('\nGetting table listing...');
    const listResponse = await fetch(`${API_URL}/api/tables`);
    const listData = await listResponse.json();
    
    if (listData.success && listData.data && listData.data.length > 0) {
      console.log('Table in listing:', JSON.stringify(listData.data[0], null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testTableStructure();