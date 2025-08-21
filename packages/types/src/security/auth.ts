/**
 * Security and authentication types
 */

export interface JWTPayload {
  sub: string; // Subject (user ID)
  email: string;
  username: string;
  roles: string[];
  iat: number; // Issued at
  exp: number; // Expiration
  jti?: string; // JWT ID
  iss?: string; // Issuer
  aud?: string; // Audience
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  preventCommonPasswords: boolean;
  preventReuse: number; // Number of previous passwords to check
}

export interface TwoFactorAuth {
  enabled: boolean;
  method: 'totp' | 'sms' | 'email';
  secret?: string;
  backupCodes?: string[];
  verifiedAt?: Date;
}

export interface SecurityLog {
  id: string;
  userId: string;
  eventType: SecurityEventType;
  ipAddress: string;
  userAgent: string;
  details: Record<string, unknown>;
  timestamp: Date;
}

export enum SecurityEventType {
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILED = 'login_failed',
  LOGOUT = 'logout',
  PASSWORD_CHANGED = 'password_changed',
  PASSWORD_RESET_REQUESTED = 'password_reset_requested',
  PASSWORD_RESET_COMPLETED = 'password_reset_completed',
  TWO_FACTOR_ENABLED = 'two_factor_enabled',
  TWO_FACTOR_DISABLED = 'two_factor_disabled',
  ACCOUNT_LOCKED = 'account_locked',
  ACCOUNT_UNLOCKED = 'account_unlocked',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  keyGenerator?: (req: any) => string;
}

export interface IPWhitelist {
  addresses: string[];
  ranges: Array<{
    start: string;
    end: string;
  }>;
}

export interface SecurityHeaders {
  'X-Frame-Options': string;
  'X-Content-Type-Options': string;
  'X-XSS-Protection': string;
  'Strict-Transport-Security': string;
  'Content-Security-Policy': string;
}