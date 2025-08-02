// Debug script to check token format issue
async function testTokenFormat() {
  const baseUrl = 'https://primo-poker-server.alabamamike.workers.dev';
  
  console.log('Testing token format...');
  
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
    
    const registerData = await registerResponse.json();
    console.log('Register response structure:', JSON.stringify(registerData, null, 2));
    
    if (!registerData.success) {
      console.error('Registration failed:', registerData.error);
      return;
    }
    
    // Check token format
    const tokens = registerData.data.tokens;
    console.log('Available token fields:', Object.keys(tokens));
    
    // Try different token field names
    let accessToken = tokens.accessToken || tokens.access_token;
    console.log('Access token found:', !!accessToken);
    
    if (accessToken) {
      console.log('Token starts with:', accessToken.substring(0, 20) + '...');
      
      // Step 2: Try to create a table with authentication
      const tableConfig = {
        name: 'Debug Test Table',
        gameType: 'TEXAS_HOLDEM',
        smallBlind: 1,
        bigBlind: 2,
        maxPlayers: 6,
        tableType: 'CASH_GAME'
      };
      
      console.log('Creating table with corrected auth...');
      
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
    }
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

testTokenFormat().catch(console.error);