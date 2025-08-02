/**
 * Secure Shuffle Implementation
 *
 * Implements cryptographically secure Fisher-Yates shuffle with bias elimination.
 * Uses crypto.getRandomValues() exclusively and ensures uniform distribution.
 */
export interface ShuffleResult<T> {
    shuffledArray: T[];
    shuffleProof: ShuffleProof;
}
export interface ShuffleProof {
    originalHash: string;
    shuffledHash: string;
    entropyUsed: number;
    timestamp: number;
    algorithm: string;
    swapSequence?: SwapOperation[];
}
export interface SwapOperation {
    step: number;
    indexA: number;
    indexB: number;
    entropyBytes: Uint8Array;
}
export declare class SecureShuffle {
    private static readonly ALGORITHM_VERSION;
    private static readonly MAX_ARRAY_SIZE;
    /**
     * Performs cryptographically secure Fisher-Yates shuffle
     * Eliminates modulo bias through rejection sampling
     */
    static shuffle<T>(array: T[], recordSwaps?: boolean): Promise<ShuffleResult<T>>;
    /**
     * Generates an unbiased index in range [0, max)
     * Uses rejection sampling to eliminate modulo bias
     */
    private static generateUnbiasedIndex;
    /**
     * Verifies a shuffle proof
     */
    static verifyShuffleProof<T>(originalArray: T[], shuffledArray: T[], proof: ShuffleProof): Promise<{
        isValid: boolean;
        errors: string[];
    }>;
    /**
     * Verifies a swap sequence reproduces the shuffle
     */
    private static verifySwapSequence;
    /**
     * Verifies that given entropy bytes produce the expected index
     */
    private static verifyRandomIndex;
    /**
     * Analyzes shuffle quality for potential bias
     */
    static analyzeShuffleQuality<T>(shuffleResults: ShuffleResult<T>[], originalArray: T[]): {
        totalShuffles: number;
        averageEntropyUsed: number;
        positionDistribution: Map<number, Map<string, number>>;
        qualityScore: number;
        warnings: string[];
    };
}
//# sourceMappingURL=secure-shuffle.d.ts.map