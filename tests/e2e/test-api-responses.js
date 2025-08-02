const API_URL = 'https://primo-poker-server.alabamamike.workers.dev';

async function testApiResponses() {
  console.log('Testing API responses...\n');
  
  // Test 1: Get tables
  console.log('1. Testing GET /api/tables');
  try {
    const response = await fetch(`${API_URL}/api/tables`);
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
  
  // Test 2: Try to join a table without auth
  console.log('\n2. Testing POST /api/tables/demo-table-1/join (no auth)');
  try {
    const response = await fetch(`${API_URL}/api/tables/demo-table-1/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tableId: 'demo-table-1',
        playerId: 'test-player',
        buyIn: 100
      })
    });
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));
    
    // Check error structure
    if (data.error) {
      console.log('\nError structure:');
      console.log('Type of error:', typeof data.error);
      console.log('Error keys:', Object.keys(data.error));
    }
  } catch (error) {
    console.error('Error:', error);
  }
  
  // Test 3: Try to create a table
  console.log('\n3. Testing POST /api/tables (create table)');
  try {
    const response = await fetch(`${API_URL}/api/tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Test Table',
        gameType: 'cash',
        stakes: { smallBlind: 1, bigBlind: 2 },
        maxPlayers: 6
      })
    });
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

testApiResponses();