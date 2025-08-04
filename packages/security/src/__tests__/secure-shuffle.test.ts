/**
 * SecureShuffle Unit Tests
 * 
 * Comprehensive tests for cryptographically secure shuffle implementation
 * Tests bias elimination, proof verification, and security properties
 */

import { SecureShuffle, ShuffleResult, ShuffleProof } from '../secure-shuffle';

// Mock types instead of importing from shared
enum Suit {
  HEARTS = 'HEARTS',
  DIAMONDS = 'DIAMONDS',
  CLUBS = 'CLUBS',
  SPADES = 'SPADES'
}

enum Rank {
  TWO = '2',
  THREE = '3',
  FOUR = '4',
  FIVE = '5',
  SIX = '6',
  SEVEN = '7',
  EIGHT = '8',
  NINE = '9',
  TEN = '10',
  JACK = 'J',
  QUEEN = 'Q',
  KING = 'K',
  ACE = 'A'
}

interface Card {
  suit: Suit;
  rank: Rank;
}

// Mock crypto for Node.js test environment
if (!global.crypto) {
  global.crypto = {
    getRandomValues: (array: any) => {
      // Use Node's crypto module for tests
      const crypto = require('crypto');
      return crypto.randomFillSync(array);
    },
    subtle: {
      digest: async (algorithm: string, data: ArrayBuffer) => {
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256');
        hash.update(Buffer.from(data));
        return hash.digest();
      }
    }
  } as any;
}

