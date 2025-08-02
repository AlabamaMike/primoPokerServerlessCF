/**
 * SecureRNG Durable Object
 * 
 * Manages cryptographically secure RNG state for each poker table.
 * Uses crypto.getRandomValues() exclusively and maintains audit logs.
 */

import { Card } from '@primo-poker/shared';
import { 
  CryptoHelpers, 
  RandomState, 
  EntropySource,
  SecureShuffle, 
  ShuffleResult,
  DeckCommitmentScheme, 
  DeckCommitment, 
  DeckReveal 
} from '@primo-poker/security';
// Import types only to avoid circular dependency
export interface SecurityAlert {
  id: string;
  tableId: string;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  description: string;
  details: any;
}

export interface RNGRequest {
  type: 'shuffle' | 'random_int' | 'random_bytes' | 'commit_deck' | 'reveal_deck' | 'get_status';
  tableId: string;
  gameId?: string;
  data?: any;
}

export interface RNGResponse {
  success: boolean;
  data?: any;
  error?: string;
  audit?: AuditLog;
}

export interface AuditLog {
  operation: string;
  timestamp: number;
  tableId: string;
  gameId?: string;
  entropyUsed: number;
  inputHash?: string;
  outputHash?: string;
  metadata?: Record<string, any>;
}

export interface RNGStatus {
  tableId: string;
  isInitialized: boolean;
  lastOperation: number;
  operationCount: number;
  entropyRefreshes: number;
  lastEntropyRefresh: number;
  currentGameId?: string;
  committedDecks: number;
  totalEntropyUsed: number;
}

export interface StoredState {
  randomState: RandomState;
  status: RNGStatus;
  auditLogs: AuditLog[];
  commitments: Map<string, DeckCommitment>;
  lastBackup: number;
}

export class SecureRNGDurableObject {
  private state: DurableObjectState;
  private env: any;
  private tableId: string;
  private storedState?: StoredState;
  private initialized = false;
  private auditStorageAvailable = false;
  private pendingAuditLogs: AuditLog[] = [];
  private lastAuditFlush: number = Date.now();

  private static readonly MAX_AUDIT_LOGS = 10000;
  private static readonly BACKUP_INTERVAL = 300000; // 5 minutes
  private static readonly OPERATION_RATE_LIMIT = 1000; // per minute
  private static readonly AUDIT_FLUSH_INTERVAL = 60000; // 1 minute
  private static readonly AUDIT_FLUSH_SIZE = 50; // Batch size

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
    this.tableId = ''; // Will be set on first request
    
    // Check if audit storage is available
    this.auditStorageAvailable = !!env.AUDIT_BUCKET;
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const rngRequest: RNGRequest = await request.json();
      
      if (!this.initialized) {
        await this.initialize(rngRequest.tableId);
      }

