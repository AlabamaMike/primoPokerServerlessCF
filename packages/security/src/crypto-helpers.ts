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

export class CryptoHelpers {
  private static readonly ENTROPY_POOL_SIZE = 256;
  private static readonly REFRESH_INTERVAL = 300000; // 5 minutes
  private static readonly MAX_COUNTER = 0xFFFFFFFF;

  /**
   * Generates cryptographically secure random bytes
   * Uses crypto.getRandomValues() exclusively
   */
  static generateSecureBytes(length: number): Uint8Array {
    if (length <= 0 || length > 65536) {
      throw new Error('Invalid byte length requested');
    }
    return crypto.getRandomValues(new Uint8Array(length));
  }

  /**
   * Generates a cryptographically secure integer in range [min, max]
   * Eliminates modulo bias using rejection sampling
   */
  static generateSecureInteger(min: number, max: number): number {
    if (min >= max) {
      throw new Error('Invalid range: min must be less than max');
    }
    if (min < 0 || max > 0xFFFFFFFF) {
      throw new Error('Range must be within 32-bit unsigned integer bounds');
    }

    const range = max - min + 1;
    const bytesNeeded = Math.ceil(Math.log2(range) / 8);
    const maxValidValue = Math.floor(0xFFFFFFFF / range) * range - 1;

    let randomValue: number;
    do {
      const randomBytes = this.generateSecureBytes(bytesNeeded);
      randomValue = 0;
      for (let i = 0; i < bytesNeeded; i++) {
        randomValue = (randomValue << 8) | (randomBytes[i] || 0);
      }
    } while (randomValue > maxValidValue);

    return min + (randomValue % range);
  }

