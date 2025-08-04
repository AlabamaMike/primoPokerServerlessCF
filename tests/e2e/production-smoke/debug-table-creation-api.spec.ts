import { test, expect } from '@playwright/test';

test.describe('Debug Table Creation API', () => {
  const TEST_USERNAME = process.env.TEST_USERNAME || 'e2e_test_1754187899779@example.com';
  const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPass123!_1754187899779';

  test('Test table creation API directly', async ({ request }) => {
    // First, login to get JWT token
    const loginResponse = await request.post('https://primo-poker-server.alabamamike.workers.dev/api/auth/login', {
      data: {
        username: TEST_USERNAME,
        password: TEST_PASSWORD
      }
    });

    console.log('Login response status:', loginResponse.status());
    const loginText = await loginResponse.text();
    console.log('Login response body:', loginText);
    
    expect(loginResponse.ok()).toBeTruthy();
    const loginData = JSON.parse(loginText);
    console.log('Login data:', loginData);
    
    const token = loginData.data?.tokens?.accessToken;
    expect(token).toBeTruthy();
    console.log('Got JWT token');

    // Now try to create a table
    const tableConfig = {
      name: `Test Table ${Date.now()}`,
      gameType: 'texas_holdem',
      bettingStructure: 'no_limit',
      gameFormat: 'cash',
      maxPlayers: 6,
      minBuyIn: 100,
      maxBuyIn: 500,
      smallBlind: 1,
      bigBlind: 2,
      ante: 0,
      timeBank: 30,
      isPrivate: false
    };

    console.log('Creating table with config:', JSON.stringify(tableConfig, null, 2));

    const createTableResponse = await request.post('https://primo-poker-server.alabamamike.workers.dev/api/tables', {
      data: tableConfig,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Create table response status:', createTableResponse.status());
    const responseText = await createTableResponse.text();
    console.log('Create table response body:', responseText);

    if (createTableResponse.ok()) {
      const tableData = JSON.parse(responseText);
      console.log('Table created successfully:', tableData);
      expect(tableData.data?.tableId).toBeTruthy();
    } else {
      console.error('Table creation failed');
      // Try to parse error details
      try {
        const errorData = JSON.parse(responseText);
        console.error('Error details:', JSON.stringify(errorData, null, 2));
      } catch {
        console.error('Raw error response:', responseText);
      }
    }
  });
});