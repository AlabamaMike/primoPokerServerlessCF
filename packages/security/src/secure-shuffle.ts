/**
 * Secure Shuffle Implementation
 * 
 * Implements cryptographically secure Fisher-Yates shuffle with bias elimination.
 * Uses crypto.getRandomValues() exclusively and ensures uniform distribution.
 */

import { CryptoHelpers } from './crypto-helpers';

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

export class SecureShuffle {
  private static readonly ALGORITHM_VERSION = 'secure-fisher-yates-v1';
  private static readonly MAX_ARRAY_SIZE = 10000;

  /**
   * Performs cryptographically secure Fisher-Yates shuffle
   * Eliminates modulo bias through rejection sampling
   */
  static async shuffle<T>(
    array: T[],
    recordSwaps: boolean = false
  ): Promise<ShuffleResult<T>> {
    if (array.length === 0) {
      throw new Error('Cannot shuffle empty array');
    }
    if (array.length > this.MAX_ARRAY_SIZE) {
      throw new Error(`Array too large (max ${this.MAX_ARRAY_SIZE})`);
    }

    const result = [...array];
    const swapSequence: SwapOperation[] = [];
    let totalEntropyUsed = 0;
    const timestamp = Date.now();

    // Hash original array for proof
    const originalSerialized = JSON.stringify(array);
    const originalHash = await CryptoHelpers.sha256Hex(originalSerialized);

    // Perform Fisher-Yates shuffle with bias elimination
    for (let i = result.length - 1; i > 0; i--) {
      const randomIndex = await this.generateUnbiasedIndex(i + 1);
      totalEntropyUsed += randomIndex.entropyUsed;

      // Swap elements
      if (randomIndex.value !== i) {
        const temp = result[i];
        result[i] = result[randomIndex.value]!;
        result[randomIndex.value] = temp!;

        if (recordSwaps) {
          swapSequence.push({
            step: result.length - 1 - i,
            indexA: i,
            indexB: randomIndex.value,
            entropyBytes: randomIndex.entropyBytes
          });
        }
      } else if (recordSwaps) {
        // Record even when no swap occurs (for verification)
        swapSequence.push({
          step: result.length - 1 - i,
          indexA: i,
          indexB: i,
          entropyBytes: randomIndex.entropyBytes
        });
      }
    }

    // Hash shuffled array for proof
    const shuffledSerialized = JSON.stringify(result);
    const shuffledHash = await CryptoHelpers.sha256Hex(shuffledSerialized);

    const proof: ShuffleProof = {
      originalHash,
      shuffledHash,
      entropyUsed: totalEntropyUsed,
      timestamp,
      algorithm: this.ALGORITHM_VERSION,
      ...(recordSwaps && { swapSequence })
    };

    return {
      shuffledArray: result,
      shuffleProof: proof
    };
  }

  /**
   * Generates an unbiased index in range [0, max)
   * Uses rejection sampling to eliminate modulo bias
   */
  private static async generateUnbiasedIndex(max: number): Promise<{
    value: number;
    entropyUsed: number;
    entropyBytes: Uint8Array;
  }> {
    if (max <= 1) {
      return {
        value: 0,
        entropyUsed: 0,
        entropyBytes: new Uint8Array(0)
      };
    }

    const bitsNeeded = Math.ceil(Math.log2(max));
    const bytesNeeded = Math.ceil(bitsNeeded / 8);
    const maxAttempts = 100; // Prevent infinite loops
    
    let attempts = 0;
    let totalEntropyUsed = 0;
    const allEntropyBytes: Uint8Array[] = [];

    while (attempts < maxAttempts) {
      attempts++;
      
      // Generate random bytes
      const randomBytes = CryptoHelpers.generateSecureBytes(bytesNeeded);
      allEntropyBytes.push(randomBytes);
      totalEntropyUsed += bytesNeeded;

      // Convert bytes to integer
      let randomValue = 0;
      for (let i = 0; i < bytesNeeded; i++) {
        randomValue = (randomValue << 8) | (randomBytes[i] || 0);
      }

      // Check if value is in unbiased range
      const maxUnbiasedValue = Math.floor((2 ** (bytesNeeded * 8)) / max) * max - 1;
      if (randomValue <= maxUnbiasedValue) {
        // Combine all entropy bytes used
        const combinedEntropy = new Uint8Array(totalEntropyUsed);
        let offset = 0;
        for (const bytes of allEntropyBytes) {
          combinedEntropy.set(bytes, offset);
          offset += bytes.length;
        }

        return {
          value: randomValue % max,
          entropyUsed: totalEntropyUsed,
          entropyBytes: combinedEntropy
        };
      }
    }

    throw new Error(`Failed to generate unbiased index after ${maxAttempts} attempts`);
  }

