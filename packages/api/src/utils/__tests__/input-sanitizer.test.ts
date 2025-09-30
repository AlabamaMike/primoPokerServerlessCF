import {
  sanitizeString,
  sanitizeNumber,
  sanitizeAmount,
  sanitizePlayerId,
  sanitizeTableId,
  sanitizeObject,
  sanitizeWalletParams,
  createSanitizedValidator
} from '../input-sanitizer';
import { z } from 'zod';

describe('Input Sanitizer', () => {
  describe('sanitizeString', () => {
    it('should remove null bytes', () => {
      expect(sanitizeString('test\0string')).toBe('teststring');
    });

    it('should remove control characters', () => {
      expect(sanitizeString('test\x00\x01\x02string')).toBe('teststring');
    });

    it('should trim whitespace', () => {
      expect(sanitizeString('  test  ')).toBe('test');
    });

    it('should limit string length', () => {
      const longString = 'x'.repeat(15000);
      expect(sanitizeString(longString).length).toBe(10000);
    });

    it('should handle non-string input', () => {
      expect(sanitizeString(123 as any)).toBe('');
      expect(sanitizeString(null as any)).toBe('');
      expect(sanitizeString(undefined as any)).toBe('');
    });
  });

  describe('sanitizeNumber', () => {
    it('should accept valid numbers', () => {
      expect(sanitizeNumber(123)).toBe(123);
      expect(sanitizeNumber(123.45)).toBe(123.45);
      expect(sanitizeNumber(0)).toBe(0);
    });

    it('should parse numeric strings', () => {
      expect(sanitizeNumber('123')).toBe(123);
      expect(sanitizeNumber('123.45')).toBe(123.45);
    });

    it('should reject invalid inputs', () => {
      expect(sanitizeNumber('abc')).toBeNull();
      expect(sanitizeNumber(NaN)).toBeNull();
      expect(sanitizeNumber(Infinity)).toBeNull();
      expect(sanitizeNumber(null)).toBeNull();
    });
  });

  describe('sanitizeAmount', () => {
    it('should accept valid amounts', () => {
      expect(sanitizeAmount(100)).toBe(100);
      expect(sanitizeAmount(123.456)).toBe(123.46); // Rounded to 2 decimals
    });

    it('should reject invalid amounts', () => {
      expect(() => sanitizeAmount(0)).toThrow('Invalid amount');
      expect(() => sanitizeAmount(-100)).toThrow('Invalid amount');
      expect(() => sanitizeAmount('abc')).toThrow('Invalid amount');
    });

    it('should reject amounts exceeding maximum', () => {
      expect(() => sanitizeAmount(2000000000)).toThrow('Amount exceeds maximum');
    });
  });

  describe('sanitizePlayerId', () => {
    it('should accept valid UUIDs', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      expect(sanitizePlayerId(uuid)).toBe(uuid);
    });

    it('should convert to lowercase', () => {
      const uuid = '123E4567-E89B-12D3-A456-426614174000';
      expect(sanitizePlayerId(uuid)).toBe(uuid.toLowerCase());
    });

    it('should reject invalid formats', () => {
      expect(() => sanitizePlayerId('invalid-id')).toThrow('Invalid player ID format');
      expect(() => sanitizePlayerId('123')).toThrow('Invalid player ID format');
    });
  });

  describe('sanitizeTableId', () => {
    it('should accept valid table IDs', () => {
      expect(sanitizeTableId('table-123')).toBe('table-123');
      expect(sanitizeTableId('TABLE_456')).toBe('TABLE_456');
      expect(sanitizeTableId('test123')).toBe('test123');
    });

    it('should reject invalid characters', () => {
      expect(() => sanitizeTableId('table@123')).toThrow('Invalid table ID format');
      expect(() => sanitizeTableId('table 123')).toThrow('Invalid table ID format');
    });

    it('should reject IDs that are too long', () => {
      const longId = 'x'.repeat(101);
      expect(() => sanitizeTableId(longId)).toThrow('Invalid table ID format');
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize nested objects', () => {
      const input = {
        name: '  test  ',
        amount: '123.45',
        nested: {
          value: 'test\0value'
        }
      };

      const expected = {
        name: 'test',
        amount: 123.45,
        nested: {
          value: 'testvalue'
        }
      };

      expect(sanitizeObject(input)).toEqual(expected);
    });

    it('should handle arrays', () => {
      const input = ['  test  ', 123, null];
      const expected = ['test', 123, null];
      expect(sanitizeObject(input)).toEqual(expected);
    });

    it('should reject objects with too many keys', () => {
      const obj: any = {};
      for (let i = 0; i < 101; i++) {
        obj[`key${i}`] = i;
      }
      expect(() => sanitizeObject(obj)).toThrow('Object has too many keys');
    });

    it('should prevent deep recursion', () => {
      const deepObj: any = { a: { b: { c: { d: { e: { f: { g: { h: { i: { j: { k: {} } } } } } } } } } } };
      expect(() => sanitizeObject(deepObj, 5)).toThrow('Maximum object depth exceeded');
    });
  });

  describe('sanitizeWalletParams', () => {
    it('should sanitize valid wallet parameters', () => {
      const params = {
        amount: 123.456,
        method: 'credit_card',
        tableId: 'table-123',
        playerId: '123e4567-e89b-12d3-a456-426614174000',
        limit: 50
      };

      const result = sanitizeWalletParams(params);
      
      expect(result.amount).toBe(123.46);
      expect(result.method).toBe('credit_card');
      expect(result.tableId).toBe('table-123');
      expect(result.playerId).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(result.limit).toBe(50);
    });

    it('should reject invalid payment methods', () => {
      const params = { method: 'bitcoin' };
      expect(() => sanitizeWalletParams(params)).toThrow('Invalid payment method');
    });

    it('should limit query limits', () => {
      expect(sanitizeWalletParams({ limit: 200 }).limit).toBeUndefined();
      expect(sanitizeWalletParams({ limit: 50 }).limit).toBe(50);
    });
  });

  describe('createSanitizedValidator', () => {
    const schema = z.object({
      amount: z.number().positive(),
      method: z.string()
    });

    it('should sanitize and validate input', () => {
      const validator = createSanitizedValidator(schema);
      const result = validator({
        amount: '123.45',
        method: '  credit_card  '
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.amount).toBe(123.45);
        expect(result.data.method).toBe('credit_card');
      }
    });

    it('should handle sanitization errors', () => {
      const validator = createSanitizedValidator(schema);
      const obj: any = {};
      for (let i = 0; i < 101; i++) {
        obj[`key${i}`] = i;
      }

      const result = validator(obj);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Object has too many keys');
      }
    });

    it('should handle validation errors', () => {
      const validator = createSanitizedValidator(schema);
      const result = validator({
        amount: -100,
        method: 'test'
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('expected number to be >0');
      }
    });
  });
});