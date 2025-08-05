import { test, expect } from '@playwright/test';

test.describe('Game Table UI', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app and authenticate
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');
    
    // Mock Tauri commands for testing
    await page.addInitScript(() => {
      const mockTauri = {
        invoke: async (cmd: string, args: any) => {
          console.log(`[Mock Tauri] Command: ${cmd}`, args);
          
          switch (cmd) {
            case 'check_backend_connection':
              return {
                connected: true,
                backend_url: 'https://primo-poker-server.alabamamike.workers.dev',
                latency_ms: 150
              };
              
            case 'get_auth_token':
              return null;
              
            case 'get_user':
              return null;
              
            case 'login':
              if (args.email === 'test@example.com' && args.password === 'password') {
                return {
                  user: {
                    id: 'user-123',
                    username: 'testuser',
                    email: 'test@example.com',
                    name: 'Test User'
                  },
                  tokens: {
                    accessToken: 'mock-token',
                    refreshToken: 'mock-refresh'
                  },
                  message: 'Login successful'
                };
              }
              throw new Error('Invalid credentials');
              
            case 'get_tables':
              return [
                {
                  id: 'table-123',
                  name: 'Test Table',
                  playerCount: 2,
                  maxPlayers: 9,
                  gamePhase: 'pre_flop',
                  pot: 0,
                  blinds: { small: 10, big: 20 }
                }
              ];
              
            default:
              throw new Error(`Unknown Tauri command: ${cmd}`);
          }
        }
      };
      
      (window as any).__TAURI__ = mockTauri;
    });
  });

  test('should display poker table with mock data', async ({ page }) => {
    // Login first
    const emailInput = page.locator('[data-testid="email"]');
    const passwordInput = page.locator('[data-testid="password"]');
    const loginButton = page.locator('[data-testid="login-button"]');

    await emailInput.fill('test@example.com');
    await passwordInput.fill('password');
    await loginButton.click();

    // Navigate to lobby
    await page.click('[data-testid="play-button"]');
    await expect(page.locator('[data-testid="lobby"]')).toBeVisible();

    // Join a table to navigate to game page
    const tableRow = page.locator('[data-testid^="table-row-"]').first();
    await expect(tableRow).toBeVisible();
    
    const joinButton = tableRow.locator('[data-testid="join-table-button"]');
    await joinButton.click();

    // Should navigate to game page
    await expect(page.locator('[data-testid="game-page"]')).toBeVisible({ timeout: 10000 });
    
    // Check that poker table is displayed
    await expect(page.locator('[data-testid="poker-table"]')).toBeVisible();
    
    // Check community cards area
    await expect(page.locator('[data-testid="community-cards"]')).toBeVisible();
    
    // Should have empty seats available
    await expect(page.locator('[data-testid^="empty-seat-"]')).toHaveCount(6); // 9 seats - 3 mock players
    
    // Should show pot information
    await expect(page.locator('text=Pot:')).toBeVisible();
  });

  test('should display player seats correctly', async ({ page }) => {
    // Navigate to game page (through login and lobby)
    const emailInput = page.locator('[data-testid="email"]');
    const passwordInput = page.locator('[data-testid="password"]');
    const loginButton = page.locator('[data-testid="login-button"]');

    await emailInput.fill('test@example.com');
    await passwordInput.fill('password');
    await loginButton.click();

    await page.click('[data-testid="play-button"]');
    await page.click('[data-testid="join-table-button"]');

    await expect(page.locator('[data-testid="poker-table"]')).toBeVisible();
    
    // Check that player seats show correct information
    const playerSeat = page.locator('[data-testid="player-seat-1"]');
    await expect(playerSeat).toBeVisible();
    
    // Should show player name
    await expect(playerSeat.locator('text=Alice')).toBeVisible();
    
    // Should show chip count
    await expect(playerSeat.locator('text=$1K')).toBeVisible(); // Formatted as 1000 -> 1K
    
    // Should show dealer button
    await expect(page.locator('[data-testid="dealer-button"]')).toBeVisible();
  });

  test('should display community cards', async ({ page }) => {
    // Navigate to game page
    const emailInput = page.locator('[data-testid="email"]');
    const passwordInput = page.locator('[data-testid="password"]');
    const loginButton = page.locator('[data-testid="login-button"]');

    await emailInput.fill('test@example.com');
    await passwordInput.fill('password');
    await loginButton.click();

    await page.click('[data-testid="play-button"]');
    await page.click('[data-testid="join-table-button"]');

    await expect(page.locator('[data-testid="poker-table"]')).toBeVisible();
    
    // Check community cards area
    const communityCards = page.locator('[data-testid="community-cards"]');
    await expect(communityCards).toBeVisible();
    
    // Should show 3 cards (flop) based on mock data
    await expect(communityCards.locator('[data-testid="card-hearts-A"]')).toBeVisible();
    await expect(communityCards.locator('[data-testid="card-diamonds-K"]')).toBeVisible();
    await expect(communityCards.locator('[data-testid="card-clubs-Q"]')).toBeVisible();
  });

  test('should show action buttons for current player', async ({ page }) => {
    // Mock the game state where current user is the active player
    await page.addInitScript(() => {
      // Override the mock to make the current user active
      const originalInvoke = (window as any).__TAURI__.invoke;
      (window as any).__TAURI__.invoke = async (cmd: string, args: any) => {
        if (cmd === 'login') {
          return {
            user: {
              id: 'player-2', // Make this user the active player
              username: 'testuser',
              email: 'test@example.com',
              name: 'Test User'
            },
            tokens: {
              accessToken: 'mock-token',
              refreshToken: 'mock-refresh'
            },
            message: 'Login successful'
          };
        }
        return originalInvoke(cmd, args);
      };
    });

    // Navigate to game page
    const emailInput = page.locator('[data-testid="email"]');
    const passwordInput = page.locator('[data-testid="password"]');
    const loginButton = page.locator('[data-testid="login-button"]');

    await emailInput.fill('test@example.com');
    await passwordInput.fill('password');
    await loginButton.click();

    await page.click('[data-testid="play-button"]');
    await page.click('[data-testid="join-table-button"]');

    await expect(page.locator('[data-testid="poker-table"]')).toBeVisible();
    
    // Should show action buttons
    await expect(page.locator('[data-testid="action-buttons"]')).toBeVisible();
    await expect(page.locator('[data-testid="fold-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="call-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="raise-button"]')).toBeVisible();
  });

  test('should handle leave table action', async ({ page }) => {
    // Navigate to game page
    const emailInput = page.locator('[data-testid="email"]');
    const passwordInput = page.locator('[data-testid="password"]');
    const loginButton = page.locator('[data-testid="login-button"]');

    await emailInput.fill('test@example.com');
    await passwordInput.fill('password');
    await loginButton.click();

    await page.click('[data-testid="play-button"]');
    await page.click('[data-testid="join-table-button"]');

    await expect(page.locator('[data-testid="game-page"]')).toBeVisible();
    
    // Click leave table button
    await page.click('[data-testid="leave-table-button"]');
    
    // Should navigate back to lobby
    await expect(page.locator('[data-testid="lobby"]')).toBeVisible();
    await expect(page.locator('[data-testid="game-page"]')).not.toBeVisible();
  });

  test('should display face-down cards correctly', async ({ page }) => {
    // Navigate to game page
    const emailInput = page.locator('[data-testid="email"]');
    const passwordInput = page.locator('[data-testid="password"]');
    const loginButton = page.locator('[data-testid="login-button"]');

    await emailInput.fill('test@example.com');
    await passwordInput.fill('password');
    await loginButton.click();

    await page.click('[data-testid="play-button"]');
    await page.click('[data-testid="join-table-button"]');

    await expect(page.locator('[data-testid="poker-table"]')).toBeVisible();
    
    // Face-down cards should be displayed for other players
    // (Only current user sees their own cards in the mock data)
    const faceDownCards = page.locator('[data-testid="card-face-down"]');
    await expect(faceDownCards).toHaveCount(4); // 2 players * 2 cards each (not showing current user's cards)
  });
});