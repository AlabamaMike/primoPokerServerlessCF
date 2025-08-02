/**
 * Deck Commitment Scheme
 *
 * Implements a cryptographically secure commitment scheme for poker deck verification.
 * Allows players to verify that the deck was not tampered with after the commitment was made.
 */
import { Suit, Rank } from '@primo-poker/shared';
import { CryptoHelpers } from './crypto-helpers';
import { SecureShuffle } from './secure-shuffle';
export class DeckCommitmentScheme {
    static COMMITMENT_VERSION = 'deck-commitment-v1';
    static MAX_COMMITMENT_AGE = 3600000; // 1 hour
    static STANDARD_DECK_SIZE = 52;
    /**
     * Creates a commitment for a deck before shuffling
     */
    static async createCommitment(deck, tableId, gameId) {
        if (deck.length === 0) {
            throw new Error('Cannot commit to empty deck');
        }
        // Generate nonce for commitment security
        const nonce = CryptoHelpers.generateSecureBytes(32);
        const timestamp = Date.now();
        // Create commitment hash
        const commitmentData = this.serializeDeckForCommitment(deck, tableId, gameId, nonce, timestamp);
        const commitmentHash = await CryptoHelpers.sha256Hex(commitmentData);
        return {
            commitmentHash,
            timestamp,
            deckSize: deck.length,
            tableId,
            gameId,
            nonce,
            version: this.COMMITMENT_VERSION
        };
    }
    /**
     * Shuffles a deck and creates a verifiable reveal
     */
    static async shuffleAndReveal(originalDeck, commitment) {
        // Verify commitment is still valid
        const verification = await this.verifyCommitment(originalDeck, commitment);
        if (!verification.isValid) {
            throw new Error(`Invalid commitment: ${verification.errors.join(', ')}`);
        }
        // Perform secure shuffle
        const shuffleResult = await SecureShuffle.shuffle(originalDeck, true);
        // Create reveal proof
        const revealProof = await this.createRevealProof(commitment, originalDeck, shuffleResult);
        return {
            commitment,
            originalDeck,
            shuffleResult,
            revealProof
        };
    }
    /**
     * Verifies a deck commitment
     */
    static async verifyCommitment(deck, commitment) {
        const errors = [];
        // Version check
        if (commitment.version !== this.COMMITMENT_VERSION) {
            errors.push(`Unsupported commitment version: ${commitment.version}`);
        }
        // Timing check
        const now = Date.now();
        const age = now - commitment.timestamp;
        const timingValid = age >= 0 && age <= this.MAX_COMMITMENT_AGE;
        if (!timingValid) {
            if (age < 0) {
                errors.push('Commitment timestamp is in the future');
            }
            else {
                errors.push('Commitment has expired');
            }
        }
        // Deck size check
        if (deck.length !== commitment.deckSize) {
            errors.push(`Deck size mismatch: expected ${commitment.deckSize}, got ${deck.length}`);
        }
        // Deck completeness check
        const deckComplete = this.validateDeckCompleteness(deck);
        if (!deckComplete) {
            errors.push('Deck is not complete (missing or duplicate cards)');
        }
        // Reconstruct and verify commitment hash
        let reconstructedHash = '';
        try {
            const commitmentData = this.serializeDeckForCommitment(deck, commitment.tableId, commitment.gameId, commitment.nonce, commitment.timestamp);
            reconstructedHash = await CryptoHelpers.sha256Hex(commitmentData);
        }
        catch (error) {
            errors.push(`Failed to reconstruct commitment: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        const hashMatch = reconstructedHash === commitment.commitmentHash;
        if (!hashMatch && reconstructedHash) {
            errors.push('Commitment hash does not match reconstructed hash');
        }
        return {
            isValid: errors.length === 0,
            errors,
            commitmentHash: commitment.commitmentHash,
            reconstructedHash,
            timingValid,
            deckComplete
        };
    }
    /**
     * Verifies a complete deck reveal
     */
    static async verifyReveal(reveal) {
        const errors = [];
        // Verify commitment
        const commitmentVerification = await this.verifyCommitment(reveal.originalDeck, reveal.commitment);
        const commitmentValid = commitmentVerification.isValid;
        if (!commitmentValid) {
            errors.push(...commitmentVerification.errors.map(e => `Commitment: ${e}`));
        }
        // Verify shuffle
        const shuffleVerification = await SecureShuffle.verifyShuffleProof(reveal.originalDeck, reveal.shuffleResult.shuffledArray, reveal.shuffleResult.shuffleProof);
        const shuffleValid = shuffleVerification.isValid;
        if (!shuffleValid) {
            errors.push(...shuffleVerification.errors.map(e => `Shuffle: ${e}`));
        }
        // Verify reveal proof
        const proofVerification = await this.verifyRevealProof(reveal);
        const proofValid = proofVerification.isValid;
        if (!proofValid) {
            errors.push(...proofVerification.errors.map(e => `Proof: ${e}`));
        }
        return {
            isValid: commitmentValid && shuffleValid && proofValid,
            commitmentValid,
            shuffleValid,
            proofValid,
            errors
        };
    }
    /**
     * Creates a proof for deck reveal
     */
    static async createRevealProof(commitment, originalDeck, shuffleResult) {
        const timestamp = Date.now();
        // Verify commitment
        const commitmentVerification = await this.verifyCommitment(originalDeck, commitment);
        const commitmentVerified = commitmentVerification.isValid;
        // Verify shuffle
        const shuffleVerification = await SecureShuffle.verifyShuffleProof(originalDeck, shuffleResult.shuffledArray, shuffleResult.shuffleProof);
        const shuffleVerified = shuffleVerification.isValid;
        // Check deck integrity
        const deckIntegrity = this.validateDeckCompleteness(originalDeck) &&
            this.validateDeckCompleteness(shuffleResult.shuffledArray);
        // Create verification hash
        const verificationData = {
            commitmentHash: commitment.commitmentHash,
            originalDeckHash: shuffleResult.shuffleProof.originalHash,
            shuffledDeckHash: shuffleResult.shuffleProof.shuffledHash,
            timestamp,
            commitmentVerified,
            shuffleVerified,
            deckIntegrity
        };
        const verificationHash = await CryptoHelpers.sha256Hex(JSON.stringify(verificationData));
        return {
            commitmentVerified,
            shuffleVerified,
            deckIntegrity,
            timestamp,
            verificationHash
        };
    }
    /**
     * Verifies a reveal proof
     */
    static async verifyRevealProof(reveal) {
        const errors = [];
        try {
            // Reconstruct verification data
            const verificationData = {
                commitmentHash: reveal.commitment.commitmentHash,
                originalDeckHash: reveal.shuffleResult.shuffleProof.originalHash,
                shuffledDeckHash: reveal.shuffleResult.shuffleProof.shuffledHash,
                timestamp: reveal.revealProof.timestamp,
                commitmentVerified: reveal.revealProof.commitmentVerified,
                shuffleVerified: reveal.revealProof.shuffleVerified,
                deckIntegrity: reveal.revealProof.deckIntegrity
            };
            const expectedHash = await CryptoHelpers.sha256Hex(JSON.stringify(verificationData));
            if (expectedHash !== reveal.revealProof.verificationHash) {
                errors.push('Verification hash mismatch');
            }
            // Check proof claims match actual verification
            const commitmentCheck = await this.verifyCommitment(reveal.originalDeck, reveal.commitment);
            if (commitmentCheck.isValid !== reveal.revealProof.commitmentVerified) {
                errors.push('Commitment verification claim mismatch');
            }
            const shuffleCheck = await SecureShuffle.verifyShuffleProof(reveal.originalDeck, reveal.shuffleResult.shuffledArray, reveal.shuffleResult.shuffleProof);
            if (shuffleCheck.isValid !== reveal.revealProof.shuffleVerified) {
                errors.push('Shuffle verification claim mismatch');
            }
            const deckIntegrityCheck = this.validateDeckCompleteness(reveal.originalDeck) &&
                this.validateDeckCompleteness(reveal.shuffleResult.shuffledArray);
            if (deckIntegrityCheck !== reveal.revealProof.deckIntegrity) {
                errors.push('Deck integrity claim mismatch');
            }
        }
        catch (error) {
            errors.push(`Proof verification error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    /**
     * Serializes deck data for commitment hash
     */
    static serializeDeckForCommitment(deck, tableId, gameId, nonce, timestamp) {
        const deckData = deck.map(card => `${card.rank}:${card.suit}`).join('|');
        const nonceHex = Array.from(nonce, byte => byte.toString(16).padStart(2, '0')).join('');
        return `${this.COMMITMENT_VERSION}:${tableId}:${gameId}:${timestamp}:${deckData}:${nonceHex}`;
    }
    /**
     * Validates that a deck contains exactly the expected cards
     */
    static validateDeckCompleteness(deck) {
        if (deck.length !== this.STANDARD_DECK_SIZE) {
            return false;
        }
        const expectedCards = new Set();
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        // Generate expected card set
        for (const suit of suits) {
            for (const rank of ranks) {
                expectedCards.add(`${rank}:${suit}`);
            }
        }
        // Check actual cards
        const actualCards = new Set();
        for (const card of deck) {
            const cardKey = `${card.rank}:${card.suit}`;
            if (actualCards.has(cardKey)) {
                return false; // Duplicate card
            }
            actualCards.add(cardKey);
        }
        // Verify all expected cards are present
        return expectedCards.size === actualCards.size &&
            [...expectedCards].every(card => actualCards.has(card));
    }
    /**
     * Creates a standard 52-card deck
     */
    static createStandardDeck() {
        const deck = [];
        const suits = [Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS, Suit.SPADES];
        const ranks = [
            Rank.TWO, Rank.THREE, Rank.FOUR, Rank.FIVE,
            Rank.SIX, Rank.SEVEN, Rank.EIGHT, Rank.NINE,
            Rank.TEN, Rank.JACK, Rank.QUEEN, Rank.KING, Rank.ACE
        ];
        for (const suit of suits) {
            for (const rank of ranks) {
                deck.push({ suit, rank });
            }
        }
        return deck;
    }
    /**
     * Verifies deck order has not been tampered with
     */
    static async verifyDeckOrder(deck, expectedHash) {
        try {
            const deckSerialized = JSON.stringify(deck);
            const actualHash = await CryptoHelpers.sha256Hex(deckSerialized);
            return CryptoHelpers.constantTimeCompare(new TextEncoder().encode(actualHash), new TextEncoder().encode(expectedHash));
        }
        catch {
            return false;
        }
    }
    /**
     * Creates a commitment batch for multiple games
     */
    static async createCommitmentBatch(decks, tableId, gameIds) {
        if (decks.length !== gameIds.length) {
            throw new Error('Number of decks must match number of game IDs');
        }
        const commitments = [];
        for (let i = 0; i < decks.length; i++) {
            const deck = decks[i];
            const gameId = gameIds[i];
            if (deck && gameId) {
                const commitment = await this.createCommitment(deck, tableId, gameId);
                commitments.push(commitment);
            }
        }
        return commitments;
    }
    /**
     * Exports commitment for external verification
     */
    static exportCommitment(commitment) {
        const exportData = {
            version: commitment.version,
            commitmentHash: commitment.commitmentHash,
            timestamp: commitment.timestamp,
            deckSize: commitment.deckSize,
            tableId: commitment.tableId,
            gameId: commitment.gameId,
            nonceHex: Array.from(commitment.nonce, byte => byte.toString(16).padStart(2, '0')).join('')
        };
        return JSON.stringify(exportData, null, 2);
    }
    /**
     * Imports commitment from external source
     */
    static importCommitment(exportedData) {
        try {
            const data = JSON.parse(exportedData);
            if (!data.version || !data.commitmentHash || !data.timestamp) {
                throw new Error('Invalid commitment data format');
            }
            const nonce = new Uint8Array(data.nonceHex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) || []);
            return {
                version: data.version,
                commitmentHash: data.commitmentHash,
                timestamp: data.timestamp,
                deckSize: data.deckSize,
                tableId: data.tableId,
                gameId: data.gameId,
                nonce
            };
        }
        catch (error) {
            throw new Error(`Failed to import commitment: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
//# sourceMappingURL=deck-commitment.js.map