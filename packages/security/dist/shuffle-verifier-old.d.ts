import { Card } from '@primo-poker/shared';
export interface IShuffleVerifier {
    generateDeck(): Promi;
    private generateShuffleProof;
}
export interface VerifiableDeck {
    cards: Card[];
    commitment: string;
    nonce: string;
    timestamp: Date;
}
export interface ShuffledDeck extends VerifiableDeck {
    shuffledCards: Card[];
    shuffleSeed: string;
    shuffleProof: string;
}
export declare class ShuffleVerifier implements IShuffleVerifier {
    generateDeck(): Promise<VerifiableDeck>;
    shuffleDeck(deck: VerifiableDeck, seed: string): Promise<ShuffledDeck>;
    verifyFairness(shuffledDeck: ShuffledDeck): Promise<boolean>;
    private generateCommitment;
    private verifyCommitment;
    private fisherYatesShuffle;
    private createSeededRNG;
    private hashSeed;
    private generateShuffleProof;
    private verifyShuffleProof;
    private verifyCardIntegrity;
    private cardsEqual;
    private sha256;
}
export declare class MentalPoker {
    static generateSharedSecret(playerSecrets: string[]): Promise<string>;
    static commitToSecret(secret: string, nonce: string): Promise<string>;
    static verifyCommitment(secret: string, nonce: string, commitment: string): Promise<boolean>;
}
export declare class SecureRNG {
    private static instance;
    private entropy;
    private constructor();
    static getInstance(): SecureRNG;
    private reseedEntropy;
    generateSecureBytes(length: number): Uint8Array;
    generateSecureInteger(min: number, max: number): number;
    generateSeed(): string;
    reseed(): void;
}
//# sourceMappingURL=shuffle-verifier-old.d.ts.map