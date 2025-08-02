import { Page, Locator } from '@playwright/test';

export interface TableConfig {
  name: string;
  gameType: 'cash' | 'tournament';
  isPrivate: boolean;
  smallBlind: string;
  bigBlind: string;
  maxPlayers: string;
  minBuyIn: string;
  maxBuyIn: string;
  password?: string;
}

export class CreateTablePage {
  readonly page: Page;
  readonly tableNameInput: Locator;
  readonly gameTypeSelect: Locator;
  readonly privateTableCheckbox: Locator;
  readonly smallBlindInput: Locator;
  readonly bigBlindInput: Locator;
  readonly maxPlayersSelect: Locator;
  readonly minBuyInInput: Locator;
  readonly maxBuyInInput: Locator;
  readonly passwordInput: Locator;
  readonly createButton: Locator;
  readonly cancelButton: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tableNameInput = page.locator('input[name="tableName"], input[placeholder*="table name" i]');
    this.gameTypeSelect = page.locator('select[name="gameType"], [data-testid="game-type-select"]');
    this.privateTableCheckbox = page.locator('input[type="checkbox"][name="private"], input[type="checkbox"]:near(:text("Private"))');
    this.smallBlindInput = page.locator('input[name="smallBlind"], input[placeholder*="small blind" i]');
    this.bigBlindInput = page.locator('input[name="bigBlind"], input[placeholder*="big blind" i]');
    this.maxPlayersSelect = page.locator('select[name="maxPlayers"], [data-testid="max-players-select"]');
    this.minBuyInInput = page.locator('input[name="minBuyIn"], input[placeholder*="min buy" i]');
    this.maxBuyInInput = page.locator('input[name="maxBuyIn"], input[placeholder*="max buy" i]');
    this.passwordInput = page.locator('input[name="password"], input[type="password"]:near(:text("Password"))');
    this.createButton = page.locator('button:has-text("Create Table"), button[type="submit"]:has-text("Create")');
    this.cancelButton = page.locator('button:has-text("Cancel"), button:has-text("Back")');
    this.errorMessage = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    this.successMessage = page.locator('.success-message, [data-testid="success-message"]');
  }

  async waitForLoad() {
    await this.tableNameInput.waitFor({ state: 'visible' });
  }

  async fillTableConfig(config: TableConfig) {
    await this.tableNameInput.fill(config.name);
    
    if (config.gameType) {
      await this.gameTypeSelect.selectOption(config.gameType);
    }
    
    if (config.isPrivate) {
      await this.privateTableCheckbox.check();
      if (config.password) {
        await this.passwordInput.fill(config.password);
      }
    }
    
    await this.smallBlindInput.fill(config.smallBlind);
    await this.bigBlindInput.fill(config.bigBlind);
    
    if (config.maxPlayers) {
      await this.maxPlayersSelect.selectOption(config.maxPlayers);
    }
    
    await this.minBuyInInput.fill(config.minBuyIn);
    await this.maxBuyInInput.fill(config.maxBuyIn);
  }

  async createTable(config: TableConfig) {
    await this.fillTableConfig(config);
    await this.createButton.click();
  }

  async waitForTableCreation() {
    await Promise.race([
      this.page.waitForURL(/\/table\//, { timeout: 30000 }),
      this.successMessage.waitFor({ state: 'visible', timeout: 30000 })
    ]);
  }

  async getErrorMessage(): Promise<string | null> {
    if (await this.errorMessage.isVisible()) {
      return await this.errorMessage.textContent();
    }
    return null;
  }

  async cancel() {
    await this.cancelButton.click();
  }

  async isFormValid(): Promise<boolean> {
    const createButtonEnabled = await this.createButton.isEnabled();
    return createButtonEnabled;
  }
}