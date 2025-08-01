import { test, expect } from '@playwright/test';

// API Testing to verify backend connectivity
const API_BASE_URL = 'https://primo-poker-server.alabamamike.workers.dev';

test.describe('API Connectivity Tests', () => {
  test('should connect to health endpoint', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/health`);
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('healthy');
  });

  test('should connect to tables endpoint', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/tables`);
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('should handle CORS correctly', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/health`, {
      headers: {
        'Origin': 'https://1167cb53.primo-poker-frontend.pages.dev'
      }
    });
    
    expect(response.status()).toBe(200);
    
    // Check CORS headers
    const corsHeader = response.headers()['access-control-allow-origin'];
    expect(corsHeader).toBeDefined();
  });

  test('should test user registration', async ({ request }) => {
    const uniqueUser = {
      username: `e2etest_${Date.now()}`,
      email: `e2etest_${Date.now()}@example.com`,
      password: 'TestPassword123!'
    };

    const response = await request.post(`${API_BASE_URL}/api/auth/register`, {
      data: uniqueUser
    });

    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.user.username).toBe(uniqueUser.username);
    expect(body.data.tokens.accessToken).toBeDefined();
  });

  test('should test login with email', async ({ request }) => {
    // First register a user
    const uniqueUser = {
      username: `e2etest_${Date.now()}`,
      email: `e2etest_${Date.now()}@example.com`,
      password: 'TestPassword123!'
    };

    await request.post(`${API_BASE_URL}/api/auth/register`, {
      data: uniqueUser
    });

    // Then try to login with email
    const loginResponse = await request.post(`${API_BASE_URL}/api/auth/login`, {
      data: {
        username: uniqueUser.email, // Using email as username
        password: uniqueUser.password
      }
    });

    expect(loginResponse.status()).toBe(200);
    
    const body = await loginResponse.json();
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe(uniqueUser.email);
  });

  test('should test login with username', async ({ request }) => {
    // First register a user
    const uniqueUser = {
      username: `e2etest_${Date.now()}`,
      email: `e2etest_${Date.now()}@example.com`,
      password: 'TestPassword123!'
    };

    await request.post(`${API_BASE_URL}/api/auth/register`, {
      data: uniqueUser
    });

    // Then try to login with username
    const loginResponse = await request.post(`${API_BASE_URL}/api/auth/login`, {
      data: {
        username: uniqueUser.username,
        password: uniqueUser.password
      }
    });

    expect(loginResponse.status()).toBe(200);
    
    const body = await loginResponse.json();
    expect(body.success).toBe(true);
    expect(body.data.user.username).toBe(uniqueUser.username);
  });

  test('should handle invalid login credentials', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/auth/login`, {
      data: {
        username: 'nonexistent@example.com',
        password: 'wrongpassword'
      }
    });

    expect(response.status()).toBe(401);
    
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain('User not found');
  });

  test('should validate input length limits', async ({ request }) => {
    const longString = 'a'.repeat(300);
    
    const response = await request.post(`${API_BASE_URL}/api/auth/login`, {
      data: {
        username: longString,
        password: 'password123'
      }
    });

    expect(response.status()).toBe(401);
    
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain('Credentials too long');
  });

  test('should measure API response times', async ({ request }) => {
    const startTime = Date.now();
    
    const response = await request.get(`${API_BASE_URL}/api/health`);
    
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    expect(response.status()).toBe(200);
    expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds
    
    console.log(`API Response Time: ${responseTime}ms`);
  });
});
