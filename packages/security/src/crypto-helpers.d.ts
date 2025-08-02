/**
 * Cryptographic Helper Functions
 *
 * Provides secure wrappers around Web Crypto API for poker operations.
 * All functions use crypto.getRandomValues() and are designed to be
 * cryptographically secure and auditable.
 */
export interface EntropySource {
    source: string;
    timestamp: number;
    value: Uint8Array;
}
export interface RandomState {
    entropy: EntropySource[];
    seed: Uint8Array;
    counter: number;
    lastRefresh: number;
}
export declare class CryptoHelpers {
    private static readonly ENTROPY_POOL_SIZE;
    private static readonly REFRESH_INTERVAL;
    private static readonly MAX_COUNTER;
    /**
     * Generates cryptographically secure random bytes
     * Uses crypto.getRandomValues() exclusively
     */
    static generateSecureBytes(length: number): Uint8Array;
    /**
     * Generates a cryptographically secure integer in range [min, max]
     * Eliminates modulo bias using rejection sampling
     */
    static generateSecureInteger(min: number, max: number): number;
    /**
     * Creates SHA-256 hash of data
     */
    static sha256(data: string | Uint8Array): Promise<Uint8Array>;
    /**
     * Creates SHA-256 hash and returns as hex string
     */
    static sha256Hex(data: string | Uint8Array): Promise<string>;
    /**
     * Generates a cryptographically secure seed
     */
    static generateSeed(length?: number): Uint8Array;
    /**
     * Derives key material using HKDF
     */
    static deriveKey(inputKeyMaterial: Uint8Array, salt: Uint8Array, info: string, outputLength: number): Promise<Uint8Array>;
    /**
     * Mixes multiple entropy sources
     */
    static mixEntropy(sources: EntropySource[]): Uint8Array;
    /**
     * Creates a constant-time comparison function
     */
    static constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean;
    /**
     * Securely clears a Uint8Array
     */
    static secureClear(data: Uint8Array): void;
    /**
     * Validates entropy quality (basic checks)
     */
    static validateEntropy(entropy: Uint8Array): {
        isValid: boolean;
        issues: string[];
    };
    /**
     * Collects entropy from multiple sources
     */
    static collectEntropy(tableId: string, playerId?: string): Promise<EntropySource[]>;
    /**
     * Creates a random state for persistent RNG
     */
    static createRandomState(tableId: string): Promise<RandomState>;
    /**
     * Refreshes random state if needed
     */
    static refreshRandomState(state: RandomState, tableId: string, force?: boolean): Promise<RandomState>;
    /**
     * Generates secure random from state
     */
    static generateFromState(state: RandomState, length: number): Promise<{
        data: Uint8Array;
        newState: RandomState;
    }>;
}
//# sourceMappingURL=crypto-helpers.d.ts.map