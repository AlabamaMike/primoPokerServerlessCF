import { test, expect, Page } from '@playwright/test';
import { setupTestPlayers, TestPlayer } from './helpers/test-players';
import { WebSocketHelper } from './helpers/websocket-helper';
import { retryE2E } from '../../test-utils/retry-helper';
import { getTestTimeout } from '../../test-utils/test-config';

const API_URL = process.env.API_URL;
if (!API_URL) {
  throw new Error('API_URL environment variable must be set for tests. Refusing to run against a default or production endpoint.');
}

describe('6-Player Comprehensive E2E Tests', () => {
  let players: TestPlayer[] = [];
  let pages: Page[] = [];
  let wsHelpers: WebSocketHelper[] = [];
  let tableId: string;

  test.beforeAll(async ({ browser }) => {
    // Create 6 test players
    players = await setupTestPlayers(6);
    
    // Create browser contexts and pages for each player
    for (const player of players) {
      const context = await browser.newContext();
      const page = await context.newPage();
      pages.push(page);
      
      // Login each player
      await page.goto(`${API_URL}/login`);
      await page.fill('[name="email"]', player.email);
      await page.fill('[name="password"]', player.password);
      await page.click('[type="submit"]');
      
      // Store auth token
      const token = await page.evaluate(() => localStorage.getItem('auth_token'));
      player.token = token!;
    }
  });

  test.beforeEach(async () => {
    // Create a new table
    const response = await pages[0]!.request.post(`${API_URL}/api/tables`, {
      headers: {
        'Authorization': `Bearer ${players[0]!.token}`,
        'Content-Type': 'application/json'
      },
      data: {
        name: '6-Player Test Table',
        gameType: 'TEXAS_HOLDEM',
        bettingStructure: 'NO_LIMIT',
        gameFormat: 'CASH',
        maxPlayers: 6,
        minBuyIn: 100,
        maxBuyIn: 1000,
        smallBlind: 5,
        bigBlind: 10
      }
    });
    
    const tableData = await response.json();
    tableId = tableData.id;
    
    // Set up WebSocket helpers
    wsHelpers = [];
    for (const player of players) {
      const wsHelper = new WebSocketHelper(`${API_URL}/ws?token=${player.token}&tableId=${tableId}`);
      await wsHelper.connect();
      wsHelpers.push(wsHelper);
    }
  });

  test.afterEach(async () => {
    // Close all WebSocket connections
    for (const wsHelper of wsHelpers) {
      await wsHelper.close();
    }
  });

  test.afterAll(async () => {
    // Close all pages and contexts
    for (const page of pages) {
      await page.context().close();
    }
  });

  test('should handle complete 6-player hand from start to finish', async () => {
    // All players join the table
    for (let i = 0; i < 6; i++) {
      await pages[i]!.goto(`${API_URL}/tables/${tableId}`);
      await pages[i]!.click('[data-testid="join-table-btn"]');
      await pages[i]!.fill('[name="buyIn"]', '500');
      await pages[i]!.click('[data-testid="confirm-buyin-btn"]');
      
      // Wait for player to be seated
      await pages[i]!.waitForSelector(`[data-testid="player-seat-${i}"]`);
    }
    
    // Wait for game to start
    await pages[0]!.waitForSelector('[data-testid="game-phase-preflop"]', { timeout: 10000 });
    
    // Verify all players have cards
    for (let i = 0; i < 6; i++) {
      await expect(pages[i]!.locator('[data-testid="hole-cards"]')).toBeVisible();
    }
    
    // Complete pre-flop betting
    for (let i = 0; i < 6; i++) {
      const isActive = await pages[i]!.locator('[data-testid="action-panel"]').isVisible();
      if (isActive) {
        await pages[i]!.click('[data-testid="call-btn"]');
      }
    }
    
    // Wait for flop
    await pages[0]!.waitForSelector('[data-testid="community-cards"] .card', { 
      state: 'visible',
      strict: false 
    });
    
    const flopCards = await pages[0]!.locator('[data-testid="community-cards"] .card').count();
    expect(flopCards).toBe(3);
    
    // Continue through turn and river
    const phases = ['flop', 'turn', 'river'];
    for (const phase of phases) {
      // Complete betting round
      for (let i = 0; i < 6; i++) {
        const isActive = await pages[i]!.locator('[data-testid="action-panel"]').isVisible();
        if (isActive) {
          await pages[i]!.click('[data-testid="check-btn"]');
        }
      }
      
      if (phase !== 'river') {
        await pages[0]!.waitForTimeout(1000); // Wait for next card
      }
    }
    
    // Verify showdown
    await pages[0]!.waitForSelector('[data-testid="showdown-results"]', { timeout: 5000 });
    
    // Verify winner announcement
    const winnerElement = await pages[0]!.locator('[data-testid="winner-announcement"]');
    await expect(winnerElement).toBeVisible();
    
    // Verify pot distribution
    const potBefore = await pages[0]!.locator('[data-testid="pot-amount"]').textContent();
    await pages[0]!.waitForTimeout(2000); // Wait for pot distribution animation
    const potAfter = await pages[0]!.locator('[data-testid="pot-amount"]').textContent();
    expect(potAfter).toBe('0');
  });

  test('should handle multiple players going all-in with side pots', async () => {
    // Set up players with different chip stacks
    const chipStacks = [100, 250, 500, 750, 1000, 1000];
    
    for (let i = 0; i < 6; i++) {
      await pages[i]!.goto(`${API_URL}/tables/${tableId}`);
      await pages[i]!.click('[data-testid="join-table-btn"]');
      await pages[i]!.fill('[name="buyIn"]', chipStacks[i]!.toString());
      await pages[i]!.click('[data-testid="confirm-buyin-btn"]');
    }
    
    // Wait for game to start
    await pages[0]!.waitForSelector('[data-testid="game-phase-preflop"]', { timeout: 10000 });
    
    // Players go all-in in sequence
    for (let i = 0; i < 4; i++) {
      const isActive = await pages[i]!.locator('[data-testid="action-panel"]').isVisible();
      if (isActive) {
        await pages[i]!.click('[data-testid="all-in-btn"]');
        await pages[i]!.waitForTimeout(500); // Wait for action to process
      }
    }
    
    // Remaining players call
    for (let i = 4; i < 6; i++) {
      const isActive = await pages[i]!.locator('[data-testid="action-panel"]').isVisible();
      if (isActive) {
        await pages[i]!.click('[data-testid="call-btn"]');
      }
    }
    
    // Verify side pots are displayed
    await expect(pages[0]!.locator('[data-testid="side-pots"]')).toBeVisible();
    const sidePots = await pages[0]!.locator('[data-testid="side-pot"]').count();
    expect(sidePots).toBeGreaterThan(0);
    
    // Wait for showdown and verify pot distribution
    await pages[0]!.waitForSelector('[data-testid="showdown-results"]', { timeout: 10000 });
  });

  test('should handle player disconnection and reconnection', async () => {
    // All players join
    for (let i = 0; i < 6; i++) {
      await pages[i]!.goto(`${API_URL}/tables/${tableId}`);
      await pages[i]!.click('[data-testid="join-table-btn"]');
      await pages[i]!.fill('[name="buyIn"]', '500');
      await pages[i]!.click('[data-testid="confirm-buyin-btn"]');
    }
    
    // Wait for game to start
    await pages[0]!.waitForSelector('[data-testid="game-phase-preflop"]', { timeout: 10000 });
    
    // Disconnect player 3
    await wsHelpers[2]!.close();
    await pages[2]!.context().close();
    
    // Verify other players see disconnection
    await expect(pages[0]!.locator('[data-testid="player-2-status"]')).toContainText('Disconnected');
    
    // Continue playing
    for (let i = 0; i < 6; i++) {
      if (i === 2) continue; // Skip disconnected player
      
      const isActive = await pages[i]!.locator('[data-testid="action-panel"]').isVisible();
      if (isActive) {
        await pages[i]!.click('[data-testid="call-btn"]');
      }
    }
    
    // Reconnect player 3
    const newContext = await pages[0]!.context().browser()!.newContext();
    const newPage = await newContext.newPage();
    pages[2] = newPage;
    
    await newPage.goto(`${API_URL}/login`);
    await newPage.fill('[name="email"]', players[2]!.email);
    await newPage.fill('[name="password"]', players[2]!.password);
    await newPage.click('[type="submit"]');
    
    await newPage.goto(`${API_URL}/tables/${tableId}`);
    
    // Verify player is back in the game
    await expect(newPage.locator('[data-testid="player-seat-2"]')).toBeVisible();
    await expect(newPage.locator('[data-testid="hole-cards"]')).toBeVisible();
  });

  test('should handle complex betting patterns with raises and re-raises', async () => {
    // All players join
    for (let i = 0; i < 6; i++) {
      await pages[i]!.goto(`${API_URL}/tables/${tableId}`);
      await pages[i]!.click('[data-testid="join-table-btn"]');
      await pages[i]!.fill('[name="buyIn"]', '1000');
      await pages[i]!.click('[data-testid="confirm-buyin-btn"]');
    }
    
    // Wait for game to start
    await pages[0]!.waitForSelector('[data-testid="game-phase-preflop"]', { timeout: 10000 });
    
    // Complex betting sequence
    let currentPlayer = 0;
    const bettingSequence = [
      { action: 'raise', amount: 30 },
      { action: 'raise', amount: 80 },
      { action: 'call', amount: null },
      { action: 'raise', amount: 200 },
      { action: 'fold', amount: null },
      { action: 'call', amount: null }
    ];
    
    for (const bet of bettingSequence) {
      // Find active player
      for (let i = 0; i < 6; i++) {
        const isActive = await pages[i]!.locator('[data-testid="action-panel"]').isVisible();
        if (isActive) {
          currentPlayer = i;
          break;
        }
      }
      
      if (bet.action === 'raise') {
        await pages[currentPlayer]!.fill('[data-testid="bet-amount"]', bet.amount!.toString());
        await pages[currentPlayer]!.click('[data-testid="raise-btn"]');
      } else if (bet.action === 'call') {
        await pages[currentPlayer]!.click('[data-testid="call-btn"]');
      } else if (bet.action === 'fold') {
        await pages[currentPlayer]!.click('[data-testid="fold-btn"]');
      }
      
      await pages[currentPlayer]!.waitForTimeout(500);
    }
    
    // Verify pot size reflects all bets
    const potAmount = await pages[0]!.locator('[data-testid="pot-amount"]').textContent();
    expect(parseInt(potAmount!)).toBeGreaterThan(500);
  });

  test('should properly rotate button position across multiple hands', async () => {
    // All players join
    for (let i = 0; i < 6; i++) {
      await pages[i]!.goto(`${API_URL}/tables/${tableId}`);
      await pages[i]!.click('[data-testid="join-table-btn"]');
      await pages[i]!.fill('[name="buyIn"]', '500');
      await pages[i]!.click('[data-testid="confirm-buyin-btn"]');
    }
    
    const dealerPositions: number[] = [];
    
    // Play 6 hands to verify button rotation
    for (let hand = 0; hand < 6; hand++) {
      // Wait for game to start
      await pages[0]!.waitForSelector('[data-testid="game-phase-preflop"]', { timeout: 10000 });
      
      // Find dealer position
      for (let i = 0; i < 6; i++) {
        const isDealer = await pages[0]!.locator(`[data-testid="player-${i}-dealer-button"]`).isVisible();
        if (isDealer) {
          dealerPositions.push(i);
          break;
        }
      }
      
      // Everyone folds to end hand quickly
      for (let i = 0; i < 6; i++) {
        const isActive = await pages[i]!.locator('[data-testid="action-panel"]').isVisible();
        if (isActive) {
          await pages[i]!.click('[data-testid="fold-btn"]');
          await pages[i]!.waitForTimeout(200);
        }
      }
      
      // Wait for hand to complete
      await pages[0]!.waitForSelector('[data-testid="hand-complete"]', { timeout: 5000 });
      await pages[0]!.waitForTimeout(2000); // Wait for new hand to start
    }
    
    // Verify button rotated through all positions
    expect(new Set(dealerPositions).size).toBe(6);
    
    // Verify rotation was clockwise
    for (let i = 1; i < dealerPositions.length; i++) {
      const expected = (dealerPositions[i - 1]! + 1) % 6;
      expect(dealerPositions[i]).toBe(expected);
    }
  });

  test('should handle chat messages during gameplay', async () => {
    // All players join
    for (let i = 0; i < 6; i++) {
      await pages[i]!.goto(`${API_URL}/tables/${tableId}`);
      await pages[i]!.click('[data-testid="join-table-btn"]');
      await pages[i]!.fill('[name="buyIn"]', '500');
      await pages[i]!.click('[data-testid="confirm-buyin-btn"]');
    }
    
    // Player 1 sends a chat message
    await pages[0]!.fill('[data-testid="chat-input"]', 'Good luck everyone!');
    await pages[0]!.press('[data-testid="chat-input"]', 'Enter');
    
    // Verify all players receive the message
    for (let i = 0; i < 6; i++) {
      await expect(pages[i]!.locator('[data-testid="chat-messages"]')).toContainText('Good luck everyone!');
      await expect(pages[i]!.locator('[data-testid="chat-messages"]')).toContainText(players[0]!.username);
    }
    
    // Test chat during active play
    await pages[0]!.waitForSelector('[data-testid="game-phase-preflop"]', { timeout: 10000 });
    
    // Player 3 sends message during their turn
    for (let i = 0; i < 6; i++) {
      const isActive = await pages[i]!.locator('[data-testid="action-panel"]').isVisible();
      if (isActive && i === 2) {
        await pages[i]!.fill('[data-testid="chat-input"]', 'Thinking...');
        await pages[i]!.press('[data-testid="chat-input"]', 'Enter');
        await pages[i]!.waitForTimeout(1000);
        await pages[i]!.click('[data-testid="call-btn"]');
        break;
      }
    }
    
    // Verify message was sent
    await expect(pages[0]!.locator('[data-testid="chat-messages"]')).toContainText('Thinking...');
  });

  test('should handle time bank usage correctly', async () => {
    // All players join
    for (let i = 0; i < 6; i++) {
      await pages[i]!.goto(`${API_URL}/tables/${tableId}`);
      await pages[i]!.click('[data-testid="join-table-btn"]');
      await pages[i]!.fill('[name="buyIn"]', '500');
      await pages[i]!.click('[data-testid="confirm-buyin-btn"]');
    }
    
    // Wait for game to start
    await pages[0]!.waitForSelector('[data-testid="game-phase-preflop"]', { timeout: 10000 });
    
    // Find active player
    let activePlayerIndex = -1;
    for (let i = 0; i < 6; i++) {
      const isActive = await pages[i]!.locator('[data-testid="action-panel"]').isVisible();
      if (isActive) {
        activePlayerIndex = i;
        break;
      }
    }
    
    expect(activePlayerIndex).toBeGreaterThanOrEqual(0);
    
    // Wait for regular timer to expire with retry logic
    await retryE2E('timer-warning-wait', async () => {
      await pages[activePlayerIndex]!.waitForSelector('[data-testid="timer-warning"]', { 
        timeout: getTestTimeout('e2e') 
      });
    });
    
    // Time bank should activate automatically with retry
    await retryE2E('time-bank-activation', async () => {
      await expect(pages[activePlayerIndex]!.locator('[data-testid="time-bank-active"]')).toBeVisible();
    });
    
    // Verify time bank countdown
    const initialTimeBank = await pages[activePlayerIndex]!.locator('[data-testid="time-bank-seconds"]').textContent();
    await pages[activePlayerIndex]!.waitForTimeout(2000);
    const updatedTimeBank = await pages[activePlayerIndex]!.locator('[data-testid="time-bank-seconds"]').textContent();
    
    expect(parseInt(updatedTimeBank!)).toBeLessThan(parseInt(initialTimeBank!));
    
    // Make action before time bank expires
    await pages[activePlayerIndex]!.click('[data-testid="call-btn"]');
  });
});