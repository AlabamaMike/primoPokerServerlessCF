export class ErrorSanitizer {
  /**
   * Sanitizes error messages to prevent information disclosure
   * Removes sensitive information like tokens, passwords, internal state
   */
  static sanitizeError(error: Error | unknown): Error {
    if (!(error instanceof Error)) {
      return new Error('An error occurred');
    }

    const message = error.message.toLowerCase();
    
    // Check for sensitive patterns
    if (
      message.includes('token') ||
      message.includes('password') ||
      message.includes('secret') ||
      message.includes('key') ||
      message.includes('auth') ||
      message.includes('circuit breaker')
    ) {
      return new Error('Authentication or system error occurred');
    }

    // Check for internal state exposure
    if (
      message.includes('state') ||
      message.includes('internal') ||
      message.includes('stack')
    ) {
      return new Error('System error occurred');
    }

    // Check for network/connection details
    if (
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('network')
    ) {
      return new Error('Connection error occurred');
    }

    // Default sanitization - return generic message for production
    return new Error('An error occurred while processing your request');
  }

  /**
   * Sanitizes error objects for logging
   * Removes sensitive fields but preserves structure for debugging
   */
  static sanitizeForLogging(error: any): any {
    if (!error || typeof error !== 'object') {
      return error;
    }

    const sanitized = { ...error };
    const sensitiveFields = [
      'token',
      'password',
      'secret',
      'key',
      'authorization',
      'cookie',
      'session',
      'credentials'
    ];

    // Remove sensitive fields
    for (const field of Object.keys(sanitized)) {
      if (sensitiveFields.some(sensitive => field.toLowerCase().includes(sensitive))) {
        sanitized[field] = '[REDACTED]';
      }
    }

    // Sanitize nested objects
    for (const [key, value] of Object.entries(sanitized)) {
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        sanitized[key] = this.sanitizeForLogging(value);
      }
    }

    return sanitized;
  }
}