  /**
   * Creates SHA-256 hash of data
   */
  static async sha256(data: string | Uint8Array): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data;
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    return new Uint8Array(hashBuffer);
  }

  /**
   * Creates SHA-256 hash and returns as hex string
   */
  static async sha256Hex(data: string | Uint8Array): Promise<string> {
    const hash = await this.sha256(data);
    return Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Generates a cryptographically secure seed
   */
  static generateSeed(length: number = 32): Uint8Array {
    return this.generateSecureBytes(length);
  }

  /**
   * Derives key material using HKDF
   */
  static async deriveKey(
    inputKeyMaterial: Uint8Array,
    salt: Uint8Array,
    info: string,
    outputLength: number
  ): Promise<Uint8Array> {
    const algorithm = { name: 'HKDF', hash: 'SHA-256' };
    
    // Import the input key material
    const key = await crypto.subtle.importKey(
      'raw',
      inputKeyMaterial,
      algorithm,
      false,
      ['deriveKey', 'deriveBits']
    );

    // Derive the key
    const derivedKey = await crypto.subtle.deriveBits(
      {
        ...algorithm,
        salt,
        info: new TextEncoder().encode(info),
      },
      key,
      outputLength * 8
    );

    return new Uint8Array(derivedKey);
  }

  /**
   * Mixes multiple entropy sources
   */
  static mixEntropy(sources: EntropySource[]): Uint8Array {
    if (sources.length === 0) {
      throw new Error('At least one entropy source required');
    }

    // Concatenate all entropy sources with metadata
    const combined = new Uint8Array(
      sources.reduce((total, source) => total + source.value.length + 16, 0)
    );

    let offset = 0;
    for (const source of sources) {
      // Add source identifier hash
      const sourceHash = new TextEncoder().encode(source.source + source.timestamp);
      combined.set(sourceHash.slice(0, 8), offset);
      offset += 8;

      // Add timestamp
      const timestampBytes = new ArrayBuffer(8);
      new DataView(timestampBytes).setBigUint64(0, BigInt(source.timestamp));
      combined.set(new Uint8Array(timestampBytes), offset);
      offset += 8;

      // Add entropy value
      combined.set(source.value, offset);
      offset += source.value.length;
    }

    return combined;
  }

  /**
   * Creates a constant-time comparison function
   */
  static constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= (a[i] || 0) ^ (b[i] || 0);
    }

    return result === 0;
  }

  /**
   * Securely clears a Uint8Array
   */
  static secureClear(data: Uint8Array): void {
    // Overwrite with random data first
    const random = this.generateSecureBytes(data.length);
    data.set(random);
    
    // Then zero out
    data.fill(0);
  }

  /**
   * Validates entropy quality (basic checks)
   */
  static validateEntropy(entropy: Uint8Array): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    if (entropy.length < 16) {
      issues.push('Entropy too short (minimum 16 bytes)');
    }

    // Check for obvious patterns
    let zeroCount = 0;
    let oneCount = 0;
    for (const byte of entropy) {
      if (byte === 0) zeroCount++;
      if (byte === 255) oneCount++;
    }

    const totalBytes = entropy.length;
    if (zeroCount > totalBytes * 0.9) {
      issues.push('Too many zero bytes');
    }
    if (oneCount > totalBytes * 0.9) {
      issues.push('Too many 0xFF bytes');
    }

    // Simple run test
    let runs = 1;
    for (let i = 1; i < entropy.length; i++) {
      if ((entropy[i] || 0) !== (entropy[i - 1] || 0)) {
        runs++;
      }
    }
    if (runs < totalBytes * 0.1) {
      issues.push('Insufficient randomness (run test)');
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  /**
   * Collects entropy from multiple sources
   */
  static async collectEntropy(tableId: string, playerId?: string): Promise<EntropySource[]> {
    const sources: EntropySource[] = [];
    const timestamp = Date.now();

    // High-quality crypto random
    sources.push({
      source: 'crypto.getRandomValues',
      timestamp,
      value: this.generateSecureBytes(32)
    });

    // Timestamp-based entropy
    const timestampBytes = new ArrayBuffer(8);
    new DataView(timestampBytes).setBigUint64(0, BigInt(timestamp * 1000000 + performance.now() * 1000));
    sources.push({
      source: 'high_precision_timestamp',
      timestamp,
      value: new Uint8Array(timestampBytes)
    });

    // Table-specific entropy
    const tableHash = await this.sha256(`${tableId}:${timestamp}`);
    sources.push({
      source: 'table_context',
      timestamp,
      value: tableHash.slice(0, 16)
    });

    // Player-specific entropy (if available)
    if (playerId) {
      const playerHash = await this.sha256(`${playerId}:${timestamp}:${Math.random()}`);
      sources.push({
        source: 'player_context',
        timestamp,
        value: playerHash.slice(0, 16)
      });
    }

    // Additional crypto random
    sources.push({
      source: 'additional_crypto_random',
      timestamp: timestamp + 1,
      value: this.generateSecureBytes(24)
    });

    return sources;
  }

  /**
   * Creates a random state for persistent RNG
   */
  static async createRandomState(tableId: string): Promise<RandomState> {
    const entropySourcesData = await this.collectEntropy(tableId);
    const combinedEntropy = this.mixEntropy(entropySourcesData);
    const seed = await this.sha256(combinedEntropy);

    return {
      entropy: entropySourcesData,
      seed: seed.slice(0, 32),
      counter: 0,
      lastRefresh: Date.now()
    };
  }

  /**
   * Refreshes random state if needed
   */
  static async refreshRandomState(
    state: RandomState,
    tableId: string,
    force: boolean = false
  ): Promise<RandomState> {
    const now = Date.now();
    const needsRefresh = force || 
      (now - state.lastRefresh > this.REFRESH_INTERVAL) ||
      (state.counter > this.MAX_COUNTER);

    if (!needsRefresh) {
      return state;
    }

    const newEntropy = await this.collectEntropy(tableId);
    const oldSeedHash = await this.sha256(state.seed);
    const newEntropyMixed = this.mixEntropy(newEntropy);
    
    // Combine old and new entropy
    const combined = new Uint8Array(oldSeedHash.length + newEntropyMixed.length);
    combined.set(oldSeedHash, 0);
    combined.set(newEntropyMixed, oldSeedHash.length);
    
    const newSeed = await this.sha256(combined);

    return {
      entropy: [...state.entropy, ...newEntropy],
      seed: newSeed.slice(0, 32),
      counter: 0,
      lastRefresh: now
    };
  }

  /**
   * Generates secure random from state
   */
  static async generateFromState(
    state: RandomState,
    length: number
  ): Promise<{ data: Uint8Array; newState: RandomState }> {
    // Create deterministic but secure output from state
    const counterBytes = new ArrayBuffer(4);
    new DataView(counterBytes).setUint32(0, state.counter);
    
    const input = new Uint8Array(state.seed.length + 4 + 8);
    input.set(state.seed, 0);
    input.set(new Uint8Array(counterBytes), state.seed.length);
    
    // Add timestamp for additional uniqueness
    const timestampBytes = new ArrayBuffer(8);
    new DataView(timestampBytes).setBigUint64(0, BigInt(Date.now()));
    input.set(new Uint8Array(timestampBytes), state.seed.length + 4);

    // Hash to get output
    let output = await this.sha256(input);
    
    // Extend if needed
    while (output.length < length) {
      const nextInput = new Uint8Array(output.length + 4);
      nextInput.set(output, 0);
      new DataView(counterBytes).setUint32(0, state.counter + Math.floor(output.length / 32));
      nextInput.set(new Uint8Array(counterBytes), output.length);
      
      const nextHash = await this.sha256(nextInput);
      const combined = new Uint8Array(output.length + nextHash.length);
      combined.set(output, 0);
      combined.set(nextHash, output.length);
      output = combined;
    }

    return {
      data: output.slice(0, length),
      newState: {
        ...state,
        counter: state.counter + 1
      }
    };
  }
}