      // Rate limiting
      if (!(await this.checkRateLimit())) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Rate limit exceeded'
        }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const response = await this.handleRequest(rngRequest);
      
      // Periodic backup
      await this.maybeBackup();

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }


  private async initialize(tableId: string): Promise<void> {
    this.tableId = tableId;

    // Try to load existing state
    const existingState = await this.state.storage.get<StoredState>('rng_state');
    
    if (existingState && existingState.randomState) {
      this.storedState = existingState;
      
      // Refresh entropy if needed
      this.storedState.randomState = await CryptoHelpers.refreshRandomState(
        this.storedState.randomState,
        this.tableId
      );
    } else {
      // Create new state
      const randomState = await CryptoHelpers.createRandomState(this.tableId);
      this.storedState = {
        randomState,
        status: {
          tableId: this.tableId,
          isInitialized: true,
          lastOperation: Date.now(),
          operationCount: 0,
          entropyRefreshes: 1,
          lastEntropyRefresh: Date.now(),
          committedDecks: 0,
          totalEntropyUsed: 0
        },
        auditLogs: [],
        commitments: new Map(),
        lastBackup: Date.now()
      };
    }

    // Update initialization
    this.storedState.status.isInitialized = true;
    this.storedState.status.lastOperation = Date.now();
    
    // Set up daily cleanup alarm if not already set
    const currentAlarm = await this.state.storage.getAlarm();
    if (!currentAlarm) {
      await this.state.storage.setAlarm(new Date(Date.now() + 24 * 60 * 60 * 1000));
    }
    
    await this.persistState();
    this.initialized = true;
  }

  private async handleRequest(request: RNGRequest): Promise<RNGResponse> {
    if (!this.storedState) {
      throw new Error('RNG not initialized');
    }

    switch (request.type) {
      case 'shuffle':
        return await this.handleShuffle(request);
      case 'random_int':
        return await this.handleRandomInt(request);
      case 'random_bytes':
        return await this.handleRandomBytes(request);
      case 'commit_deck':
        return await this.handleCommitDeck(request);
      case 'reveal_deck':
        return await this.handleRevealDeck(request);
      case 'get_status':
        return await this.handleGetStatus(request);
      default:
        return {
          success: false,
          error: `Unknown request type: ${request.type}`
        };
    }
  }

  private async handleShuffle(request: RNGRequest): Promise<RNGResponse> {
    const { deck } = request.data || {};
    
    if (!Array.isArray(deck)) {
      return { success: false, error: 'Invalid deck data' };
    }

    try {
      // Validate deck
      if (deck.length === 0 || deck.length > 52) {
        return { success: false, error: 'Invalid deck size' };
      }

      // Perform secure shuffle
      const shuffleResult = await SecureShuffle.shuffle(deck as Card[], true);
      
      // Create audit log - only store hashes of sensitive data
      const auditLog = await this.createAuditLog(
        'shuffle',
        request.tableId,
        request.gameId,
        shuffleResult.shuffleProof.entropyUsed,
        await CryptoHelpers.sha256Hex(JSON.stringify(deck)),
        shuffleResult.shuffleProof.shuffledHash,
        {
          originalSize: deck.length,
          algorithm: shuffleResult.shuffleProof.algorithm,
          swaps: shuffleResult.shuffleProof.swapSequence?.length || 0,
          deckIntegrity: await this.verifyDeckIntegrity(deck)
        }
      );

      // Update statistics
      this.storedState!.status.operationCount++;
      this.storedState!.status.totalEntropyUsed += shuffleResult.shuffleProof.entropyUsed;
      this.storedState!.status.lastOperation = Date.now();

      await this.persistState();

      return {
        success: true,
        data: {
          shuffledDeck: shuffleResult.shuffledArray,
          proof: shuffleResult.shuffleProof
        },
        audit: auditLog
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Shuffle failed'
      };
    }
  }

  private async handleRandomInt(request: RNGRequest): Promise<RNGResponse> {
    const { min, max } = request.data || {};
    
    if (typeof min !== 'number' || typeof max !== 'number' || min >= max) {
      return { success: false, error: 'Invalid min/max values' };
    }

    try {
      const randomValue = CryptoHelpers.generateSecureInteger(min, max);
      const entropyUsed = Math.ceil(Math.log2(max - min + 1) / 8);

      const auditLog = await this.createAuditLog(
        'random_int',
        request.tableId,
        request.gameId,
        entropyUsed,
        await CryptoHelpers.sha256Hex(JSON.stringify({ min, max })),
        await CryptoHelpers.sha256Hex(randomValue.toString()),
        { range: max - min + 1 }
      );

      this.storedState!.status.operationCount++;
      this.storedState!.status.totalEntropyUsed += entropyUsed;
      this.storedState!.status.lastOperation = Date.now();

      await this.persistState();

      return {
        success: true,
        data: { value: randomValue },
        audit: auditLog
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Random int generation failed'
      };
    }
  }

  private async handleRandomBytes(request: RNGRequest): Promise<RNGResponse> {
    const { length } = request.data || {};
    
    if (typeof length !== 'number' || length <= 0 || length > 1024) {
      return { success: false, error: 'Invalid byte length (1-1024)' };
    }

    try {
      const randomBytes = CryptoHelpers.generateSecureBytes(length);
      const bytesArray = Array.from(randomBytes);

      const auditLog = await this.createAuditLog(
        'random_bytes',
        request.tableId,
        request.gameId,
        length,
        await CryptoHelpers.sha256Hex(JSON.stringify({ length })),
        await CryptoHelpers.sha256Hex(randomBytes),
        { bytesGenerated: length }
      );

      this.storedState!.status.operationCount++;
      this.storedState!.status.totalEntropyUsed += length;
      this.storedState!.status.lastOperation = Date.now();

      await this.persistState();

      return {
        success: true,
        data: { bytes: bytesArray },
        audit: auditLog
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Random bytes generation failed'
      };
    }
  }

  private async handleCommitDeck(request: RNGRequest): Promise<RNGResponse> {
    const { deck, gameId } = request.data || {};
    
    if (!Array.isArray(deck) || !gameId) {
      return { success: false, error: 'Invalid deck or gameId' };
    }

    try {
      const commitment = await DeckCommitmentScheme.createCommitment(
        deck as Card[],
        request.tableId,
        gameId
      );

      // Store commitment
      this.storedState!.commitments.set(gameId, commitment);
      this.storedState!.status.committedDecks++;

      const auditLog = await this.createAuditLog(
        'commit_deck',
        request.tableId,
        gameId,
        32, // nonce size
        await CryptoHelpers.sha256Hex(JSON.stringify(deck)),
        commitment.commitmentHash,
        {
          deckSize: deck.length,
          commitmentVersion: commitment.version,
          deckIntegrity: await this.verifyDeckIntegrity(deck)
        }
      );

      this.storedState!.status.operationCount++;
      this.storedState!.status.totalEntropyUsed += 32;
      this.storedState!.status.lastOperation = Date.now();

      await this.persistState();

      return {
        success: true,
        data: { commitment },
        audit: auditLog
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Deck commitment failed'
      };
    }
  }

  private async handleRevealDeck(request: RNGRequest): Promise<RNGResponse> {
    const { deck, gameId } = request.data || {};
    
    if (!Array.isArray(deck) || !gameId) {
      return { success: false, error: 'Invalid deck or gameId' };
    }

    const commitment = this.storedState!.commitments.get(gameId);
    if (!commitment) {
      return { success: false, error: 'No commitment found for this game' };
    }

    try {
      const reveal = await DeckCommitmentScheme.shuffleAndReveal(
        deck as Card[],
        commitment
      );

      const auditLog = await this.createAuditLog(
        'reveal_deck',
        request.tableId,
        gameId,
        reveal.shuffleResult.shuffleProof.entropyUsed,
        commitment.commitmentHash,
        reveal.shuffleResult.shuffleProof.shuffledHash,
        {
          commitmentValid: reveal.revealProof.commitmentVerified,
          shuffleValid: reveal.revealProof.shuffleVerified,
          deckIntegrity: reveal.revealProof.deckIntegrity
        }
      );

      this.storedState!.status.operationCount++;
      this.storedState!.status.totalEntropyUsed += reveal.shuffleResult.shuffleProof.entropyUsed;
      this.storedState!.status.lastOperation = Date.now();

      await this.persistState();

      return {
        success: true,
        data: { reveal },
        audit: auditLog
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Deck reveal failed'
      };
    }
  }

  private async handleGetStatus(request: RNGRequest): Promise<RNGResponse> {
    if (!this.storedState) {
      return { success: false, error: 'RNG not initialized' };
    }

    const status = {
      ...this.storedState.status,
      auditLogCount: this.storedState.auditLogs.length,
      memoryUsage: this.getMemoryUsage()
    };

    return {
      success: true,
      data: { status }
    };
  }

  private async createAuditLog(
    operation: string,
    tableId: string,
    gameId: string | undefined,
    entropyUsed: number,
    inputHash: string,  // Now expects hash instead of raw data
    outputHash: string, // Now expects hash instead of raw data
    metadata?: Record<string, any>
  ): Promise<AuditLog> {
    const auditLog: AuditLog = {
      operation,
      timestamp: Date.now(),
      tableId,
      ...(gameId !== undefined && { gameId }),
      entropyUsed,
      inputHash,  // Already hashed
      outputHash, // Already hashed
      ...(metadata !== undefined && { metadata })
    };

    // Add to stored logs
    this.storedState!.auditLogs.push(auditLog);
    
    // Add to pending R2 upload
    this.pendingAuditLogs.push(auditLog);
    
    // Check if we should flush to R2
    await this.maybeFlushAuditLogs();

    // Trim old logs if necessary
    if (this.storedState!.auditLogs.length > SecureRNGDurableObject.MAX_AUDIT_LOGS) {
      this.storedState!.auditLogs = this.storedState!.auditLogs.slice(-SecureRNGDurableObject.MAX_AUDIT_LOGS);
    }

    return auditLog;
  }

  private async checkRateLimit(): Promise<boolean> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Count operations in the last minute
    const recentOps = this.storedState!.auditLogs.filter(
      log => log.timestamp > oneMinuteAgo
    ).length;

    return recentOps < SecureRNGDurableObject.OPERATION_RATE_LIMIT;
  }

  private async maybeBackup(): Promise<void> {
    const now = Date.now();
    if (now - this.storedState!.lastBackup > SecureRNGDurableObject.BACKUP_INTERVAL) {
      await this.persistState();
      this.storedState!.lastBackup = now;
      
      // Optionally backup to R2 storage here
      if (this.env.AUDIT_BUCKET) {
        await this.backupToR2();
      }
    }
  }

  private async backupToR2(): Promise<void> {
    try {
      // Force flush any pending audit logs
      await this.flushAuditLogs(true);
      
      const backup = {
        tableId: this.tableId,
        timestamp: Date.now(),
        status: this.storedState!.status,
        auditLogs: this.storedState!.auditLogs.slice(-1000), // Last 1000 logs
        commitmentCount: this.storedState!.commitments.size
      };

      const backupKey = `rng-backup/${this.tableId}/${Date.now()}.json`;
      await this.env.AUDIT_BUCKET.put(backupKey, JSON.stringify(backup));
    } catch (error) {
      console.error('Failed to backup to R2:', error);
    }
  }
  
  private async maybeFlushAuditLogs(): Promise<void> {
    const now = Date.now();
    const shouldFlush = 
      this.pendingAuditLogs.length >= SecureRNGDurableObject.AUDIT_FLUSH_SIZE ||
      now - this.lastAuditFlush > SecureRNGDurableObject.AUDIT_FLUSH_INTERVAL;
    
    if (shouldFlush) {
      await this.flushAuditLogs();
    }
  }
  
  private async flushAuditLogs(force: boolean = false): Promise<void> {
    if (!this.auditStorageAvailable || (this.pendingAuditLogs.length === 0 && !force)) {
      return;
    }
    
    try {
      // Store audit logs directly to R2
      const batchId = `${Date.now()}-${crypto.randomUUID()}`;
      const batchKey = `audit-batch/${this.tableId}/${batchId}.json`;
      
      const batch = {
        tableId: this.tableId,
        batchId,
        timestamp: Date.now(),
        logs: this.pendingAuditLogs,
        summary: {
          operationCount: this.pendingAuditLogs.length,
          totalEntropyUsed: this.pendingAuditLogs.reduce((sum, log) => sum + (log.entropyUsed || 0), 0),
          operationTypes: this.pendingAuditLogs.reduce((acc, log) => {
            acc[log.operation] = (acc[log.operation] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          timeRange: {
            start: Math.min(...this.pendingAuditLogs.map(l => l.timestamp)),
            end: Math.max(...this.pendingAuditLogs.map(l => l.timestamp))
          }
        }
      };
      
      await this.env.AUDIT_BUCKET.put(batchKey, JSON.stringify(batch));
      
      // Clear pending logs
      const logCount = this.pendingAuditLogs.length;
      this.pendingAuditLogs = [];
      this.lastAuditFlush = Date.now();
      
      // Check for suspicious patterns
      await this.checkForSuspiciousActivity();
      
      console.log(`Flushed ${logCount} audit logs to R2, batch: ${batchId}`);
    } catch (error) {
      console.error('Failed to flush audit logs to R2:', error);
      // Keep logs in memory for retry
    }
  }
  
  private async checkForSuspiciousActivity(): Promise<void> {
    if (!this.auditStorageAvailable) return;
    
    // Simple suspicious pattern detection based on recent logs
    const recentLogs = this.storedState!.auditLogs.slice(-100);
    const suspiciousPatterns: string[] = [];
    
    // Check for excessive operations in short time
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentOpsCount = recentLogs.filter(log => log.timestamp > oneMinuteAgo).length;
    
    if (recentOpsCount > 50) {
      suspiciousPatterns.push(`Excessive operations (${recentOpsCount}) in last minute`);
    }
    
    // Check for repeated operations
    const opCounts = recentLogs.reduce((acc, log) => {
      acc[log.operation] = (acc[log.operation] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    for (const [op, count] of Object.entries(opCounts)) {
      if (count > 30) {
        suspiciousPatterns.push(`Repeated ${op} operations (${count} times)`);
      }
    }
    
    if (suspiciousPatterns.length > 0) {
      const alert: SecurityAlert = {
        id: crypto.randomUUID(),
        tableId: this.tableId,
        timestamp: Date.now(),
        severity: 'medium',
        type: 'suspicious_pattern',
        description: 'Suspicious RNG usage pattern detected',
        details: {
          patterns: suspiciousPatterns,
          recentOperations: recentLogs.length,
          entropyUsed: recentLogs.reduce((sum, log) => sum + (log.entropyUsed || 0), 0)
        }
      };
      
      // Store security alert to R2
      const alertKey = `security-alert/${this.tableId}/${alert.id}.json`;
      await this.env.AUDIT_BUCKET.put(alertKey, JSON.stringify(alert));
    }
  }

  private async persistState(): Promise<void> {
    if (!this.storedState) return;

    // Convert Map to object for storage
    const commitmentEntries = Array.from(this.storedState.commitments.entries());
    const stateToStore = {
      ...this.storedState,
      commitments: commitmentEntries
    };

    await this.state.storage.put('rng_state', stateToStore);
  }

  private getMemoryUsage(): Record<string, number> {
    return {
      auditLogs: this.storedState!.auditLogs.length,
      commitments: this.storedState!.commitments.size,
      approximateSize: JSON.stringify(this.storedState).length
    };
  }

  private async verifyDeckIntegrity(deck: any[]): Promise<string> {
    // Create a hash representing deck integrity without exposing card values
    const deckSignature = {
      size: deck.length,
      uniqueCards: new Set(deck.map(c => `${c.suit}:${c.rank}`)).size,
      checksum: deck.reduce((sum, card) => sum + card.suit.charCodeAt(0) + card.rank.charCodeAt(0), 0)
    };
    return await CryptoHelpers.sha256Hex(JSON.stringify(deckSignature));
  }

  // Cleanup method for alarm-based maintenance
  async alarm(): Promise<void> {
    if (!this.initialized || !this.storedState) return;

    try {
      // Flush any pending audit logs
      await this.flushAuditLogs(true);
      
      // Refresh entropy
      this.storedState.randomState = await CryptoHelpers.refreshRandomState(
        this.storedState.randomState,
        this.tableId,
        true
      );
      
      this.storedState.status.entropyRefreshes++;
      this.storedState.status.lastEntropyRefresh = Date.now();

      // Cleanup old audit logs
      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      this.storedState.auditLogs = this.storedState.auditLogs.filter(
        log => log.timestamp > oneWeekAgo
      );

      // Cleanup old commitments (older than 24 hours)
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      for (const [gameId, commitment] of this.storedState.commitments) {
        if (commitment.timestamp < oneDayAgo) {
          this.storedState.commitments.delete(gameId);
        }
      }

      await this.persistState();
      await this.backupToR2();

      // Schedule next alarm
      const nextAlarm = Date.now() + 3600000; // 1 hour
      await this.state.storage.setAlarm(nextAlarm);

    } catch (error) {
      console.error('Alarm error:', error);
    }
  }
}