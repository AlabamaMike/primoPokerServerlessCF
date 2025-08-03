/**
 * Token manager for handling JWT refresh and expiration
 */
export class TokenManager {
  private static refreshPromise: Promise<void> | null = null;
  private static refreshTimer: NodeJS.Timeout | null = null;

  /**
   * Set up auto-refresh for tokens
   */
  static setupAutoRefresh(expiresAt: Date, refreshCallback: () => Promise<void>) {
    // Clear existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    // Calculate when to refresh (5 minutes before expiry)
    const expiryTime = expiresAt.getTime();
    const now = Date.now();
    const refreshIn = expiryTime - now - (5 * 60 * 1000); // 5 minutes before expiry

    if (refreshIn > 0) {
      this.refreshTimer = setTimeout(async () => {
        try {
          await refreshCallback();
        } catch (error) {
          console.error('Token refresh failed:', error);
        }
      }, refreshIn);
    }
  }

  /**
   * Clear auto-refresh timer
   */
  static clearAutoRefresh() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Check if token is expired or about to expire
   */
  static isTokenExpiringSoon(expiresAt: Date | string): boolean {
    const expiry = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
    const now = Date.now();
    const timeUntilExpiry = expiry.getTime() - now;
    
    // Consider token expiring if less than 5 minutes remaining
    return timeUntilExpiry < (5 * 60 * 1000);
  }

  /**
   * Parse JWT token to extract expiration
   */
  static parseTokenExpiration(token: string): Date | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      
      const payload = JSON.parse(atob(parts[1]));
      if (!payload.exp) return null;
      
      return new Date(payload.exp * 1000);
    } catch (error) {
      console.error('Failed to parse token:', error);
      return null;
    }
  }
}