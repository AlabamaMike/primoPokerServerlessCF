/**
 * Deck Commitment Scheme
 *
 * Implements a cryptographically secure commitment scheme for poker deck verification.
 * Allows players to verify that the deck was not tampered with after the commitment was made.
 */
import { Card } from '@primo-poker/shared';
import { ShuffleResult } from './secure-shuffle';
export interface DeckCommitment {
    commitmentHash: string;
    timestamp: number;
    deckSize: number;
    tableId: string;
    gameId: string;
    nonce: Uint8Array;
    version: string;
}
export interface DeckReveal {
    commitment: DeckCommitment;
    originalDeck: Card[];
    shuffleResult: ShuffleResult<Card>;
    revealProof: RevealProof;
}
export interface RevealProof {
    commitmentVerified: boolean;
    shuffleVerified: boolean;
    deckIntegrity: boolean;
    timestamp: number;
    verificationHash: string;
}
export interface CommitmentVerification {
    isValid: boolean;
    errors: string[];
    commitmentHash: string;
    reconstructedHash: string;
    timingValid: boolean;
    deckComplete: boolean;
}
export declare class DeckCommitmentScheme {
    private static readonly COMMITMENT_VERSION;
    private static readonly MAX_COMMITMENT_AGE;
    private static readonly STANDARD_DECK_SIZE;
    /**
     * Creates a commitment for a deck before shuffling
     */
    static createCommitment(deck: Card[], tableId: string, gameId: string): Promise<DeckCommitment>;
    /**
     * Shuffles a deck and creates a verifiable reveal
     */
    static shuffleAndReveal(originalDeck: Card[], commitment: DeckCommitment): Promise<DeckReveal>;
    /**
     * Verifies a deck commitment
     */
    static verifyCommitment(deck: Card[], commitment: DeckCommitment): Promise<CommitmentVerification>;
    /**
     * Verifies a complete deck reveal
     */
    static verifyReveal(reveal: DeckReveal): Promise<{
        isValid: boolean;
        commitmentValid: boolean;
        shuffleValid: boolean;
        proofValid: boolean;
        errors: string[];
    }>;
    /**
     * Creates a proof for deck reveal
     */
    private static createRevealProof;
    /**
     * Verifies a reveal proof
     */
    private static verifyRevealProof;
    /**
     * Serializes deck data for commitment hash
     */
    private static serializeDeckForCommitment;
    /**
     * Validates that a deck contains exactly the expected cards
     */
    private static validateDeckCompleteness;
    /**
     * Creates a standard 52-card deck
     */
    static createStandardDeck(): Card[];
    /**
     * Verifies deck order has not been tampered with
     */
    static verifyDeckOrder(deck: Card[], expectedHash: string): Promise<boolean>;
    /**
     * Creates a commitment batch for multiple games
     */
    static createCommitmentBatch(decks: Card[][], tableId: string, gameIds: string[]): Promise<DeckCommitment[]>;
    /**
     * Exports commitment for external verification
     */
    static exportCommitment(commitment: DeckCommitment): string;
    /**
     * Imports commitment from external source
     */
    static importCommitment(exportedData: string): DeckCommitment;
}
//# sourceMappingURL=deck-commitment.d.ts.map