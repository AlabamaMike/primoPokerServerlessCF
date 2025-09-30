/**
 * Input Sanitization Utilities
 * 
 * Provides sanitization functions for wallet endpoints to prevent injection attacks
 */

import { z } from 'zod';

/**
 * Sanitize string input - removes potentially dangerous characters
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  // Remove control characters except for standard whitespace
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  // Limit length to prevent memory issues
  const MAX_STRING_LENGTH = 10000;
  if (sanitized.length > MAX_STRING_LENGTH) {
    sanitized = sanitized.substring(0, MAX_STRING_LENGTH);
  }

  return sanitized;
}

/**
 * Sanitize numeric input
 */
export function sanitizeNumber(input: any): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input;
  }

  if (typeof input === 'string') {
    const parsed = parseFloat(input);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

/**
 * Sanitize amount values for financial operations
 */
export function sanitizeAmount(amount: any): number {
  const sanitized = sanitizeNumber(amount);
  
  if (sanitized === null || sanitized <= 0) {
    throw new Error('Invalid amount: must be a positive number');
  }

  // Limit to 2 decimal places for currency
  const rounded = Math.round(sanitized * 100) / 100;

  // Maximum amount check (prevent overflow)
  const MAX_AMOUNT = 1000000000; // 1 billion
  if (rounded > MAX_AMOUNT) {
    throw new Error(`Amount exceeds maximum allowed value of ${MAX_AMOUNT}`);
  }

  return rounded;
}

/**
 * Sanitize player ID (UUID format)
 */
export function sanitizePlayerId(id: string): string {
  const sanitized = sanitizeString(id);
  
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(sanitized)) {
    throw new Error('Invalid player ID format');
  }

  return sanitized.toLowerCase();
}

/**
 * Sanitize table ID
 */
export function sanitizeTableId(id: string): string {
  const sanitized = sanitizeString(id);
  
  // Allow alphanumeric, hyphens, and underscores
  const validTableId = /^[a-zA-Z0-9_-]+$/;
  if (!validTableId.test(sanitized) || sanitized.length > 100) {
    throw new Error('Invalid table ID format');
  }

  return sanitized;
}

/**
 * Deep sanitize an object recursively
 */
export function sanitizeObject(obj: any, maxDepth: number = 10): any {
  if (maxDepth <= 0) {
    throw new Error('Maximum object depth exceeded');
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'number') {
    return sanitizeNumber(obj);
  }

  if (typeof obj === 'boolean') {
    return obj;
  }

  if (typeof obj === 'string') {
    // Try to parse as number first
    const asNumber = sanitizeNumber(obj);
    if (asNumber !== null) {
      return asNumber;
    }
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, maxDepth - 1));
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    const keys = Object.keys(obj);

    // Limit number of keys to prevent DoS
    const MAX_KEYS = 100;
    if (keys.length > MAX_KEYS) {
      throw new Error(`Object has too many keys (${keys.length} > ${MAX_KEYS})`);
    }

    for (const key of keys) {
      const sanitizedKey = sanitizeString(key);
      if (sanitizedKey) {
        sanitized[sanitizedKey] = sanitizeObject(obj[key], maxDepth - 1);
      }
    }

    return sanitized;
  }

  // For functions, symbols, and other types, return undefined
  return undefined;
}

/**
 * Create a sanitized request body validator
 */
export function createSanitizedValidator<T>(schema: z.ZodSchema<T>) {
  return (data: unknown): { success: true; data: T } | { success: false; error: string } => {
    try {
      // First sanitize the input
      const sanitized = sanitizeObject(data);
      
      // Then validate with Zod
      const result = schema.parse(sanitized);
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof z.ZodError) {
        // ZodError has 'issues' property (runtime) though TypeScript types say 'errors'
        const issues = (error as any).issues || error.errors || [];
        const messages = issues.map((e: any) => e.message).join(', ');
        return { success: false, error: messages || 'Validation failed' };
      }
      if (error instanceof Error) {
        return { success: false, error: error.message };
      }
      return { success: false, error: 'Invalid request data' };
    }
  };
}

/**
 * Sanitize wallet operation parameters
 */
export interface SanitizedWalletParams {
  amount?: number;
  method?: string;
  tableId?: string;
  playerId?: string;
  transactionId?: string;
  cursor?: string;
  limit?: number;
}

export function sanitizeWalletParams(params: any): SanitizedWalletParams {
  const sanitized: SanitizedWalletParams = {};

  if (params.amount !== undefined) {
    sanitized.amount = sanitizeAmount(params.amount);
  }

  if (params.method !== undefined) {
    const method = sanitizeString(params.method);
    // Whitelist allowed methods
    const allowedMethods = ['credit_card', 'bank', 'check'];
    if (allowedMethods.includes(method)) {
      sanitized.method = method;
    } else {
      throw new Error('Invalid payment method');
    }
  }

  if (params.tableId !== undefined) {
    sanitized.tableId = sanitizeTableId(params.tableId);
  }

  if (params.playerId !== undefined) {
    sanitized.playerId = sanitizePlayerId(params.playerId);
  }

  if (params.transactionId !== undefined) {
    sanitized.transactionId = sanitizeString(params.transactionId);
  }

  if (params.cursor !== undefined) {
    sanitized.cursor = sanitizeString(params.cursor);
  }

  if (params.limit !== undefined) {
    const limit = sanitizeNumber(params.limit);
    if (limit !== null && limit > 0 && limit <= 100) {
      sanitized.limit = Math.floor(limit);
    }
  }

  return sanitized;
}