  /**
   * Verifies a shuffle proof
   */
  static async verifyShuffleProof<T>(
    originalArray: T[],
    shuffledArray: T[],
    proof: ShuffleProof
  ): Promise<{
    isValid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    // Basic validation
    if (originalArray.length !== shuffledArray.length) {
      errors.push('Array lengths do not match');
    }

    if (proof.algorithm !== this.ALGORITHM_VERSION) {
      errors.push(`Unsupported algorithm: ${proof.algorithm}`);
    }

    // Verify hashes
    try {
      const originalSerialized = JSON.stringify(originalArray);
      const originalHash = await CryptoHelpers.sha256Hex(originalSerialized);
      if (originalHash !== proof.originalHash) {
        errors.push('Original array hash mismatch');
      }

      const shuffledSerialized = JSON.stringify(shuffledArray);
      const shuffledHash = await CryptoHelpers.sha256Hex(shuffledSerialized);
      if (shuffledHash !== proof.shuffledHash) {
        errors.push('Shuffled array hash mismatch');
      }
    } catch (error) {
      errors.push(`Hash verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Verify all elements are present (no addition/removal)
    if (errors.length === 0) {
      const originalSet = new Set(originalArray.map(item => JSON.stringify(item)));
      const shuffledSet = new Set(shuffledArray.map(item => JSON.stringify(item)));
      
      if (originalSet.size !== shuffledSet.size) {
        errors.push('Element count mismatch');
      } else {
        for (const item of originalSet) {
          if (!shuffledSet.has(item)) {
            errors.push('Missing element in shuffled array');
            break;
          }
        }
        for (const item of shuffledSet) {
          if (!originalSet.has(item)) {
            errors.push('Extra element in shuffled array');
            break;
          }
        }
      }
    }

    // Verify swap sequence if provided
    if (proof.swapSequence && errors.length === 0) {
      try {
        const verified = await this.verifySwapSequence(
          originalArray,
          shuffledArray,
          proof.swapSequence
        );
        if (!verified) {
          errors.push('Swap sequence verification failed');
        }
      } catch (error) {
        errors.push(`Swap sequence error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Verifies a swap sequence reproduces the shuffle
   */
  private static async verifySwapSequence<T>(
    originalArray: T[],
    shuffledArray: T[],
    swapSequence: SwapOperation[]
  ): Promise<boolean> {
    const testArray = [...originalArray];
    
    if (swapSequence.length !== Math.max(0, originalArray.length - 1)) {
      return false;
    }

    // Apply swaps in sequence
    for (let i = 0; i < swapSequence.length; i++) {
      const swap = swapSequence[i];
      if (!swap) continue;

      // Verify step number
      if (swap.step !== i) {
        return false;
      }

      // Verify indices are valid
      const arrayIndex = originalArray.length - 1 - i;
      if (swap.indexA !== arrayIndex) {
        return false;
      }
      if (swap.indexB < 0 || swap.indexB > arrayIndex) {
        return false;
      }

      // Verify the random index generation
      if (arrayIndex > 0) {
        const expectedIndex = await this.verifyRandomIndex(
          arrayIndex + 1,
          swap.indexB,
          swap.entropyBytes
        );
        if (!expectedIndex) {
          return false;
        }
      }

      // Apply swap
      if (swap.indexA !== swap.indexB) {
        const temp = testArray[swap.indexA];
        testArray[swap.indexA] = testArray[swap.indexB]!;
        testArray[swap.indexB] = temp!;
      }
    }

    // Check if result matches
    return JSON.stringify(testArray) === JSON.stringify(shuffledArray);
  }

  /**
   * Verifies that given entropy bytes produce the expected index
   */
  private static async verifyRandomIndex(
    max: number,
    expectedIndex: number,
    entropyBytes: Uint8Array
  ): Promise<boolean> {
    if (max <= 1) {
      return expectedIndex === 0;
    }

    const bitsNeeded = Math.ceil(Math.log2(max));
    const bytesNeeded = Math.ceil(bitsNeeded / 8);
    
    let offset = 0;
    while (offset < entropyBytes.length) {
      if (offset + bytesNeeded > entropyBytes.length) {
        break;
      }

      // Extract bytes for this attempt
      const attemptBytes = entropyBytes.slice(offset, offset + bytesNeeded);
      offset += bytesNeeded;

      // Convert to integer
      let randomValue = 0;
      for (let i = 0; i < bytesNeeded; i++) {
        randomValue = (randomValue << 8) | (attemptBytes[i] || 0);
      }

      // Check if this would be accepted (unbiased)
      const maxUnbiasedValue = Math.floor((2 ** (bytesNeeded * 8)) / max) * max - 1;
      if (randomValue <= maxUnbiasedValue) {
        return (randomValue % max) === expectedIndex;
      }
    }

    return false;
  }

  /**
   * Analyzes shuffle quality for potential bias
   */
  static analyzeShuffleQuality<T>(
    shuffleResults: ShuffleResult<T>[],
    originalArray: T[]
  ): {
    totalShuffles: number;
    averageEntropyUsed: number;
    positionDistribution: Map<number, Map<string, number>>;
    qualityScore: number;
    warnings: string[];
  } {
    const warnings: string[] = [];
    const positionDistribution = new Map<number, Map<string, number>>();
    let totalEntropy = 0;

    // Initialize position tracking
    for (let pos = 0; pos < originalArray.length; pos++) {
      positionDistribution.set(pos, new Map());
    }

    // Analyze each shuffle
    for (const result of shuffleResults) {
      totalEntropy += result.shuffleProof.entropyUsed;

      // Track where each element ended up
      for (let pos = 0; pos < result.shuffledArray.length; pos++) {
        const element = JSON.stringify(result.shuffledArray[pos]);
        const posMap = positionDistribution.get(pos)!;
        posMap.set(element, (posMap.get(element) || 0) + 1);
      }
    }

    // Calculate quality metrics
    const expectedFrequency = shuffleResults.length / originalArray.length;
    let chiSquareSum = 0;
    let totalVariance = 0;

    for (const [pos, elementCounts] of positionDistribution) {
      for (const element of originalArray) {
        const elementStr = JSON.stringify(element);
        const observed = elementCounts.get(elementStr) || 0;
        const variance = Math.pow(observed - expectedFrequency, 2);
        chiSquareSum += variance / expectedFrequency;
        totalVariance += variance;
      }
    }

    const qualityScore = Math.max(0, 100 - (chiSquareSum / (originalArray.length * originalArray.length)) * 100);

    // Generate warnings
    if (shuffleResults.length < 100) {
      warnings.push('Sample size too small for reliable analysis');
    }
    if (qualityScore < 95) {
      warnings.push('Potential bias detected in shuffle distribution');
    }
    if (totalVariance / shuffleResults.length > expectedFrequency * 2) {
      warnings.push('High variance in element distribution');
    }

    return {
      totalShuffles: shuffleResults.length,
      averageEntropyUsed: totalEntropy / shuffleResults.length,
      positionDistribution,
      qualityScore,
      warnings
    };
  }
}