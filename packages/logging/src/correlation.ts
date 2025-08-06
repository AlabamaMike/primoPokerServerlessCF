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
    let result = '';
    const alphabetLength = this.ALPHABET.length;
    
    for (let i = 0; i < length; i++) {
      result += this.ALPHABET[Math.floor(Math.random() * alphabetLength)];
    }
    
    return result;
  }
}

export class RequestContext {
  private static storage = new Map<string, LogContext>();

  static set(requestId: string, context: LogContext): void {
    this.storage.set(requestId, context);
  }

  static get(requestId: string): LogContext | undefined {
    return this.storage.get(requestId);
  }

  static delete(requestId: string): void {
    this.storage.delete(requestId);
  }

  static clear(): void {
    this.storage.clear();
  }
}