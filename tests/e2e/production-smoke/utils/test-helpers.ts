import { Page } from '@playwright/test';

export interface TestCredentials {
  username: string;
  password: string;
  twoFactorCode?: string;
}

export interface TestConfig {
  credentials: TestCredentials;
  tableConfig: {
    defaultBuyIn: string;
    testTablePrefix: string;
    testPassword: string;
  };
  timeouts: {
    gameAction: number;
    handCompletion: number;
    tableLoad: number;
  };
}

export function getTestConfig(): TestConfig {
  if (!process.env.TEST_USERNAME || !process.env.TEST_PASSWORD) {
    console.warn('⚠️  WARNING: TEST_USERNAME and TEST_PASSWORD environment variables are not set!');
    console.warn('⚠️  Please set these in your .env.test file or as environment variables.');
    console.warn('⚠️  Using default test credentials which will likely fail in production.');
  }

  return {
    credentials: {
      username: process.env.TEST_USERNAME || 'test_user',
      password: process.env.TEST_PASSWORD || 'test_password',
      twoFactorCode: process.env.TEST_2FA_CODE
    },
    tableConfig: {
      defaultBuyIn: process.env.TEST_DEFAULT_BUYIN || '100',
      testTablePrefix: process.env.TEST_TABLE_PREFIX || `Test_${Date.now()}`,
      testPassword: process.env.TEST_TABLE_PASSWORD || 'testpass123'
    },
    timeouts: {
      gameAction: parseInt(process.env.TEST_GAME_ACTION_TIMEOUT || '15000'),
      handCompletion: parseInt(process.env.TEST_HAND_COMPLETION_TIMEOUT || '120000'),
      tableLoad: parseInt(process.env.TEST_TABLE_LOAD_TIMEOUT || '30000')
    }
  };
}

export async function waitForWebSocketConnection(page: Page) {
  await page.waitForFunction(
    () => {
      const ws = (window as any).WebSocket;
      return ws && Array.from(document.querySelectorAll('*')).some(
        el => el.textContent?.includes('Connected') || 
              el.getAttribute('data-connection-status') === 'connected'
      );
    },
    { timeout: 30000 }
  );
}

export async function takeScreenshotOnFailure(page: Page, testName: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({ 
    path: `test-results/screenshots/${testName}-${timestamp}.png`,
    fullPage: true 
  });
}

export async function logTestStep(page: Page, step: string) {
  console.log(`[${new Date().toISOString()}] ${step}`);
  await page.evaluate((msg) => {
    console.log(`TEST STEP: ${msg}`);
  }, step);
}

export async function retryAction<T>(
  action: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await action();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

export function generateUniqueTableName(prefix: string = 'Test'): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `${prefix}_${timestamp}_${random}`;
}

export async function waitForAnimation(page: Page, duration: number = 500) {
  await page.waitForTimeout(duration);
}

export async function extractChipAmount(chipText: string): number {
  const match = chipText.match(/[\d,]+\.?\d*/);
  if (match) {
    return parseFloat(match[0].replace(/,/g, ''));
  }
  return 0;
}

export async function verifyChipMovement(
  page: Page,
  fromPlayer: string,
  amount: number,
  toPot: boolean = true
) {
  await page.waitForFunction(
    ({ player, chips, pot }) => {
      const playerElement = Array.from(document.querySelectorAll('.player-name, [data-testid="player-name"]'))
        .find(el => el.textContent?.includes(player));
      
      if (!playerElement) return false;
      
      const chipElement = playerElement.closest('.seat, [data-testid^="seat-"]')
        ?.querySelector('.chip-stack, [data-testid="chip-stack"]');
      
      if (!chipElement) return false;
      
      const currentChips = parseFloat(chipElement.textContent?.replace(/[^0-9.]/g, '') || '0');
      
      if (pot) {
        const potElement = document.querySelector('[data-testid="pot-amount"], .pot-amount');
        return potElement && parseFloat(potElement.textContent?.replace(/[^0-9.]/g, '') || '0') >= chips;
      }
      
      return true;
    },
    { player: fromPlayer, chips: amount, pot: toPot },
    { timeout: 10000 }
  );
}

export async function waitForNextHand(page: Page) {
  await page.waitForFunction(
    () => {
      const dealerButton = document.querySelector('[data-testid="dealer-button"], .dealer-button');
      const cards = document.querySelectorAll('[data-testid="player-cards"] .card, .hole-cards .card');
      return dealerButton && cards.length >= 2;
    },
    { timeout: 60000 }
  );
}

export class TestDataManager {
  private usedTableNames: Set<string> = new Set();

  getUniqueTableName(): string {
    let name: string;
    do {
      name = generateUniqueTableName();
    } while (this.usedTableNames.has(name));
    
    this.usedTableNames.add(name);
    return name;
  }

  cleanup() {
    this.usedTableNames.clear();
  }
}