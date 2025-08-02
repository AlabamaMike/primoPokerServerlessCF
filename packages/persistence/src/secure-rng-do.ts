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
import { RNGAuditStorage, SecurityAlert } from '@primo-poker/api/src/rng-audit-storage';

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
  private auditStorage: RNGAuditStorage | null = null;
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
    
    // Initialize audit storage if R2 bucket is available
    if (env.AUDIT_BUCKET) {
      this.auditStorage = new RNGAuditStorage(env.AUDIT_BUCKET);
    }
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

  async alarm(): Promise<void> {
    // This runs periodically for maintenance
    try {
      // Flush any pending audit logs
      await this.flushAuditLogs(true);
      
      // Clean up old audit logs from R2
      if (this.auditStorage) {
        const deletedCount = await this.auditStorage.cleanupOldLogs();
        console.log(`Cleaned up ${deletedCount} old audit logs from R2`);
      }
      
      // Schedule next alarm
      await this.state.storage.setAlarm(new Date(Date.now() + 24 * 60 * 60 * 1000)); // Daily
    } catch (error) {
      console.error('Alarm handler error:', error);
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
      
      // Create audit log
      const auditLog = await this.createAuditLog(
        'shuffle',
        request.tableId,
        request.gameId,
        shuffleResult.shuffleProof.entropyUsed,
        JSON.stringify(deck),
        JSON.stringify(shuffleResult.shuffledArray),
        {
          originalSize: deck.length,
          algorithm: shuffleResult.shuffleProof.algorithm,
          swaps: shuffleResult.shuffleProof.swapSequence?.length || 0
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
        JSON.stringify({ min, max }),
        JSON.stringify(randomValue),
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
        JSON.stringify({ length }),
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
        JSON.stringify(deck),
        commitment.commitmentHash,
        {
          deckSize: deck.length,
          commitmentVersion: commitment.version
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
    inputData: string,
    outputData: string,
    metadata?: Record<string, any>
  ): Promise<AuditLog> {
    const auditLog: AuditLog = {
      operation,
      timestamp: Date.now(),
      tableId,
      ...(gameId !== undefined && { gameId }),
      entropyUsed,
      inputHash: await CryptoHelpers.sha256Hex(inputData),
      outputHash: await CryptoHelpers.sha256Hex(outputData),
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
    if (!this.auditStorage || (this.pendingAuditLogs.length === 0 && !force)) {
      return;
    }
    
    try {
      // Store the batch
      const batchId = await this.auditStorage.storeBatch(this.tableId, this.pendingAuditLogs);
      
      // Clear pending logs
      this.pendingAuditLogs = [];
      this.lastAuditFlush = Date.now();
      
      // Check for suspicious patterns
      await this.checkForSuspiciousActivity();
      
      console.log(`Flushed ${this.pendingAuditLogs.length} audit logs to R2, batch: ${batchId}`);
    } catch (error) {
      console.error('Failed to flush audit logs to R2:', error);
      // Keep logs in memory for retry
    }
  }
  
  private async checkForSuspiciousActivity(): Promise<void> {
    if (!this.auditStorage) return;
    
    // Get recent analytics
    const analytics = await this.auditStorage.generateAnalytics(this.tableId, 1);
    
    // Check for suspicious patterns
    if (analytics.suspiciousPatterns.length > 0) {
      const alert: SecurityAlert = {
        id: crypto.randomUUID(),
        tableId: this.tableId,
        timestamp: Date.now(),
        severity: 'medium',
        type: 'suspicious_pattern',
        description: 'Suspicious RNG usage pattern detected',
        details: {
          patterns: analytics.suspiciousPatterns,
          recentOperations: analytics.totalOperations,
          entropyUsed: analytics.totalEntropyUsed
        }
      };
      
      await this.auditStorage.storeSecurityAlert(alert);
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

  // Cleanup method for alarm-based maintenance
  async alarm(): Promise<void> {
    if (!this.initialized || !this.storedState) return;

    try {
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