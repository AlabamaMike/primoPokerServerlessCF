import { test, expect } from '@playwright/test';

test.describe('WebSocket Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Set up WebSocket mocks only since test mode handles Tauri mocking
    await page.addInitScript(() => {
      console.log('[Test] Setting up WebSocket mocks for test mode');

      // Mock WebSocket for testing
      let mockWsInstance: any = null;
      
      class MockWebSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;

        readyState = MockWebSocket.CONNECTING;
        onopen: ((event: Event) => void) | null = null;
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;
        onclose: ((event: CloseEvent) => void) | null = null;

        constructor(public url: string) {
          mockWsInstance = this;
          console.log('Mock WebSocket created:', url);
          
          // Simulate connection
          setTimeout(() => {
            this.readyState = MockWebSocket.OPEN;
            if (this.onopen) {
              this.onopen(new Event('open'));
            }
            
            // Send connection established message
            setTimeout(() => {
              if (this.onmessage) {
                this.onmessage(new MessageEvent('message', {
                  data: JSON.stringify({
                    type: 'connection_established',
                    payload: {
                      playerId: 'user-123',
                      tableId: 'table-123'
                    },
                    timestamp: new Date().toISOString()
                  })
                }));
              }
            }, 100);
          }, 100);
        }

        send(data: string) {
          console.log('Mock WebSocket send:', data);
          const message = JSON.parse(data);
          
          // Echo back player actions as game updates
          if (message.type === 'player_action') {
            setTimeout(() => {
              if (this.onmessage) {
                this.onmessage(new MessageEvent('message', {
                  data: JSON.stringify({
                    type: 'game_update',
                    payload: {
                      tableId: 'table-123',
                      gameState: {
                        tableId: 'table-123',
                        phase: 'flop',
                        pot: 200,
                        currentBet: 50,
                        communityCards: [
                          { suit: 'hearts', rank: 'A' },
                          { suit: 'diamonds', rank: 'K' },
                          { suit: 'clubs', rank: 'Q' }
                        ]
                      },
                      players: []
                    },
                    timestamp: new Date().toISOString()
                  })
                }));
              }
            }, 50);
          }
          
          // Echo back chat messages
          if (message.type === 'chat') {
            setTimeout(() => {
              if (this.onmessage) {
                this.onmessage(new MessageEvent('message', {
                  data: JSON.stringify({
                    type: 'chat',
                    payload: {
                      playerId: message.payload.playerId,
                      username: message.payload.username,
                      message: message.payload.message,
                      isSystem: false
                    },
                    timestamp: new Date().toISOString()
                  })
                }));
              }
            }, 50);
          }
        }

        close(code?: number, reason?: string) {
          console.log('Mock WebSocket close:', code, reason);
          this.readyState = MockWebSocket.CLOSED;
          if (this.onclose) {
            this.onclose(new CloseEvent('close', { code: code || 1000, reason: reason || '' }));
          }
        }
      }

      (window as any).WebSocket = MockWebSocket;
      (window as any).__mockWsInstance = () => mockWsInstance;
    });
    
    // Now navigate to the page
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');
    
    // Wait for the app to initialize and check if mocks are working
    await page.waitForTimeout(1000);
  });

  test('should establish WebSocket connection when joining table', async ({ page }) => {
    // In test mode, user is already authenticated - go directly to game
    await expect(page.locator('text=Welcome back!')).toBeVisible();
    
    // Click Play Now to go to lobby
    await page.click('[data-testid="play-button"]');
    
    // Wait for lobby to load and click join table
    await expect(page.locator('text=Available Tables')).toBeVisible();
    await page.click('[data-testid="join-table-table-123"]');

    // Should navigate to game page
    await expect(page.locator('[data-testid="game-page"]')).toBeVisible();
    
    // Should show WebSocket connection status
    await expect(page.locator('text=Live')).toBeVisible({ timeout: 5000 });
    
    // Should show connecting animation first, then connected
    const connectionStatus = page.locator('.bg-green-600');
    await expect(connectionStatus).toBeVisible();
  });

  test('should display chat panel with WebSocket connection', async ({ page }) => {
    // Navigate to game page via authenticated flow
    await expect(page.locator('text=Welcome back!')).toBeVisible();
    await page.click('[data-testid="play-button"]');
    await expect(page.locator('text=Available Tables')).toBeVisible();
    await page.click('[data-testid="join-table-table-123"]');

    // Should show chat panel
    await expect(page.locator('text=Table Chat')).toBeVisible();
    await expect(page.locator('[data-testid="chat-messages"]')).toBeVisible();
    await expect(page.locator('[data-testid="chat-input"]')).toBeVisible();
    
    // Should show connection indicator
    await expect(page.locator('.bg-green-400')).toBeVisible(); // Green dot for connected
  });

  test('should send and receive chat messages', async ({ page }) => {
    // Navigate to game page via authenticated flow
    await expect(page.locator('text=Welcome back!')).toBeVisible();
    await page.click('[data-testid="play-button"]');
    await expect(page.locator('text=Available Tables')).toBeVisible();
    await page.click('[data-testid="join-table-table-123"]');

    // Wait for connection
    await expect(page.locator('text=Live')).toBeVisible();
    
    // Send a chat message
    const chatInput = page.locator('[data-testid="chat-input"]');
    const sendButton = page.locator('[data-testid="chat-send-button"]');
    
    await chatInput.fill('Hello table!');
    await sendButton.click();
    
    // Should see the message in chat
    await expect(page.locator('text=testuser:')).toBeVisible();
    await expect(page.locator('text=Hello table!')).toBeVisible();
    
    // Input should be cleared
    await expect(chatInput).toHaveValue('');
  });

  test('should handle player actions via WebSocket', async ({ page }) => {
    // Navigate to game page via authenticated flow
    await expect(page.locator('text=Welcome back!')).toBeVisible();
    await page.click('[data-testid="play-button"]');
    await expect(page.locator('text=Available Tables')).toBeVisible();
    await page.click('[data-testid="join-table-table-123"]');

    // Wait for connection and game state
    await expect(page.locator('text=Live')).toBeVisible();
    
    // Mock that current user is the active player by updating the game state
    await page.evaluate(() => {
      const mockWs = (window as any).__mockWsInstance();
      if (mockWs && mockWs.onmessage) {
        mockWs.onmessage(new MessageEvent('message', {
          data: JSON.stringify({
            type: 'game_update',
            payload: {
              tableId: 'table-123',
              gameState: {
                tableId: 'table-123',
                phase: 'pre_flop',
                pot: 30,
                currentBet: 20,
                activePlayerId: 'user-123', // Make current user active
                communityCards: []
              },
              players: []
            },
            timestamp: new Date().toISOString()
          })
        }));
      }
    });
    
    // Should show action buttons
    await expect(page.locator('[data-testid="action-buttons"]')).toBeVisible({ timeout: 2000 });
    
    // Click fold button
    await page.click('[data-testid="fold-button"]');
    
    // Should trigger WebSocket message and potentially update game state
    // The mock will echo back a game update
  });

  test('should show connection status changes', async ({ page }) => {
    // Navigate to game page via authenticated flow
    await expect(page.locator('text=Welcome back!')).toBeVisible();
    await page.click('[data-testid="play-button"]');
    await expect(page.locator('text=Available Tables')).toBeVisible();
    await page.click('[data-testid="join-table-table-123"]');

    // Should start as connecting
    await expect(page.locator('text=Connecting...')).toBeVisible();
    
    // Then become connected
    await expect(page.locator('text=Live')).toBeVisible({ timeout: 3000 });
    
    // Should show green connection indicator
    await expect(page.locator('.bg-green-300')).toBeVisible();
  });

  test('should handle WebSocket disconnection gracefully', async ({ page }) => {
    // Navigate to game page via authenticated flow
    await expect(page.locator('text=Welcome back!')).toBeVisible();
    await page.click('[data-testid="play-button"]');
    await expect(page.locator('text=Available Tables')).toBeVisible();
    await page.click('[data-testid="join-table-table-123"]');

    // Wait for connection
    await expect(page.locator('text=Live')).toBeVisible();
    
    // Simulate disconnection
    await page.evaluate(() => {
      const mockWs = (window as any).__mockWsInstance();
      if (mockWs) {
        mockWs.close(1006, 'Connection lost');
      }
    });
    
    // Should show offline status
    await expect(page.locator('text=Offline')).toBeVisible({ timeout: 2000 });
    
    // Chat should show as disconnected
    await expect(page.locator('text=Chat unavailable')).toBeVisible();
  });
});