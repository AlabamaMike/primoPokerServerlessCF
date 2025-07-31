import { RandomUtils, Suit, Rank } from '@primo-poker/shared';
{
    const originalString = originalCards.map(card => `${card.rank}${card.suit}`).join('');
    const shuffledString = shuffledCards.map(card => `${card.rank}${card.suit}`).join('');
    const proofData = `${originalString}:${shuffledString}:${seed}`;
    return await this.sha256(proofData);
}
bleDeck > ;
shuffleDeck(deck, VerifiableDeck, seed, string);
Promise;
verifyFairness(shuffledDeck, ShuffledDeck);
Promise;
export class ShuffleVerifier {
    async generateDeck() {
        const cards = [];
        // Create standard 52-card deck
        const suits = [Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS, Suit.SPADES];
        const ranks = [Rank.TWO, Rank.THREE, Rank.FOUR, Rank.FIVE, Rank.SIX, Rank.SEVEN, Rank.EIGHT, Rank.NINE, Rank.TEN, Rank.JACK, Rank.QUEEN, Rank.KING, Rank.ACE];
        for (const suit of suits) {
            for (const rank of ranks) {
                cards.push({ suit, rank });
            }
        }
        const nonce = RandomUtils.generateUUID();
        const commitment = await this.generateCommitment(cards, nonce);
        return {
            cards,
            commitment,
            nonce,
            timestamp: new Date(),
        };
    }
    async shuffleDeck(deck, seed) {
        // Verify the original deck commitment
        if (!(await this.verifyCommitment(deck.cards, deck.nonce, deck.commitment))) {
            throw new Error('Invalid deck commitment');
        }
        const shuffledCards = this.fisherYatesShuffle([...deck.cards], seed);
        const shuffleNonce = RandomUtils.generateUUID();
        const proof = await this.generateShuffleProof(deck.cards, shuffledCards, seed, shuffleNonce);
        return {
            ...deck,
            shuffledCards,
            shuffleSeed: seed,
            shuffleProof: proof,
        };
    }
    async verifyFairness(shuffledDeck) {
        // Verify original deck commitment
        if (!this.verifyCommitment(shuffledDeck.cards, shuffledDeck.nonce, shuffledDeck.commitment)) {
            return false;
        }
        // Verify shuffle proof
        if (!this.verifyShuffleProof(shuffledDeck.cards, shuffledDeck.shuffledCards, shuffledDeck.shuffleSeed, shuffledDeck.shuffleProof)) {
            return false;
        }
        // Verify all cards are present and no duplicates
        if (!this.verifyCardIntegrity(shuffledDeck.cards, shuffledDeck.shuffledCards)) {
            return false;
        }
        return true;
    }
    async generateCommitment(cards, nonce) {
        const cardString = cards.map(card => `${card.rank}${card.suit}`).join('');
        const data = `${cardString}:${nonce}`;
        return await this.sha256(data);
    }
    async verifyCommitment(cards, nonce, commitment) {
        const expectedCommitment = await this.generateCommitment(cards, nonce);
        return expectedCommitment === commitment;
    }
    fisherYatesShuffle(cards, seed) {
        // Use seed to create deterministic pseudo-random sequence
        const rng = this.createSeededRNG(seed);
        for (let i = cards.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [cards[i], cards[j]] = [cards[j], cards[i]];
        }
        return cards;
    }
    createSeededRNG(seed) {
        let hash = this.hashSeed(seed);
        return () => {
            hash = (hash * 16807) % 2147483647;
            return (hash - 1) / 2147483646;
        };
    }
    hashSeed(seed) {
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            const char = seed.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }
    generateShuffleProof(originalCards, shuffledCards, seed) {
        const originalString = originalCards.map(card => `${card.rank}${card.suit}`).join('');
        const shuffledString = shuffledCards.map(card => `${card.rank}${card.suit}`).join('');
        const proofData = `${originalString}:${shuffledString}:${seed}`;
        return this.sha256(proofData);
    }
    verifyShuffleProof(originalCards, shuffledCards, seed, proof) {
        const expectedProof = this.generateShuffleProof(originalCards, shuffledCards, seed);
        // Also verify that the shuffle is reproducible
        const reproducedShuffle = this.fisherYatesShuffle([...originalCards], seed);
        const shuffleMatches = this.cardsEqual(shuffledCards, reproducedShuffle);
        return expectedProof === proof && shuffleMatches;
    }
    verifyCardIntegrity(originalCards, shuffledCards) {
        if (originalCards.length !== shuffledCards.length) {
            return false;
        }
        const originalSet = new Set(originalCards.map(card => `${card.rank}${card.suit}`));
        const shuffledSet = new Set(shuffledCards.map(card => `${card.rank}${card.suit}`));
        if (originalSet.size !== shuffledSet.size) {
            return false;
        }
        for (const cardStr of originalSet) {
            if (!shuffledSet.has(cardStr)) {
                return false;
            }
        }
        return true;
    }
    cardsEqual(cards1, cards2) {
        if (cards1.length !== cards2.length) {
            return false;
        }
        for (let i = 0; i < cards1.length; i++) {
            const card1 = cards1[i];
            const card2 = cards2[i];
            if (!card1 || !card2 || card1.rank !== card2.rank || card1.suit !== card2.suit) {
                return false;
            }
        }
        return true;
    }
    async sha256(data) {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
}
// Mental Poker implementation for additional verification
export class MentalPoker {
    static async generateSharedSecret(playerSecrets) {
        // Combine all player secrets to create a shared secret
        const combined = playerSecrets.join(':');
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(combined);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    static async commitToSecret(secret, nonce) {
        const data = `${secret}:${nonce}`;
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    static async verifyCommitment(secret, nonce, commitment) {
        const expectedCommitment = await this.commitToSecret(secret, nonce);
        return expectedCommitment === commitment;
    }
}
// Cryptographically secure random number generator
export class SecureRNG {
    static instance;
    entropy = new Uint8Array(32);
    constructor() {
        this.reseedEntropy();
    }
    static getInstance() {
        if (!SecureRNG.instance) {
            SecureRNG.instance = new SecureRNG();
        }
        return SecureRNG.instance;
    }
    reseedEntropy() {
        crypto.getRandomValues(this.entropy);
    }
    generateSecureBytes(length) {
        const result = new Uint8Array(length);
        crypto.getRandomValues(result);
        return result;
    }
    generateSecureInteger(min, max) {
        const range = max - min + 1;
        const bytesNeeded = Math.ceil(Math.log2(range) / 8);
        const maxValidValue = Math.floor(256 ** bytesNeeded / range) * range - 1;
        let randomValue;
        do {
            const randomBytes = this.generateSecureBytes(bytesNeeded);
            randomValue = 0;
            for (let i = 0; i < bytesNeeded; i++) {
                randomValue = (randomValue << 8) + (randomBytes[i] || 0);
            }
        } while (randomValue > maxValidValue);
        return min + (randomValue % range);
    }
    generateSeed() {
        const seedBytes = this.generateSecureBytes(32);
        return Array.from(seedBytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }
    // Reseed entropy periodically for additional security
    reseed() {
        this.reseedEntropy();
    }
}
//# sourceMappingURL=shuffle-verifier-old.js.map