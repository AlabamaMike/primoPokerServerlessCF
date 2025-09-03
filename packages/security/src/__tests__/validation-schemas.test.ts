import {
  PasswordSchema,
  UsernameSchema,
  EmailSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  AmountSchema,
  sanitizeInput,
  validateRequest
} from '../validation/schemas';

describe('Security Validation Schemas', () => {
  describe('PasswordSchema', () => {
    it('should validate strong passwords', () => {
      const validPasswords = [
        'SecurePass123!',
        'MyP@ssw0rd',
        'Complex!ty123',
        'Str0ng#Pass'
      ];

      validPasswords.forEach(password => {
        expect(() => PasswordSchema.parse(password)).not.toThrow();
      });
    });

    it('should reject weak passwords', () => {
      const weakPasswords = [
        'short',           // Too short
        'password123',     // Contains common word
        'UPPERCASE123!',   // No lowercase
        'lowercase123!',   // No uppercase
        'NoNumbers!',      // No numbers
        'NoSpecial123',    // No special characters
        '12345678',        // Common weak password
        'qwerty123!'       // Common weak password
      ];

      weakPasswords.forEach(password => {
        expect(() => PasswordSchema.parse(password)).toThrow();
      });
    });
  });

  describe('UsernameSchema', () => {
    it('should validate valid usernames', () => {
      const validUsernames = [
        'user123',
        'john_doe',
        'alice-smith',
        'Player_1',
        'test-user'
      ];

      validUsernames.forEach(username => {
        expect(() => UsernameSchema.parse(username)).not.toThrow();
      });
    });

    it('should reject invalid usernames', () => {
      const invalidUsernames = [
        'ab',              // Too short
        'a'.repeat(21),    // Too long
        'user@name',       // Invalid character
        'user name',       // Space
        'admin',           // Reserved
        'root',            // Reserved
        'SYSTEM'           // Reserved (case insensitive)
      ];

      invalidUsernames.forEach(username => {
        expect(() => UsernameSchema.parse(username)).toThrow();
      });
    });
  });

  describe('EmailSchema', () => {
    it('should validate valid emails', () => {
      const validEmails = [
        'user@example.com',
        'john.doe@company.org',
        'alice+test@gmail.com'
      ];

      validEmails.forEach(email => {
        expect(() => EmailSchema.parse(email)).not.toThrow();
      });
    });

    it('should reject disposable emails', () => {
      const disposableEmails = [
        'user@tempmail.com',
        'test@throwaway.email',
        'fake@10minutemail.com'
      ];

      disposableEmails.forEach(email => {
        expect(() => EmailSchema.parse(email)).toThrow();
      });
    });
  });

  describe('sanitizeInput', () => {
    it('should remove HTML tags and dangerous content', () => {
      expect(sanitizeInput('<script>alert("XSS")</script>')).toBe('scriptalert("XSS")/script');
      expect(sanitizeInput('Hello <b>World</b>')).toBe('Hello bWorld/b');
      expect(sanitizeInput('javascript:void(0)')).toBe('void(0)');
      expect(sanitizeInput('onclick="alert()"')).toBe('"alert()"');
      expect(sanitizeInput('  trim me  ')).toBe('trim me');
    });
  });

  describe('AmountSchema', () => {
    it('should validate valid amounts', () => {
      const validAmounts = [0.01, 1, 10.50, 100, 9999.99];
      
      validAmounts.forEach(amount => {
        expect(() => AmountSchema.parse(amount)).not.toThrow();
      });
    });

    it('should reject invalid amounts', () => {
      const invalidAmounts = [
        0,         // Not positive
        -10,       // Negative
        0.001,     // Too many decimals
        10.555,    // Too many decimals
        10001      // Exceeds max
      ];

      invalidAmounts.forEach(amount => {
        expect(() => AmountSchema.parse(amount)).toThrow();
      });
    });
  });

  describe('validateRequest', () => {
    it('should return success for valid data', () => {
      const result = validateRequest(LoginRequestSchema, {
        email: 'user@example.com',
        password: 'password123'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('user@example.com');
        expect(result.data.password).toBe('password123');
      }
    });

    it('should return detailed errors for invalid data', () => {
      const result = validateRequest(RegisterRequestSchema, {
        email: 'invalid-email',
        password: 'weak',
        username: 'a'
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors).toContain('email: Invalid email address');
        expect(result.errors).toContain('password: Password must be at least 8 characters');
        expect(result.errors).toContain('username: Username must be at least 3 characters');
      }
    });
  });
});