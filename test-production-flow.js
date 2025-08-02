#!/usr/bin/env node

/**
 * Production Smoke Test
 * Tests the complete table creation and join flow
 */

const API_URL = 'https://primo-poker-server.alabamamike.workers.dev';
const FRONTEND_URL = 'https://primopokerfrontend.pages.dev';

async function testApiHealth() {
  console.log('🔍 Testing API health...');
  try {
    const response = await fetch(`${API_URL}/api/health`);
    const data = await response.json();
    
    if (data.success && data.data.status === 'healthy') {
      console.log('✅ API is healthy');
      return true;
    } else {
      console.log('❌ API health check failed:', data);
      return false;
    }
  } catch (error) {
    console.log('❌ API health check error:', error.message);
    return false;
  }
}

async function testFrontendAccess() {
  console.log('🔍 Testing frontend access...');
  try {
    const response = await fetch(FRONTEND_URL);
    
    if (response.ok) {
      console.log('✅ Frontend is accessible');
      return true;
    } else {
      console.log('❌ Frontend access failed:', response.status);
      return false;
    }
  } catch (error) {
    console.log('❌ Frontend access error:', error.message);
    return false;
  }
}

async function testUserRegistration() {
  console.log('🔍 Testing user registration...');
  try {
    const timestamp = Date.now();
    const testUser = {
      username: `testuser${timestamp}`,
      email: `testuser${timestamp}@example.com`,
      password: 'testpass123'
    };

    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testUser)
    });

    const data = await response.json();
    
    if (data.success && data.data.tokens) {
      console.log('✅ User registration successful');
      return {
        success: true,
        user: data.data.user,
        token: data.data.tokens.accessToken
      };
    } else {
      console.log('❌ User registration failed:', data);
      return { success: false };
    }
  } catch (error) {
    console.log('❌ User registration error:', error.message);
    return { success: false };
  }
}

async function testTableCreation(token) {
  console.log('🔍 Testing table creation...');
  try {
    const tableConfig = {
      name: `Test Table ${Date.now()}`,
      gameType: 'texas_holdem',
      bettingStructure: 'no_limit',
      gameFormat: 'cash',
      maxPlayers: 9,
      minBuyIn: 100,
      maxBuyIn: 1000,
      smallBlind: 1,
      bigBlind: 2,
      ante: 0,
      timeBank: 30,
      isPrivate: false
    };

    const response = await fetch(`${API_URL}/api/tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(tableConfig)
    });

    const data = await response.json();
    
    if (data.success && data.data.tableId) {
      console.log('✅ Table creation successful');
      return {
        success: true,
        tableId: data.data.tableId
      };
    } else {
      console.log('❌ Table creation failed:', data);
      return { success: false };
    }
  } catch (error) {
    console.log('❌ Table creation error:', error.message);
    return { success: false };
  }
}

async function testTableRetrieval(tableId) {
  console.log('🔍 Testing table retrieval...');
  try {
    const response = await fetch(`${API_URL}/api/tables/${tableId}`);
    const data = await response.json();
    
    if (data.success && data.data.tableId === tableId) {
      console.log('✅ Table retrieval successful');
      return true;
    } else {
      console.log('❌ Table retrieval failed:', data);
      return false;
    }
  } catch (error) {
    console.log('❌ Table retrieval error:', error.message);
    return false;
  }
}

async function runSmokeTest() {
  console.log('🚀 Starting Production Smoke Test\n');
  
  let passed = 0;
  let total = 0;
  
  // Test 1: API Health
  total++;
  if (await testApiHealth()) passed++;
  
  // Test 2: Frontend Access
  total++;
  if (await testFrontendAccess()) passed++;
  
  // Test 3: User Registration
  total++;
  const registrationResult = await testUserRegistration();
  if (registrationResult.success) {
    passed++;
    
    // Test 4: Table Creation (requires valid user)
    total++;
    const tableResult = await testTableCreation(registrationResult.token);
    if (tableResult.success) {
      passed++;
      
      // Test 5: Table Retrieval
      total++;
      if (await testTableRetrieval(tableResult.tableId)) passed++;
    }
  }
  
  console.log('\n📊 Test Results:');
  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${total - passed}/${total}`);
  
  if (passed === total) {
    console.log('\n🎉 All tests passed! Production deployment is working correctly.');
    process.exit(0);
  } else {
    console.log('\n⚠️ Some tests failed. Check the logs above for details.');
    process.exit(1);
  }
}

runSmokeTest();