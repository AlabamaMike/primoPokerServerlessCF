import { JWTPayload } from 'jose';
export interface JWTTokens {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
}
export interface TokenPayload extends JWTPayload {
    userId: string;
    username: string;
    email: string;
    roles: string[];
    sessionId: string;
}
export interface RefreshTokenPayload extends JWTPayload {
    userId: string;
    sessionId: string;
    tokenType: 'refresh';
}
export declare class AuthenticationManager {
    private readonly secretKey;
    private readonly accessTokenTTL;
    private readonly refreshTokenTTL;
    private readonly activeSessions;
    constructor(secretKey: string);
    authenticate(credentials: {
        username: string;
        password: string;
    }, db?: any): Promise<{
        success: boolean;
        tokens?: JWTTokens;
        user?: any;
        error?: string;
    }>;
    verifyAccessToken(token: string): Promise<{
        valid: boolean;
        payload?: TokenPayload;
        error?: string;
    }>;
    refreshTokens(refreshToken: string): Promise<{
        success: boolean;
        tokens?: JWTTokens;
        error?: string;
    }>;
    revokeSession(userId: string, sessionId: string): Promise<void>;
    revokeAllSessions(userId: string): Promise<void>;
    createTokensForUser(user: {
        userId: string;
        username: string;
        email: string;
        roles?: string[];
    }): Promise<JWTTokens>;
    private generateTokens;
    private validateCredentials;
}
export declare class RateLimiter {
    private attempts;
    private readonly maxAttempts;
    private readonly windowMs;
    constructor(maxAttempts?: number, windowMs?: number);
    isAllowed(identifier: string): boolean;
    reset(identifier: string): void;
    getRemainingAttempts(identifier: string): number;
    getResetTime(identifier: string): Date | null;
    cleanup(): void;
}
export declare class PasswordManager {
    static hashPassword(password: string, salt?: string): Promise<{
        hash: string;
        salt: string;
    }>;
    static verifyPassword(password: string, hash: string, salt: string): Promise<boolean>;
    private static generateSalt;
}
export declare class MFAManager {
    private backupCodes;
    generateBackupCodes(userId: string, count?: number): string[];
    verifyBackupCode(userId: string, code: string): boolean;
    private generateBackupCode;
}
//# sourceMappingURL=authentication.d.ts.map