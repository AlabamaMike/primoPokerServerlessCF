import { describe, it, expect } from '@jest/globals';
import { 
  authSchemas, 
  walletSchemas, 
  gameSchemas, 
  profileSchemas,
  adminSchemas,
  validateRequest 
} from '../validation/schemas';

describe('Validation Schemas', () => {
  describe('Auth Schemas', () => {
    describe('register', () => {
      it('should validate correct registration data', () => {
        const data = {
          email: 'test@example.com',
          username: 'testuser123',
          password: 'Test123!@#',
          referralCode: 'REF123',
        };
        
        const result = authSchemas.register.parse(data);
        expect(result.email).toBe('test@example.com');
        expect(result.username).toBe('testuser123');
      });

      it('should reject weak passwords', () => {
        const data = {
          email: 'test@example.com',
          username: 'testuser',
          password: 'weak',
        };
        
        expect(() => authSchemas.register.parse(data)).toThrow();
      });

      it('should reject reserved usernames', () => {
        const data = {
          email: 'test@example.com',
          username: 'admin',
          password: 'Test123!@#',
        };
        
        expect(() => authSchemas.register.parse(data)).toThrow('reserved');
      });

      it('should reject invalid email formats', () => {
        const data = {
          email: 'notanemail',
          username: 'testuser',
          password: 'Test123!@#',
        };
        
        expect(() => authSchemas.register.parse(data)).toThrow();
      });
    });

    describe('password requirements', () => {
      const testCases = [
        { password: 'Test123!', valid: true },
        { password: 'test123!', valid: false }, // No uppercase
        { password: 'TEST123!', valid: false }, // No lowercase
        { password: 'Testtest!', valid: false }, // No number
        { password: 'Test1234', valid: false }, // No special char
        { password: 'Test1!', valid: false }, // Too short
      ];

      testCases.forEach(({ password, valid }) => {
        it(`should ${valid ? 'accept' : 'reject'} password: ${password}`, () => {
          const data = {
            email: 'test@example.com',
            username: 'testuser',
            password,
          };
          
          if (valid) {
            expect(() => authSchemas.register.parse(data)).not.toThrow();
          } else {
            expect(() => authSchemas.register.parse(data)).toThrow();
          }
        });
      });
    });
  });

  describe('Wallet Schemas', () => {
    describe('deposit', () => {
      it('should validate correct deposit data', () => {
        const data = {
          amount: 100.50,
          paymentMethod: 'card',
          timestamp: Date.now(),
        };
        
        const result = walletSchemas.deposit.parse(data);
        expect(result.amount).toBe(100.50);
        expect(result.paymentMethod).toBe('card');
      });

      it('should reject negative amounts', () => {
        const data = {
          amount: -50,
          paymentMethod: 'card',
          timestamp: Date.now(),
        };
        
        expect(() => walletSchemas.deposit.parse(data)).toThrow();
      });

      it('should reject old timestamps', () => {
        const data = {
          amount: 100,
          paymentMethod: 'card',
          timestamp: Date.now() - 10 * 60 * 1000, // 10 minutes old
        };
        
        expect(() => walletSchemas.deposit.parse(data)).toThrow('too old');
      });
    });

    describe('transfer', () => {
      it('should sanitize note field', () => {
        const data = {
          recipientId: '123e4567-e89b-12d3-a456-426614174000',
          amount: 50,
          note: '<script>alert("xss")</script>',
          timestamp: Date.now(),
        };
        
        const result = walletSchemas.transfer.parse(data);
        expect(result.note).toBe('alert("xss")');
      });
    });
  });

  describe('Game Schemas', () => {
    describe('chat', () => {
      it('should sanitize chat messages', () => {
        const data = {
          tableId: '123e4567-e89b-12d3-a456-426614174000',
          message: 'Hello <b>world</b> <script>alert(1)</script>',
        };
        
        const result = gameSchemas.chat.parse(data);
        expect(result.message).toBe('Hello world alert(1)');
      });

      it('should enforce message length limit', () => {
        const data = {
          tableId: '123e4567-e89b-12d3-a456-426614174000',
          message: 'a'.repeat(501),
        };
        
        expect(() => gameSchemas.chat.parse(data)).toThrow();
      });
    });
  });

  describe('Admin Schemas', () => {
    describe('adjustBalance', () => {
      it('should require signature for balance adjustments', () => {
        const data = {
          playerId: '123e4567-e89b-12d3-a456-426614174000',
          amount: -50,
          reason: 'Chargeback from disputed transaction',
          signature: 'a'.repeat(64),
        };
        
        const result = adminSchemas.adjustBalance.parse(data);
        expect(result.amount).toBe(-50);
        expect(result.signature).toHaveLength(64);
      });

      it('should reject short signatures', () => {
        const data = {
          playerId: '123e4567-e89b-12d3-a456-426614174000',
          amount: 100,
          reason: 'Manual adjustment',
          signature: 'tooshort',
        };
        
        expect(() => adminSchemas.adjustBalance.parse(data)).toThrow();
      });
    });
  });

  describe('validateRequest helper', () => {
    it('should throw formatted error for validation failures', () => {
      const schema = authSchemas.login;
      const data = {
        email: 'notanemail',
        password: '',
      };
      
      expect(() => validateRequest(schema, data)).toThrow('Validation failed');
    });

    it('should return parsed data on success', () => {
      const schema = authSchemas.login;
      const data = {
        email: 'TEST@EXAMPLE.COM',
        password: 'password123',
      };
      
      const result = validateRequest(schema, data);
      expect(result.email).toBe('test@example.com'); // Lowercased
    });
  });
});