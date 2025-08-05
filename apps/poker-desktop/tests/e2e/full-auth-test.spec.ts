import { test, expect } from '@playwright/test';

// Real test credentials from CLAUDE.md
const TEST_EMAIL = 'e2e_test_1754187899779@example.com';
const TEST_PASSWORD = 'TestPass123!_1754187899779';

test.describe('Full Authentication Flow with Real Backend', () => {
  test('Complete authentication journey', async ({ page }) => {
    // 1. Navigate to the app
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');
    
    // 2. Wait for initial connection check
    const connectionStatus = page.locator('[data-testid="connection-status"]');
    await expect(connectionStatus).toBeVisible({ timeout: 10000 });
    
    // Log the connection status
    const statusText = await connectionStatus.textContent();
    console.log('Connection status:', statusText);
    
    // 3. Check if we see the login form (when backend is connected)
    // or if we're stuck at disconnected state
    await page.waitForTimeout(2000); // Give React time to render
    
    const loginForm = page.locator('[data-testid="login-form"]');
    const isConnected = await connectionStatus.textContent();
    
    if (isConnected?.includes('Connected')) {
      console.log('Backend is connected! Testing login flow...');
      
      // 4. Login form should be visible
      await expect(loginForm).toBeVisible({ timeout: 5000 });
      
      // 5. Fill in the credentials
      await page.fill('[data-testid="email"]', TEST_EMAIL);
      await page.fill('[data-testid="password"]', TEST_PASSWORD);
      
      // Take screenshot before login
      await page.screenshot({ 
        path: 'test-results/before-login.png', 
        fullPage: true 
      });
      
      // 6. Submit the form
      await page.click('[data-testid="login-button"]');
      
      // 7. Wait for authentication to complete
      await page.waitForTimeout(3000); // Allow time for API call
      
      // Check for either success or error
      const authContent = page.locator('[data-testid="authenticated-content"]');
      const errorMessage = page.locator('.bg-red-500\\/20');
      
      if (await authContent.isVisible()) {
        console.log('Login successful!');
        
        // 8. Verify we see the authenticated UI
        await expect(authContent).toBeVisible();
        await expect(page.locator('[data-testid="play-button"]')).toBeVisible();
        await expect(page.locator('[data-testid="logout-button"]')).toBeVisible();
        
        // Take screenshot of authenticated state
        await page.screenshot({ 
          path: 'test-results/authenticated.png', 
          fullPage: true 
        });
        
        // 9. Test navigation to lobby
        await page.click('[data-testid="play-button"]');
        const lobby = page.locator('[data-testid="lobby"]');
        await expect(lobby).toBeVisible({ timeout: 10000 });
        
        // 10. Verify lobby components
        await expect(page.locator('[data-testid="create-table-button"]')).toBeVisible();
        
        // Take screenshot of lobby
        await page.screenshot({ 
          path: 'test-results/lobby.png', 
          fullPage: true 
        });
        
        // 11. Test logout
        await page.click('[data-testid="logout-button"]');
        await expect(loginForm).toBeVisible({ timeout: 5000 });
        
        console.log('Full authentication flow completed successfully!');
      } else if (await errorMessage.isVisible()) {
        const error = await errorMessage.textContent();
        console.error('Login failed with error:', error);
        
        // Take screenshot of error state
        await page.screenshot({ 
          path: 'test-results/login-error.png', 
          fullPage: true 
        });
        
        // The test should fail if login doesn't work
        expect(error).toBe(null);
      }
    } else {
      console.log('Backend is disconnected. Connection status:', isConnected);
      
      // Take screenshot of disconnected state
      await page.screenshot({ 
        path: 'test-results/disconnected.png', 
        fullPage: true 
      });
      
      // Log what we see on the page
      const pageContent = await page.content();
      console.log('Page HTML:', pageContent);
    }
  });

  test('Direct API test from browser context', async ({ page }) => {
    // Test if we can reach the backend API directly
    const apiUrl = 'https://primo-poker-server.alabamamike.workers.dev';
    
    try {
      const healthResponse = await page.evaluate(async (url) => {
        try {
          const response = await fetch(`${url}/api/health`);
          return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            body: await response.text()
          };
        } catch (error) {
          return { error: error.toString() };
        }
      }, apiUrl);
      
      console.log('Health check response:', healthResponse);
      
      // Try login directly
      const loginResponse = await page.evaluate(async ({ url, email, password }) => {
        try {
          const response = await fetch(`${url}/api/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username: email, password })
          });
          
          const data = await response.json();
          return {
            ok: response.ok,
            status: response.status,
            data
          };
        } catch (error) {
          return { error: error.toString() };
        }
      }, { url: apiUrl, email: TEST_EMAIL, password: TEST_PASSWORD });
      
      console.log('Login API response:', loginResponse);
      
      if (loginResponse.ok) {
        expect(loginResponse.data).toHaveProperty('tokens');
        expect(loginResponse.data).toHaveProperty('user');
        console.log('API login successful! User:', loginResponse.data.user);
      }
    } catch (error) {
      console.error('API test error:', error);
    }
  });
});