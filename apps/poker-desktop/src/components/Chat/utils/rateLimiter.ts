interface RateLimiterConfig {
  maxMessages: number;
  windowMs: number;
}

export class RateLimiter {
  private messageTimestamps: number[] = [];
  private config: RateLimiterConfig;

  constructor(config: RateLimiterConfig = { maxMessages: 10, windowMs: 60000 }) {
    this.config = config;
  }

  /**
   * Checks if a message can be sent based on rate limiting rules
   * @returns true if message can be sent, false if rate limited
   */
  canSendMessage(): boolean {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    // Remove timestamps outside the current window
    this.messageTimestamps = this.messageTimestamps.filter(
      timestamp => timestamp > windowStart
    );
    
    // Check if we've exceeded the limit
    return this.messageTimestamps.length < this.config.maxMessages;
  }

  /**
   * Records a message being sent
   */
  recordMessage(): void {
    this.messageTimestamps.push(Date.now());
  }

  /**
   * Gets the number of messages sent in the current window
   */
  getMessageCount(): number {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    this.messageTimestamps = this.messageTimestamps.filter(
      timestamp => timestamp > windowStart
    );
    
    return this.messageTimestamps.length;
  }

  /**
   * Gets the time until the next message can be sent (in ms)
   * @returns 0 if message can be sent now, otherwise ms to wait
   */
  getTimeUntilNextMessage(): number {
    if (this.canSendMessage()) {
      return 0;
    }
    
    const oldestTimestamp = Math.min(...this.messageTimestamps);
    const windowEnd = oldestTimestamp + this.config.windowMs;
    const now = Date.now();
    
    return Math.max(0, windowEnd - now);
  }

  /**
   * Resets the rate limiter
   */
  reset(): void {
    this.messageTimestamps = [];
  }
}

// Factory function to create rate limiter instances
export const createRateLimiter = (config?: Partial<RateLimiterConfig>): RateLimiter => {
  return new RateLimiter({
    maxMessages: config?.maxMessages ?? 10,  // 10 messages
    windowMs: config?.windowMs ?? 60000      // per minute
  });
};

// Default rate limiter instance for backward compatibility
export const defaultRateLimiter = createRateLimiter();