import type { LogContext } from './types';

export class CorrelationIdGenerator {
  private static readonly ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
  
  static generate(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = this.generateRandomString(8);
    return `${timestamp}-${randomPart}`;
  }

  static generateShort(): string {
    return this.generateRandomString(12);
  }

  private static generateRandomString(length: number): string {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    
    let result = '';
    const alphabetLength = this.ALPHABET.length;
    
    for (let i = 0; i < length; i++) {
      result += this.ALPHABET[array[i] % alphabetLength];
    }
    
    return result;
  }
}

export class RequestContext {
  private static storage = new Map<string, LogContext>();
  private static timestamps = new Map<string, number>();
  private static readonly MAX_AGE_MS = 3600000; // 1 hour
  private static readonly MAX_SIZE = 10000; // Maximum number of contexts to store
  private static cleanupTimer?: any;

  static {
    // Start cleanup timer in Cloudflare Workers environment
    if (typeof globalThis !== 'undefined') {
      this.startCleanupTimer();
    }
  }

  static set(requestId: string, context: LogContext): void {
    // Check size limit
    if (this.storage.size >= this.MAX_SIZE) {
      // Remove oldest entry
      const oldestKey = this.findOldestKey();
      if (oldestKey) {
        this.delete(oldestKey);
      }
    }

    this.storage.set(requestId, context);
    this.timestamps.set(requestId, Date.now());
  }

  static get(requestId: string): LogContext | undefined {
    const context = this.storage.get(requestId);
    if (context) {
      // Check if context is expired
      const timestamp = this.timestamps.get(requestId);
      if (timestamp && Date.now() - timestamp > this.MAX_AGE_MS) {
        this.delete(requestId);
        return undefined;
      }
    }
    return context;
  }

  static delete(requestId: string): void {
    this.storage.delete(requestId);
    this.timestamps.delete(requestId);
  }

  static clear(): void {
    this.storage.clear();
    this.timestamps.clear();
  }

  private static findOldestKey(): string | undefined {
    let oldestKey: string | undefined;
    let oldestTime = Date.now();

    for (const [key, timestamp] of this.timestamps.entries()) {
      if (timestamp < oldestTime) {
        oldestTime = timestamp;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  private static cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, timestamp] of this.timestamps.entries()) {
      if (now - timestamp > this.MAX_AGE_MS) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.delete(key);
    }
  }

  private static startCleanupTimer(): void {
    // Run cleanup every 5 minutes
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 300000);
  }

  static stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }
}