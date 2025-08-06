import { PIIFilter } from './types';

export class DefaultPIIFilter implements PIIFilter {
  private readonly patterns = {
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
    creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    phone: /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    jwt: /Bearer\s+[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g,
  };

  private readonly replacements: Record<string, string> = {
    email: '[EMAIL_REDACTED]',
    creditCard: '[CC_REDACTED]',
    ssn: '[SSN_REDACTED]',
    phone: '[PHONE_REDACTED]',
    ipAddress: '[IP_REDACTED]',
    jwt: 'Bearer [TOKEN_REDACTED]',
  };

  filter(data: any, visitedObjects?: WeakSet<object>): any {
    // Initialize visited objects set on first call
    if (!visitedObjects) {
      visitedObjects = new WeakSet<object>();
    }

    if (typeof data === 'string') {
      return this.filterString(data);
    }
    
    if (Array.isArray(data)) {
      // Check for circular reference
      if (visitedObjects.has(data)) {
        return '[CIRCULAR_REFERENCE]';
      }
      visitedObjects.add(data);
      
      return data.map(item => this.filter(item, visitedObjects));
    }
    
    if (data && typeof data === 'object') {
      // Check for circular reference
      if (visitedObjects.has(data)) {
        return '[CIRCULAR_REFERENCE]';
      }
      visitedObjects.add(data);
      
      const filtered: any = {};
      for (const [key, value] of Object.entries(data)) {
        // Filter sensitive keys entirely
        if (this.isSensitiveKey(key)) {
          filtered[key] = '[REDACTED]';
        } else {
          filtered[key] = this.filter(value, visitedObjects);
        }
      }
      return filtered;
    }
    
    return data;
  }

  private filterString(str: string): string {
    let filtered = str;
    
    for (const [type, pattern] of Object.entries(this.patterns)) {
      const replacement = this.replacements[type];
      if (replacement) {
        filtered = filtered.replace(pattern, replacement);
      }
    }
    
    return filtered;
  }

  private isSensitiveKey(key: string): boolean {
    const sensitiveKeys = [
      'password',
      'secret',
      'token',
      'apikey',
      'api_key',
      'authorization',
      'auth',
      'cookie',
      'session',
      'private',
      'cardnumber',
      'card_number',
      'cvv',
      'cvc',
    ];
    
    const lowerKey = key.toLowerCase();
    return sensitiveKeys.some(sensitive => lowerKey.includes(sensitive));
  }
}