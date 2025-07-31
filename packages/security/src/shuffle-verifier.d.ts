import { Card } from '@primo-poker/shared';
export interface IShuffleVerifier {
    generateDeck(): Promise<VerifiableDeck>;
    shuffleDeck(deck: VerifiableDeck, seed: string): Promise<ShuffledDeck>;
    verifyFairness(shuffledDeck: ShuffledDeck): Promise<boolean>;
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
export interface CommitmentProof {
    commitment: string;
    nonce: string;
    cards: Card[];
}
export interface ShuffleFairness {
    isValid: boolean;
    commitmentVerified: boolean;
    shuffleVerified: boolean;
    originalCardsCount: number;
    shuffledCardsCount: number;
}
export declare class ShuffleVerifier implements IShuffleVerifier {
    generateDeck(): Promise<VerifiableDeck>;
    shuffleDeck(deck: VerifiableDeck, seed: string): Promise<ShuffledDeck>;
    verifyFairness(shuffledDeck: ShuffledDeck): Promise<boolean>;
    private generateCommitment;
    private verifyCommitment;
    private fisherYatesShuffle;
    private createSeededRandom;
    private generateShuffleProof;
    private verifyShuffleProof;
    private sha256;
}
export declare class MentalPoker {
    static generateSharedSecret(playerSecrets: string[]): Promise<string>;
    static verifyPlayerCommitments(commitments: {
        playerId: string;
        commitment: string;
        secret: string;
    }[]): Promise<boolean>;
}
export declare class SecureRNG {
    static generateBytes(length: number): Uint8Array;
    static generateInt(min: number, max: number): number;
    static generateSeed(): string;
    static shuffleArray<T>(array: T[]): T[];
}
//# sourceMappingURL=shuffle-verifier.d.ts.map