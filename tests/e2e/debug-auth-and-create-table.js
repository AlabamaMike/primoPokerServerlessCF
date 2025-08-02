// Debug script to test authentication and table creation
async function testAuthAndTableCreation() {
  const baseUrl = 'https://primo-poker-server.alabamamike.workers.dev';
  
  console.log('Testing authentication and table creation...');
  
  // Step 1: Register a test user
  const testUser = {
    username: `testuser_${Date.now()}`,
    email: `test_${Date.now()}@example.com`,
    password: 'password123'
  };
  
  console.log('Registering test user:', testUser.username);
  
  try {
    const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testUser)
    });
    
    console.log('Register status:', registerResponse.status);
    const registerData = await registerResponse.json();
    console.log('Register response:', registerData);
    
    if (!registerData.success) {
      console.error('Registration failed:', registerData.error);
      return;
    }
    
    const accessToken = registerData.data.tokens.access_token;
    console.log('Got access token:', accessToken ? 'Yes' : 'No');
    
    // Step 2: Try to create a table with authentication
    const tableConfig = {
      name: 'Debug Test Table',
      gameType: 'TEXAS_HOLDEM',
      smallBlind: 1,
      bigBlind: 2,
      maxPlayers: 6,
      tableType: 'CASH_GAME'
    };
    
    console.log('Creating table with auth...');
    
    const createResponse = await fetch(`${baseUrl}/api/tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(tableConfig)
    });
    
    console.log('Create table status:', createResponse.status);
    const createData = await createResponse.text();
    console.log('Create table response:', createData);
    
    // Step 3: Test various edge cases
    console.log('\nTesting edge cases...');
    
    // Test with malformed JSON
    const malformedResponse = await fetch(`${baseUrl}/api/tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: 'invalid json'
    });
    console.log('Malformed JSON status:', malformedResponse.status);
    
    // Test with missing Content-Type
    const noContentTypeResponse = await fetch(`${baseUrl}/api/tables`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(tableConfig)
    });
    console.log('No Content-Type status:', noContentTypeResponse.status);
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

testAuthAndTableCreation().catch(console.error);