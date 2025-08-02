import { Page, Locator } from '@playwright/test';

export interface SeatInfo {
  position: number;
  isOccupied: boolean;
  playerName?: string;
  chipStack?: string;
}

export interface GameAction {
  type: 'check' | 'call' | 'bet' | 'raise' | 'fold' | 'all-in';
  amount?: number;
}

export class TablePage {
  readonly page: Page;
  readonly tableContainer: Locator;
  readonly seats: Locator;
  readonly communityCards: Locator;
  readonly pot: Locator;
  readonly actionButtons: Locator;
  readonly betSlider: Locator;
  readonly betInput: Locator;
  readonly leaveTableButton: Locator;
  readonly playerCards: Locator;
  readonly dealerButton: Locator;
  readonly chatInput: Locator;
  readonly chatSendButton: Locator;
  readonly buyInModal: Locator;
  readonly buyInAmountInput: Locator;
  readonly buyInConfirmButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tableContainer = page.locator('[data-testid="poker-table"], .poker-table, #table-container');
    this.seats = page.locator('[data-testid^="seat-"], .seat, .player-seat');
    this.communityCards = page.locator('[data-testid="community-cards"], .community-cards, .board-cards');
    this.pot = page.locator('[data-testid="pot-amount"], .pot-amount, .pot-value');
    this.actionButtons = page.locator('[data-testid="action-buttons"], .action-buttons, .controls');
    this.betSlider = page.locator('input[type="range"], .bet-slider');
    this.betInput = page.locator('input[data-testid="bet-amount"], input.bet-amount');
    this.leaveTableButton = page.locator('button:has-text("Leave Table"), button:has-text("Stand Up")');
    this.playerCards = page.locator('[data-testid="player-cards"], .hole-cards, .player-hand');
    this.dealerButton = page.locator('[data-testid="dealer-button"], .dealer-button');
    this.chatInput = page.locator('input[placeholder*="chat" i], input[name="message"]');
    this.chatSendButton = page.locator('button:has-text("Send"), button[type="submit"]:near(input[placeholder*="chat" i])');
    this.buyInModal = page.locator('[data-testid="buyin-modal"], .buyin-dialog, [role="dialog"]:has-text("Buy In")');
    this.buyInAmountInput = page.locator('input[data-testid="buyin-amount"], input[name="buyInAmount"]');
    this.buyInConfirmButton = page.locator('button:has-text("Confirm"), button:has-text("Buy In")').filter({ hasText: /confirm|buy in/i });
  }

  async waitForTableLoad() {
    await this.tableContainer.waitFor({ state: 'visible' });
    await this.page.waitForLoadState('networkidle');
  }

  async getAvailableSeats(): Promise<SeatInfo[]> {
    const seatCount = await this.seats.count();
    const seatInfos: SeatInfo[] = [];

    for (let i = 0; i < seatCount; i++) {
      const seat = this.seats.nth(i);
      const isOccupied = await seat.locator('.player-name, [data-testid="player-name"]').isVisible();
      
      const seatInfo: SeatInfo = {
        position: i + 1,
        isOccupied
      };

      if (isOccupied) {
        seatInfo.playerName = await seat.locator('.player-name, [data-testid="player-name"]').textContent() || undefined;
        seatInfo.chipStack = await seat.locator('.chip-stack, [data-testid="chip-stack"]').textContent() || undefined;
      }

      seatInfos.push(seatInfo);
    }

    return seatInfos;
  }

  async takeSeat(position: number) {
    const seat = this.seats.nth(position - 1);
    const sitButton = seat.locator('button:has-text("Sit"), button:has-text("Take Seat")');
    await sitButton.click();
  }

  async completeBuyIn(amount: string) {
    await this.buyInModal.waitFor({ state: 'visible' });
    await this.buyInAmountInput.fill(amount);
    await this.buyInConfirmButton.click();
    await this.buyInModal.waitFor({ state: 'hidden' });
  }

  async waitForCards() {
    await this.playerCards.waitFor({ state: 'visible', timeout: 60000 });
  }

  async getHoleCards(): Promise<string[]> {
    const cards = await this.playerCards.locator('.card, [data-testid="card"]').allTextContents();
    return cards.filter(card => card.trim() !== '');
  }

  async getCommunityCards(): Promise<string[]> {
    const cards = await this.communityCards.locator('.card, [data-testid="card"]').allTextContents();
    return cards.filter(card => card.trim() !== '');
  }

  async getPotAmount(): Promise<string> {
    return await this.pot.textContent() || '0';
  }

  async isMyTurn(): Promise<boolean> {
    return await this.actionButtons.isVisible();
  }

  async performAction(action: GameAction) {
    const actionButton = this.actionButtons.locator(`button:has-text("${action.type}")`).first();
    
    if (action.amount && (action.type === 'bet' || action.type === 'raise')) {
      await this.betInput.fill(action.amount.toString());
    }
    
    await actionButton.click();
  }

  async check() {
    await this.performAction({ type: 'check' });
  }

  async call() {
    await this.performAction({ type: 'call' });
  }

  async fold() {
    await this.performAction({ type: 'fold' });
  }

  async bet(amount: number) {
    await this.performAction({ type: 'bet', amount });
  }

  async raise(amount: number) {
    await this.performAction({ type: 'raise', amount });
  }

  async waitForHandCompletion() {
    await this.page.waitForFunction(
      () => {
        const potElement = document.querySelector('[data-testid="pot-amount"], .pot-amount');
        return potElement && potElement.textContent === '0';
      },
      { timeout: 120000 }
    );
  }

  async leaveTable() {
    await this.leaveTableButton.click();
    const confirmButton = this.page.locator('button:has-text("Confirm"), button:has-text("Yes")');
    if (await confirmButton.isVisible({ timeout: 2000 })) {
      await confirmButton.click();
    }
  }

  async sendChatMessage(message: string) {
    await this.chatInput.fill(message);
    await this.chatSendButton.click();
  }

  async getPlayerChipStack(playerName: string): Promise<string | null> {
    const playerSeat = this.seats.filter({ hasText: playerName }).first();
    if (await playerSeat.isVisible()) {
      return await playerSeat.locator('.chip-stack, [data-testid="chip-stack"]').textContent();
    }
    return null;
  }
}