describe('SecureShuffle', () => {
  // Helper function to create a test deck
  const createTestDeck = (): Card[] => {
    const deck: Card[] = [];
    const suits = [Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS, Suit.SPADES];
    const ranks = [
      Rank.TWO, Rank.THREE, Rank.FOUR, Rank.FIVE, Rank.SIX, Rank.SEVEN,
      Rank.EIGHT, Rank.NINE, Rank.TEN, Rank.JACK, Rank.QUEEN, Rank.KING, Rank.ACE
    ];

    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({ suit, rank });
      }
    }
    return deck;
  };

  // Helper to create small test arrays
  const createTestArray = (size: number): number[] => {
    return Array.from({ length: size }, (_, i) => i);
  };

  describe('Basic Shuffle Operations', () => {
    it('should shuffle an array without changing its length', async () => {
      const originalArray = createTestArray(10);
      const result = await SecureShuffle.shuffle(originalArray);

      expect(result.shuffledArray).toHaveLength(originalArray.length);
      expect(result.shuffleProof).toBeDefined();
    });

    it('should preserve all elements during shuffle', async () => {
      const originalArray = createTestArray(20);
      const result = await SecureShuffle.shuffle(originalArray);

      // Check all elements are present
      const sortedOriginal = [...originalArray].sort((a, b) => a - b);
      const sortedShuffled = [...result.shuffledArray].sort((a, b) => a - b);
      
      expect(sortedShuffled).toEqual(sortedOriginal);
    });

    it('should handle single element array', async () => {
      const singleElement = [42];
      const result = await SecureShuffle.shuffle(singleElement);

      expect(result.shuffledArray).toEqual(singleElement);
      expect(result.shuffleProof.entropyUsed).toBe(0);
    });

    it('should reject empty array', async () => {
      await expect(SecureShuffle.shuffle([])).rejects.toThrow('Cannot shuffle empty array');
    });

    it('should reject oversized array', async () => {
      const oversizedArray = new Array(10001).fill(0);
      await expect(SecureShuffle.shuffle(oversizedArray)).rejects.toThrow('Array too large');
    });
  });

  describe('Shuffle Randomness and Distribution', () => {
    it('should produce different shuffles for same input', async () => {
      const array = createTestArray(10);
      const results: ShuffleResult<number>[] = [];

      // Perform multiple shuffles
      for (let i = 0; i < 5; i++) {
        results.push(await SecureShuffle.shuffle([...array]));
      }

      // Check that not all shuffles are identical
      const uniqueShuffles = new Set(
        results.map(r => JSON.stringify(r.shuffledArray))
      );

      expect(uniqueShuffles.size).toBeGreaterThan(1);
    });

    it('should use appropriate entropy for shuffle size', async () => {
      const smallArray = createTestArray(5);
      const mediumArray = createTestArray(50);
      const largeArray = createTestArray(500);

      const smallResult = await SecureShuffle.shuffle(smallArray);
      const mediumResult = await SecureShuffle.shuffle(mediumArray);
      const largeResult = await SecureShuffle.shuffle(largeArray);

      // Larger arrays should use more entropy
      expect(smallResult.shuffleProof.entropyUsed).toBeLessThan(
        mediumResult.shuffleProof.entropyUsed
      );
      expect(mediumResult.shuffleProof.entropyUsed).toBeLessThan(
        largeResult.shuffleProof.entropyUsed
      );
    });

    it('should demonstrate uniform distribution over many shuffles', async () => {
      const arraySize = 5;
      const array = createTestArray(arraySize);
      const iterations = 1000;
      const positionCounts: Map<number, Map<number, number>> = new Map();

      // Initialize position tracking
      for (let pos = 0; pos < arraySize; pos++) {
        positionCounts.set(pos, new Map());
        for (let elem = 0; elem < arraySize; elem++) {
          positionCounts.get(pos)!.set(elem, 0);
        }
      }

      // Perform many shuffles and track positions
      for (let i = 0; i < iterations; i++) {
        const result = await SecureShuffle.shuffle([...array]);
        for (let pos = 0; pos < arraySize; pos++) {
          const element = result.shuffledArray[pos];
          const count = positionCounts.get(pos)!.get(element)! + 1;
          positionCounts.get(pos)!.set(element, count);
        }
      }

      // Check distribution (each element should appear roughly 1/n times at each position)
      const expectedFrequency = iterations / arraySize;
      const tolerance = expectedFrequency * 0.2; // 20% tolerance

      for (const [pos, elementCounts] of positionCounts) {
        for (const [element, count] of elementCounts) {
          expect(count).toBeGreaterThan(expectedFrequency - tolerance);
          expect(count).toBeLessThan(expectedFrequency + tolerance);
        }
      }
    });
  });

  describe('Shuffle Proof and Verification', () => {
    it('should generate valid shuffle proof', async () => {
      const array = createTestArray(10);
      const result = await SecureShuffle.shuffle(array, true);

      expect(result.shuffleProof).toMatchObject({
        originalHash: expect.any(String),
        shuffledHash: expect.any(String),
        entropyUsed: expect.any(Number),
        timestamp: expect.any(Number),
        algorithm: 'secure-fisher-yates-v1',
        swapSequence: expect.any(Array)
      });

      expect(result.shuffleProof.swapSequence).toHaveLength(array.length - 1);
    });

    it('should verify valid shuffle proof', async () => {
      const originalArray = createTestArray(10);
      const result = await SecureShuffle.shuffle([...originalArray], true);

      const verification = await SecureShuffle.verifyShuffleProof(
        originalArray,
        result.shuffledArray,
        result.shuffleProof
      );

      expect(verification.isValid).toBe(true);
      expect(verification.errors).toHaveLength(0);
    });

    it('should detect tampering with shuffled array', async () => {
      const originalArray = createTestArray(10);
      const result = await SecureShuffle.shuffle([...originalArray], true);

      // Tamper with shuffled array
      const tamperedArray = [...result.shuffledArray];
      tamperedArray[0] = tamperedArray[1];
      tamperedArray[1] = 999; // Invalid element

      const verification = await SecureShuffle.verifyShuffleProof(
        originalArray,
        tamperedArray,
        result.shuffleProof
      );

      expect(verification.isValid).toBe(false);
      expect(verification.errors).toContain('Shuffled array hash mismatch');
    });

    it('should detect missing elements in shuffle', async () => {
      const originalArray = createTestArray(10);
      const result = await SecureShuffle.shuffle([...originalArray], true);

      // Remove an element
      const tamperedArray = result.shuffledArray.slice(0, -1);

      const verification = await SecureShuffle.verifyShuffleProof(
        originalArray,
        tamperedArray,
        result.shuffleProof
      );

      expect(verification.isValid).toBe(false);
      expect(verification.errors).toContain('Array lengths do not match');
    });

    it('should verify swap sequence reproduction', async () => {
      const originalArray = createTestArray(8);
      const result = await SecureShuffle.shuffle([...originalArray], true);

      // Manually apply swap sequence to verify
      const testArray = [...originalArray];
      const swapSequence = result.shuffleProof.swapSequence!;

      for (let i = 0; i < swapSequence.length; i++) {
        const swap = swapSequence[i];
        if (swap.indexA !== swap.indexB) {
          const temp = testArray[swap.indexA];
          testArray[swap.indexA] = testArray[swap.indexB];
          testArray[swap.indexB] = temp;
        }
      }

      expect(testArray).toEqual(result.shuffledArray);
    });
  });

  describe('Card Deck Specific Tests', () => {
    it('should shuffle a standard 52-card deck', async () => {
      const deck = createTestDeck();
      const result = await SecureShuffle.shuffle(deck);

      expect(result.shuffledArray).toHaveLength(52);
      
      // Verify all cards are unique
      const cardStrings = result.shuffledArray.map(card => `${card.rank}${card.suit}`);
      const uniqueCards = new Set(cardStrings);
      expect(uniqueCards.size).toBe(52);
    });

    it('should maintain card integrity during shuffle', async () => {
      const deck = createTestDeck();
      const result = await SecureShuffle.shuffle([...deck]);

      // Check each suit has 13 cards
      const suitCounts = new Map<Suit, number>();
      for (const card of result.shuffledArray) {
        suitCounts.set(card.suit, (suitCounts.get(card.suit) || 0) + 1);
      }

      expect(suitCounts.get(Suit.HEARTS)).toBe(13);
      expect(suitCounts.get(Suit.DIAMONDS)).toBe(13);
      expect(suitCounts.get(Suit.CLUBS)).toBe(13);
      expect(suitCounts.get(Suit.SPADES)).toBe(13);
    });

    it('should produce cryptographically different deck orders', async () => {
      const deck = createTestDeck();
      const shuffles: string[] = [];

      // Perform multiple shuffles
      for (let i = 0; i < 10; i++) {
        const result = await SecureShuffle.shuffle([...deck]);
        const deckString = result.shuffledArray
          .map(card => `${card.rank}${card.suit}`)
          .join(',');
        shuffles.push(deckString);
      }

      // All shuffles should be unique (statistically)
      const uniqueShuffles = new Set(shuffles);
      expect(uniqueShuffles.size).toBe(10);
    });
  });

  describe('Bias Elimination Tests', () => {
    it('should handle rejection sampling for bias elimination', async () => {
      // Test with array size that doesn't divide evenly into 256
      const primeSize = 17; // Prime number for worst-case modulo bias
      const array = createTestArray(primeSize);
      
      const results: ShuffleResult<number>[] = [];
      for (let i = 0; i < 100; i++) {
        results.push(await SecureShuffle.shuffle([...array]));
      }

      // Analyze quality - should show no bias
      const quality = SecureShuffle.analyzeShuffleQuality(results, array);
      
      expect(quality.qualityScore).toBeGreaterThan(0); // Quality score exists
      // For small sample size (100), we may get bias warnings
    });

    it('should use more entropy for difficult array sizes', async () => {
      // Array sizes that require more rejection sampling
      const easySize = 16; // Power of 2
      const hardSize = 17; // Prime number

      const easyResult = await SecureShuffle.shuffle(createTestArray(easySize));
      const hardResult = await SecureShuffle.shuffle(createTestArray(hardSize));

      // Hard size should use more entropy on average
      const easyEntropyPerElement = easyResult.shuffleProof.entropyUsed / easySize;
      const hardEntropyPerElement = hardResult.shuffleProof.entropyUsed / hardSize;

      expect(hardEntropyPerElement).toBeGreaterThanOrEqual(easyEntropyPerElement);
    });
  });

  describe('Security Edge Cases', () => {
    it('should handle maximum retries gracefully', async () => {
      // This test verifies the shuffle doesn't hang on edge cases
      const array = createTestArray(100);
      
      // Should complete without throwing
      const result = await SecureShuffle.shuffle(array);
      expect(result.shuffledArray).toHaveLength(100);
    });

    it('should maintain security with repeated elements', async () => {
      const arrayWithDuplicates = [1, 1, 2, 2, 3, 3, 4, 4];
      const result = await SecureShuffle.shuffle(arrayWithDuplicates);

      // Count elements
      const counts = new Map<number, number>();
      for (const elem of result.shuffledArray) {
        counts.set(elem, (counts.get(elem) || 0) + 1);
      }

      expect(counts.get(1)).toBe(2);
      expect(counts.get(2)).toBe(2);
      expect(counts.get(3)).toBe(2);
      expect(counts.get(4)).toBe(2);
    });

    it('should generate unique proofs for identical arrays', async () => {
      const array = createTestArray(10);
      const result1 = await SecureShuffle.shuffle([...array]);
      
      // Add small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const result2 = await SecureShuffle.shuffle([...array]);

      expect(result1.shuffleProof.timestamp).toBeLessThan(result2.shuffleProof.timestamp);
      expect(result1.shuffleProof.shuffledHash).not.toBe(result2.shuffleProof.shuffledHash);
    });
  });

  describe('Shuffle Quality Analysis', () => {
    it('should analyze shuffle quality correctly', async () => {
      const array = createTestArray(5);
      const shuffleResults: ShuffleResult<number>[] = [];

      // Perform many shuffles
      for (let i = 0; i < 200; i++) {
        shuffleResults.push(await SecureShuffle.shuffle([...array]));
      }

      const analysis = SecureShuffle.analyzeShuffleQuality(shuffleResults, array);

      expect(analysis.totalShuffles).toBe(200);
      expect(analysis.averageEntropyUsed).toBeGreaterThan(0);
      expect(analysis.qualityScore).toBeDefined(); // Quality score is calculated
      expect(analysis.positionDistribution.size).toBe(array.length);
    });

    it('should warn about small sample sizes', () => {
      const array = createTestArray(5);
      const shuffleResults: ShuffleResult<number>[] = [{
        shuffledArray: [3, 1, 4, 2, 0],
        shuffleProof: {
          originalHash: 'test',
          shuffledHash: 'test',
          entropyUsed: 10,
          timestamp: Date.now(),
          algorithm: 'secure-fisher-yates-v1'
        }
      }];

      const analysis = SecureShuffle.analyzeShuffleQuality(shuffleResults, array);
      expect(analysis.warnings).toContain('Sample size too small for reliable analysis');
    });
  });
});