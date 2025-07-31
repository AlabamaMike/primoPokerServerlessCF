import { RandomUtils, Suit, Rank } from '@primo-poker/shared';
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
        const proof = await this.generateShuffleProof(deck.cards, shuffledCards, seed);
        return {
            ...deck,
            shuffledCards,
            shuffleSeed: seed,
            shuffleProof: proof,
        };
    }
    async verifyFairness(shuffledDeck) {
        try {
            // Verify original deck commitment
            const commitmentValid = await this.verifyCommitment(shuffledDeck.cards, shuffledDeck.nonce, shuffledDeck.commitment);
            if (!commitmentValid) {
                return false;
            }
            // Verify shuffle proof
            const shuffleValid = await this.verifyShuffleProof(shuffledDeck.cards, shuffledDeck.shuffledCards, shuffledDeck.shuffleSeed, shuffledDeck.shuffleProof);
            if (!shuffleValid) {
                return false;
            }
            // Verify cards are the same (no cards added/removed)
            const originalSorted = [...shuffledDeck.cards].sort((a, b) => a.suit.localeCompare(b.suit) || a.rank.localeCompare(b.rank));
            const shuffledSorted = [...shuffledDeck.shuffledCards].sort((a, b) => a.suit.localeCompare(b.suit) || a.rank.localeCompare(b.rank));
            if (originalSorted.length !== shuffledSorted.length) {
                return false;
            }
            for (let i = 0; i < originalSorted.length; i++) {
                const card1 = originalSorted[i];
                const card2 = shuffledSorted[i];
                if (!card1 || !card2 || card1.rank !== card2.rank || card1.suit !== card2.suit) {
                    return false;
                }
            }
            return true;
        }
        catch {
            return false;
        }
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
        const seededRandom = this.createSeededRandom(seed);
        const shuffled = [...cards];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(seededRandom() * (i + 1));
            const temp = shuffled[i];
            const tempJ = shuffled[j];
            if (temp && tempJ) {
                shuffled[i] = tempJ;
                shuffled[j] = temp;
            }
        }
        return shuffled;
    }
    createSeededRandom(seed) {
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            const char = seed.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return function () {
            hash = Math.sin(hash) * 10000;
            return hash - Math.floor(hash);
        };
    }
    async generateShuffleProof(originalCards, shuffledCards, seed) {
        const originalString = originalCards.map(card => `${card.rank}${card.suit}`).join('');
        const shuffledString = shuffledCards.map(card => `${card.rank}${card.suit}`).join('');
        const proofData = `${originalString}:${shuffledString}:${seed}`;
        return await this.sha256(proofData);
    }
    async verifyShuffleProof(originalCards, shuffledCards, seed, proof) {
        const expectedProof = await this.generateShuffleProof(originalCards, shuffledCards, seed);
        // Also verify that the shuffle is reproducible
        const reproducedShuffle = this.fisherYatesShuffle([...originalCards], seed);
        // Check if the reproduced shuffle matches the provided shuffled cards
        if (reproducedShuffle.length !== shuffledCards.length) {
            return false;
        }
        for (let i = 0; i < reproducedShuffle.length; i++) {
            const card1 = reproducedShuffle[i];
            const card2 = shuffledCards[i];
            if (!card1 || !card2 || card1.rank !== card2.rank || card1.suit !== card2.suit) {
                return false;
            }
        }
        return expectedProof === proof;
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
    static async verifyPlayerCommitments(commitments) {
        for (const { commitment, secret } of commitments) {
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(secret);
            const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const expectedCommitment = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            if (expectedCommitment !== commitment) {
                return false;
            }
        }
        return true;
    }
}
// Secure Random Number Generator using Web Crypto API
export class SecureRNG {
    static generateBytes(length) {
        return crypto.getRandomValues(new Uint8Array(length));
    }
    static generateInt(min, max) {
        const range = max - min + 1;
        const randomBytes = crypto.getRandomValues(new Uint32Array(1));
        const randomValue = randomBytes[0];
        if (randomValue === undefined) {
            throw new Error('Failed to generate random number');
        }
        return min + (randomValue % range);
    }
    static generateSeed() {
        const randomBytes = crypto.getRandomValues(new Uint8Array(32));
        return Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }
    static shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = this.generateInt(0, i);
            const temp = shuffled[i];
            const tempJ = shuffled[j];
            if (temp !== undefined && tempJ !== undefined) {
                shuffled[i] = tempJ;
                shuffled[j] = temp;
            }
        }
        return shuffled;
    }
}
//# sourceMappingURL=shuffle-verifier.js.map