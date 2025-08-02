import { Page, Locator } from '@playwright/test';

export interface TableInfo {
  name: string;
  stakes: string;
  players: string;
  type: string;
}

export class LobbyPage {
  readonly page: Page;
  readonly tableList: Locator;
  readonly tableRows: Locator;
  readonly createTableButton: Locator;
  readonly filterInput: Locator;
  readonly sortDropdown: Locator;
  readonly refreshButton: Locator;
  readonly userBalance: Locator;
  readonly userAvatar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tableList = page.locator('[data-testid="table-list"], .table-list, #tables-container');
    this.tableRows = page.locator('[data-testid="table-row"], .table-row, tr[data-table-id]');
    this.createTableButton = page.locator('button:has-text("Create Table"), button:has-text("New Table")');
    this.filterInput = page.locator('input[placeholder*="filter" i], input[placeholder*="search" i]');
    this.sortDropdown = page.locator('select[name="sort"], [data-testid="sort-dropdown"]');
    this.refreshButton = page.locator('button:has-text("Refresh"), button[aria-label="Refresh"]');
    this.userBalance = page.locator('[data-testid="user-balance"], .user-balance, .chip-balance');
    this.userAvatar = page.locator('[data-testid="user-avatar"], .user-avatar, .profile-pic');
  }

  async goto() {
    await this.page.goto('/lobby', { waitUntil: 'networkidle' });
  }

  async waitForLoad() {
    await this.tableList.waitFor({ state: 'visible' });
    await this.page.waitForLoadState('networkidle');
  }

  async getTableCount(): Promise<number> {
    await this.waitForLoad();
    return await this.tableRows.count();
  }

  async getTables(): Promise<TableInfo[]> {
    await this.waitForLoad();
    const tables: TableInfo[] = [];
    const count = await this.tableRows.count();
    
    for (let i = 0; i < count; i++) {
      const row = this.tableRows.nth(i);
      const name = await row.locator('[data-testid="table-name"], .table-name').textContent() || '';
      const stakes = await row.locator('[data-testid="table-stakes"], .stakes').textContent() || '';
      const players = await row.locator('[data-testid="player-count"], .players').textContent() || '';
      const type = await row.locator('[data-testid="game-type"], .game-type').textContent() || '';
      
      tables.push({ name: name.trim(), stakes: stakes.trim(), players: players.trim(), type: type.trim() });
    }
    
    return tables;
  }

  async selectTable(tableName: string) {
    const tableRow = this.tableRows.filter({ hasText: tableName }).first();
    await tableRow.click();
  }

  async filterTables(searchTerm: string) {
    await this.filterInput.fill(searchTerm);
    await this.page.waitForTimeout(500);
  }

  async sortTables(sortOption: string) {
    await this.sortDropdown.selectOption(sortOption);
    await this.page.waitForTimeout(500);
  }

  async createNewTable() {
    await this.createTableButton.click();
  }

  async refreshTables() {
    await this.refreshButton.click();
    await this.waitForLoad();
  }

  async getUserBalance(): Promise<string> {
    return await this.userBalance.textContent() || '0';
  }

  async isUserLoggedIn(): Promise<boolean> {
    return await this.userAvatar.isVisible();
  }
}