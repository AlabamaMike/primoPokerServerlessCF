import { DefaultPIIFilter } from '../pii-filter';

describe('PII Filter Edge Cases', () => {
  let filter: DefaultPIIFilter;

  beforeEach(() => {
    filter = new DefaultPIIFilter();
  });

  describe('Nested objects with multiple levels of sensitive data', () => {
    it('should filter deeply nested sensitive data', () => {
      const data = {
        level1: {
          email: 'user1@example.com',
          level2: {
            password: 'secretPassword123',
            level3: {
              apiKey: 'sk_live_abcdef123456',
              level4: {
                creditCard: '4532-1234-5678-9012',
                userData: {
                  ssn: '123-45-6789',
                  phoneNumber: '+1 (555) 123-4567',
                  name: 'John Doe',
                }
              }
            }
          }
        }
      };

      const result = filter.filter(data) as any;

      expect(result.level1.email).toBe('[EMAIL_REDACTED]');
      expect(result.level1.level2.password).toBe('[REDACTED]');
      expect(result.level1.level2.level3.apiKey).toBe('[REDACTED]');
      expect(result.level1.level2.level3.level4.creditCard).toBe('[CC_REDACTED]');
      expect(result.level1.level2.level3.level4.userData.ssn).toBe('[SSN_REDACTED]');
      expect(result.level1.level2.level3.level4.userData.phoneNumber).toBe('[PHONE_REDACTED]');
      expect(result.level1.level2.level3.level4.userData.name).toBe('John Doe');
    });

    it('should handle objects with mixed sensitive key variations', () => {
      const data = {
        Password: 'test123',
        PASSWORD: 'test456',
        passWord: 'test789',
        api_key: 'key123',
        apiKey: 'key456',
        ApiKey: 'key789',
        API_KEY: 'key000',
        cardNumber: '4111111111111111',
        card_number: '5555555555554444',
        CardNumber: '3782822463100005',
      };

      const result = filter.filter(data) as any;

      expect(result.Password).toBe('[REDACTED]');
      expect(result.PASSWORD).toBe('[REDACTED]');
      expect(result.passWord).toBe('[REDACTED]');
      expect(result.api_key).toBe('[REDACTED]');
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.ApiKey).toBe('[REDACTED]');
      expect(result.API_KEY).toBe('[REDACTED]');
      expect(result.cardNumber).toBe('[REDACTED]');
      expect(result.card_number).toBe('[REDACTED]');
      expect(result.CardNumber).toBe('[REDACTED]');
    });
  });

  describe('Arrays containing mixed sensitive and non-sensitive data', () => {
    it('should filter arrays with mixed data types', () => {
      const data = [
        'normal string',
        'email@example.com',
        42,
        { password: 'secret', name: 'public' },
        ['nested', 'user@test.com', { token: 'jwt123' }],
        null,
        undefined,
        true,
        '1234-5678-9012-3456',
      ];

      const result = filter.filter(data) as any[];

      expect(result[0]).toBe('normal string');
      expect(result[1]).toBe('[EMAIL_REDACTED]');
      expect(result[2]).toBe(42);
      expect(result[3]).toEqual({ password: '[REDACTED]', name: 'public' });
      expect(result[4]).toEqual(['nested', '[EMAIL_REDACTED]', { token: '[REDACTED]' }]);
      expect(result[5]).toBe(null);
      expect(result[6]).toBe(undefined);
      expect(result[7]).toBe(true);
      expect(result[8]).toBe('[CC_REDACTED]');
    });

    it('should handle arrays of objects with sensitive data', () => {
      const users = [
        { id: 1, email: 'user1@example.com', role: 'admin' },
        { id: 2, email: 'user2@example.com', password: 'pass123' },
        { id: 3, phone: '555-123-4567', ssn: '987-65-4321' },
      ];

      const result = filter.filter(users) as any[];

      expect(result[0]).toEqual({ id: 1, email: '[EMAIL_REDACTED]', role: 'admin' });
      expect(result[1]).toEqual({ id: 2, email: '[EMAIL_REDACTED]', password: '[REDACTED]' });
      expect(result[2]).toEqual({ id: 3, phone: '[PHONE_REDACTED]', ssn: '[SSN_REDACTED]' });
    });
  });

  describe('Edge cases for regex patterns', () => {
    it('should handle partial matches and boundary conditions', () => {
      const testCases = [
        // Email edge cases
        { input: 'not.an.email', expected: 'not.an.email' },
        { input: '@example.com', expected: '@example.com' },
        { input: 'user@', expected: 'user@' },
        { input: 'user@example', expected: 'user@example' },
        { input: 'user@example.c', expected: 'user@example.c' },
        { input: 'user+tag@example.com', expected: '[EMAIL_REDACTED]' },
        { input: 'user.name+tag@sub.example.com', expected: '[EMAIL_REDACTED]' },
        
        // Credit card edge cases
        { input: '1234567890123456', expected: '[CC_REDACTED]' },
        { input: '1234 5678 9012 3456', expected: '[CC_REDACTED]' },
        { input: '1234-5678-9012-3456', expected: '[CC_REDACTED]' },
        { input: '123456789012345', expected: '123456789012345' }, // 15 digits
        { input: '12345678901234567', expected: '12345678901234567' }, // 17 digits
        
        // SSN edge cases
        { input: '123-45-678', expected: '123-45-678' }, // Missing digit
        { input: '123-456-789', expected: '123-456-789' }, // Wrong format
        { input: '12-34-5678', expected: '12-34-5678' }, // Wrong format
        
        // Phone edge cases
        { input: '(555) 123-4567', expected: '[PHONE_REDACTED]' },
        { input: '+1-555-123-4567', expected: '[PHONE_REDACTED]' },
        { input: '555.123.4567', expected: '[PHONE_REDACTED]' },
        { input: '5551234567', expected: '[PHONE_REDACTED]' },
        { input: '555-123-456', expected: '555-123-456' }, // Too short
        { input: '555-123-45678', expected: '555-123-45678' }, // Too long
        
        // IP address edge cases
        { input: '192.168.1.1', expected: '[IP_REDACTED]' },
        { input: '0.0.0.0', expected: '[IP_REDACTED]' },
        { input: '255.255.255.255', expected: '[IP_REDACTED]' },
        { input: '256.1.1.1', expected: '256.1.1.1' }, // Invalid octet
        { input: '192.168.1', expected: '192.168.1' }, // Missing octet
        { input: '192.168.1.1.1', expected: '[IP_REDACTED].1' }, // Extra octet
        
        // JWT edge cases
        { input: 'Bearer abc.def.ghi', expected: 'Bearer [TOKEN_REDACTED]' },
        { input: 'Bearer abc.def', expected: 'Bearer abc.def' }, // Missing part
        { input: 'abc.def.ghi', expected: 'abc.def.ghi' }, // Missing Bearer
      ];

      testCases.forEach(({ input, expected }) => {
        expect(filter.filter(input)).toBe(expected);
      });
    });

    it('should handle multiple patterns in same string', () => {
      const text = 'Contact user@example.com or call 555-123-4567. Payment: 1234-5678-9012-3456';
      const result = filter.filter(text);
      
      expect(result).toBe('Contact [EMAIL_REDACTED] or call [PHONE_REDACTED]. Payment: [CC_REDACTED]');
    });

    it('should handle patterns at string boundaries', () => {
      const testCases = [
        { input: 'user@example.com is the email', expected: '[EMAIL_REDACTED] is the email' },
        { input: 'Email is user@example.com', expected: 'Email is [EMAIL_REDACTED]' },
        { input: '555-123-4567', expected: '[PHONE_REDACTED]' },
        { input: 'Call555-123-4567now', expected: 'Call[PHONE_REDACTED]now' },
      ];

      testCases.forEach(({ input, expected }) => {
        expect(filter.filter(input)).toBe(expected);
      });
    });
  });

  describe('Performance tests with large objects', () => {
    it('should handle large objects efficiently', () => {
      const largeObject: any = {};
      const numKeys = 10000;
      
      // Create large object with mix of sensitive and non-sensitive data
      for (let i = 0; i < numKeys; i++) {
        if (i % 10 === 0) {
          largeObject[`email_${i}`] = `user${i}@example.com`;
        } else if (i % 10 === 1) {
          largeObject[`password_${i}`] = `secret${i}`;
        } else if (i % 10 === 2) {
          largeObject[`cc_${i}`] = '1234-5678-9012-3456';
        } else {
          largeObject[`data_${i}`] = `value${i}`;
        }
      }

      const startTime = performance.now();
      const result = filter.filter(largeObject) as any;
      const endTime = performance.now();

      // Should complete in reasonable time (less than 1 second for 10k keys)
      expect(endTime - startTime).toBeLessThan(1000);

      // Verify filtering worked correctly
      expect(result.email_0).toBe('[EMAIL_REDACTED]');
      expect(result.password_1).toBe('[REDACTED]');
      expect(result.cc_2).toBe('[CC_REDACTED]');
      expect(result.data_3).toBe('value3');
    });

    it('should handle deeply nested large structures', () => {
      const createNestedObject = (depth: number, breadth: number): any => {
        if (depth === 0) {
          return {
            email: 'test@example.com',
            data: 'leaf node',
          };
        }
        
        const obj: any = {};
        for (let i = 0; i < breadth; i++) {
          obj[`node_${i}`] = createNestedObject(depth - 1, breadth);
        }
        return obj;
      };

      // Create object with depth 5 and breadth 5 (3125 leaf nodes)
      const deepObject = createNestedObject(5, 5);
      
      const startTime = performance.now();
      const result = filter.filter(deepObject);
      const endTime = performance.now();

      // Should complete in reasonable time
      expect(endTime - startTime).toBeLessThan(2000);

      // Verify deep filtering worked
      const checkFiltered = (obj: any, depth: number): void => {
        if (depth === 0) {
          expect(obj.email).toBe('[EMAIL_REDACTED]');
          expect(obj.data).toBe('leaf node');
        } else {
          Object.keys(obj).forEach(key => {
            checkFiltered(obj[key], depth - 1);
          });
        }
      };

      checkFiltered(result, 5);
    });
  });

  describe('Unicode and international format edge cases', () => {
    it('should handle unicode characters in sensitive data', () => {
      const data = {
        email: 'user@例え.jp',
        name: 'José García',
        password: 'пароль123',
        description: 'Contact 用户@example.com for info',
      };

      const result = filter.filter(data) as any;

      expect(result.email).toBe('[EMAIL_REDACTED]');
      expect(result.name).toBe('José García');
      expect(result.password).toBe('[REDACTED]');
      expect(result.description).toBe('Contact [EMAIL_REDACTED] for info');
    });

    it('should handle international phone formats', () => {
      const internationalPhones = [
        { phone: '+44 20 7123 4567', country: 'UK' },
        { phone: '+33 1 23 45 67 89', country: 'France' },
        { phone: '+49 30 12345678', country: 'Germany' },
        { phone: '+81 3-1234-5678', country: 'Japan' },
        { phone: '+86 138 0000 0000', country: 'China' },
        { phone: '+91 98765 43210', country: 'India' },
        { phone: '+55 11 91234-5678', country: 'Brazil' },
      ];

      // Note: Current implementation may not catch all international formats
      // This test documents current behavior and limitations
      internationalPhones.forEach(({ phone, country }) => {
        const result = filter.filter(`Call ${phone} for support`);
        // Current regex is optimized for US phone numbers
        // Most international formats are not filtered (documenting current behavior)
        if (country === 'Japan') {
          // Japanese format with dashes matches the pattern partially
          expect(result).toContain(phone);
        } else {
          expect(result).toContain(phone); // Currently not filtered
        }
      });
    });

    it('should handle multi-byte characters correctly', () => {
      const data = {
        message: 'Email: 测试@example.com',
        unicode_email: '🎉party@example.com',
        rtl_text: 'البريد: user@example.com',
        mixed: 'データ: 4532-1234-5678-9012',
      };

      const result = filter.filter(data) as any;

      expect(result.message).toBe('Email: [EMAIL_REDACTED]');
      expect(result.unicode_email).toBe('🎉[EMAIL_REDACTED]');
      expect(result.rtl_text).toBe('البريد: [EMAIL_REDACTED]');
      expect(result.mixed).toBe('データ: [CC_REDACTED]');
    });
  });

  describe('Circular reference handling', () => {
    it('should handle objects with circular references', () => {
      const obj: any = {
        email: 'test@example.com',
        data: 'some data',
      };
      obj.self = obj; // Create circular reference

      const result = filter.filter(obj) as any;
      
      expect(result.email).toBe('[EMAIL_REDACTED]');
      expect(result.data).toBe('some data');
      expect(result.self).toBe('[CIRCULAR_REFERENCE]');
    });

    it('should handle arrays with circular references', () => {
      const arr: any[] = ['test@example.com', 'data'];
      arr.push(arr); // Create circular reference

      const result = filter.filter(arr) as any[];
      
      expect(result[0]).toBe('[EMAIL_REDACTED]');
      expect(result[1]).toBe('data');
      expect(result[2]).toBe('[CIRCULAR_REFERENCE]');
    });

    it('should handle complex circular structures', () => {
      const obj1: any = { id: 1, email: 'user1@example.com' };
      const obj2: any = { id: 2, password: 'secret' };
      obj1.friend = obj2;
      obj2.friend = obj1; // Create circular reference

      const result = filter.filter(obj1) as any;
      
      expect(result.id).toBe(1);
      expect(result.email).toBe('[EMAIL_REDACTED]');
      expect(result.friend.id).toBe(2);
      expect(result.friend.password).toBe('[REDACTED]');
      expect(result.friend.friend).toBe('[CIRCULAR_REFERENCE]');
    });
  });

  describe('Custom object toString() method handling', () => {
    it('should handle objects with custom toString methods', () => {
      const customObject = {
        email: 'test@example.com',
        toString() {
          return 'Custom string with secret@example.com';
        },
      };

      const result = filter.filter(customObject) as any;

      // Filter operates on object properties, not toString representation
      expect(result.email).toBe('[EMAIL_REDACTED]');
      expect(result.toString).toBeDefined();
      expect(typeof result.toString).toBe('function');
    });

    it('should handle class instances with sensitive data', () => {
      class User {
        constructor(
          public email: string,
          public password: string,
          private apiKey: string
        ) {}

        toString() {
          return `User: ${this.email}`;
        }
      }

      const user = new User('user@example.com', 'secret123', 'sk_test_123');
      const result = filter.filter(user) as any;

      expect(result.email).toBe('[EMAIL_REDACTED]');
      expect(result.password).toBe('[REDACTED]');
      expect(result.apiKey).toBe('[REDACTED]');
    });

    it('should handle objects with valueOf methods', () => {
      const sensitiveValue = {
        value: '1234-5678-9012-3456',
        valueOf() {
          return this.value;
        },
        toString() {
          return `Card: ${this.value}`;
        },
      };

      const result = filter.filter(sensitiveValue) as any;

      expect(result.value).toBe('[CC_REDACTED]');
      expect(result.valueOf).toBeDefined();
      expect(result.toString).toBeDefined();
    });

    it('should handle Date objects and other built-ins', () => {
      const data = {
        created: new Date('2024-01-01'),
        email: 'user@example.com',
        regex: /test@example\.com/g,
        error: new Error('Secret: password123'),
        map: new Map([['key', 'value@example.com']]),
        set: new Set(['item', 'test@example.com']),
      };

      const result = filter.filter(data) as any;

      expect(result.created).toEqual(new Date('2024-01-01'));
      expect(result.email).toBe('[EMAIL_REDACTED]');
      expect(result.regex).toEqual(/test@example\.com/g);
      expect(result.error).toEqual(new Error('Secret: password123')); // Error message not filtered
      expect(result.map).toEqual(new Map([['key', 'value@example.com']])); // Map values not filtered
      expect(result.set).toEqual(new Set(['item', 'test@example.com'])); // Set values not filtered
    });
  });

  describe('Special data type handling', () => {
    it('should handle symbols as object keys', () => {
      const symKey = Symbol('sensitive');
      const data = {
        [symKey]: 'password123',
        email: 'test@example.com',
      };

      const result = filter.filter(data) as any;

      expect(result.email).toBe('[EMAIL_REDACTED]');
      // Symbols are not enumerable by Object.entries
      expect(result[symKey]).toBeUndefined();
    });

    it('should handle null and undefined values', () => {
      const data = {
        email: null,
        password: undefined,
        apiKey: '',
        data: {
          nested: null,
          array: [null, undefined, ''],
        },
      };

      const result = filter.filter(data) as any;

      expect(result.email).toBe(null);
      expect(result.password).toBe(undefined);
      expect(result.apiKey).toBe('[REDACTED]'); // Empty string but sensitive key
      expect(result.data.nested).toBe(null);
      expect(result.data.array).toEqual([null, undefined, '']);
    });

    it('should handle mixed content in strings', () => {
      const mixedContent = {
        log: 'User user@example.com logged in from 192.168.1.1 with token Bearer abc.def.ghi',
        transaction: 'Payment of $100 with card 1234-5678-9012-3456 from phone 555-123-4567',
        profile: 'Name: John Doe, SSN: 123-45-6789, Email: john@example.com',
      };

      const result = filter.filter(mixedContent) as any;

      expect(result.log).toBe('User [EMAIL_REDACTED] logged in from [IP_REDACTED] with token Bearer [TOKEN_REDACTED]');
      expect(result.transaction).toBe('Payment of $100 with card [CC_REDACTED] from phone [PHONE_REDACTED]');
      expect(result.profile).toBe('Name: John Doe, SSN: [SSN_REDACTED], Email: [EMAIL_REDACTED]');
    });
  });
});