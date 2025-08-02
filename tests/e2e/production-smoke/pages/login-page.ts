import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly errorMessage: Locator;
  readonly twoFactorInput: Locator;
  readonly twoFactorSubmit: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.locator('input[name="username"], input[type="email"], input[placeholder*="username" i], input[placeholder*="email" i]').first();
    this.passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    this.loginButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first();
    this.errorMessage = page.locator('[role="alert"], .error-message, .alert-danger');
    this.twoFactorInput = page.locator('input[name="code"], input[name="totp"], input[placeholder*="code" i]');
    this.twoFactorSubmit = page.locator('button:has-text("Verify"), button:has-text("Submit")');
  }

  async goto() {
    await this.page.goto('/login', { waitUntil: 'networkidle' });
  }

  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async handle2FA(code: string) {
    await this.twoFactorInput.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);
    if (await this.twoFactorInput.isVisible()) {
      await this.twoFactorInput.fill(code);
      await this.twoFactorSubmit.click();
    }
  }

  async waitForLoginSuccess() {
    await this.page.waitForURL(/\/(lobby|dashboard|home)/, { timeout: 30000 });
  }

  async isLoggedIn(): Promise<boolean> {
    return !this.page.url().includes('/login');
  }

  async getErrorMessage(): Promise<string | null> {
    try {
      // Only look for actual error messages, not just any alert
      const actualError = this.page.locator('.error-message, .alert-danger, [role="alert"]:has-text("error"), [role="alert"]:has-text("failed"), [role="alert"]:has-text("invalid")');
      if (await actualError.isVisible({ timeout: 1000 })) {
        return await actualError.textContent();
      }
    } catch {
      // No error found
    }
    return null;
  }
}