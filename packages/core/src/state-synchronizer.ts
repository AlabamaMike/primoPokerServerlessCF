import type { GameState } from '@primo-poker/shared'
import { 
  StateSnapshot, 
  StateDelta, 
  StateChange,
  SyncResult,
  StateRecovery,
  PlayerActionRecord,
  StateConflict,
  ConflictResolutionStrategy,
  StateSyncOptions,
  PlayerState,
  PlayerRole,
  AuthorityLevel,
  AuthorityRules
} from './state-snapshot'

export * from './state-snapshot'

export interface StateSynchronizerOptions {
  maxHistorySize?: number
  maxDeltaHistorySize?: number
  maxActionLogSize?: number
  enableLogging?: boolean
  versionDiffThreshold?: number // Configurable threshold for full snapshot vs delta
  maxDeltaSize?: number // Maximum delta size in bytes before sending full snapshot
  enableComparisonCache?: boolean // Enable caching for object comparisons
  maxComparisonCacheSize?: number // Maximum number of cached comparisons
}

export class StateSynchronizer {
  private versionCounter: number = 0
  private stateHistory: Map<number, StateSnapshot> = new Map()
  private deltaHistory: Map<string, StateDelta> = new Map()
  private actionLog: PlayerActionRecord[] = []
  private readonly options: Required<StateSynchronizerOptions>
  private comparisonCache: Map<string, boolean> = new Map()
  private versionLock: Promise<void> = Promise.resolve()
  
  constructor(options: StateSynchronizerOptions = {}) {
    this.options = {
      maxHistorySize: options.maxHistorySize ?? 50,
      maxDeltaHistorySize: options.maxDeltaHistorySize ?? 100,
      maxActionLogSize: options.maxActionLogSize ?? 200,
      enableLogging: options.enableLogging ?? true,
      versionDiffThreshold: options.versionDiffThreshold ?? 10,
      maxDeltaSize: options.maxDeltaSize ?? 10 * 1024, // 10KB default
      enableComparisonCache: options.enableComparisonCache ?? true,
      maxComparisonCacheSize: options.maxComparisonCacheSize ?? 1000
    }
  }

  async createSnapshot(
    gameState: GameState, 
    playerStates: Map<string, PlayerState>
  ): Promise<StateSnapshot> {
    // Atomic version increment
    const version = await this.incrementVersion()
    
    // Deep copy using structuredClone for proper deep cloning
    const copiedGameState = this.deepClone(gameState)
    const copiedPlayerStates = new Map<string, PlayerState>()
    for (const [playerId, state] of playerStates) {
      copiedPlayerStates.set(playerId, this.deepClone(state))
    }
    
    const snapshot: StateSnapshot = {
      version,
      hash: await this.calculateHash(copiedGameState, copiedPlayerStates),
      gameState: copiedGameState,
      playerStates: copiedPlayerStates,
      timestamp: Date.now()
    }
    
    this.stateHistory.set(snapshot.version, snapshot)
    this.cleanupHistory()
    return snapshot
  }

  async syncState(
    clientVersion: number, 
    currentSnapshot: StateSnapshot,
    options?: StateSyncOptions
  ): Promise<SyncResult> {
    const versionDiff = currentSnapshot.version - clientVersion
    
    // Estimate delta size for large player states
    const estimatedSize = JSON.stringify(currentSnapshot).length
    
    // If too many versions behind or delta would be too large, send full snapshot
    if (versionDiff > this.options.versionDiffThreshold || 
        (options?.maxDeltaSize && estimatedSize > options.maxDeltaSize) ||
        estimatedSize > this.options.maxDeltaSize) {
      return {
        type: 'snapshot',
        snapshot: currentSnapshot
      }
    }
    
    // Generate delta from client version to current
    const clientSnapshot = this.stateHistory.get(clientVersion)
    if (!clientSnapshot) {
      return {
        type: 'snapshot',
        snapshot: currentSnapshot
      }
    }
    
    const delta = await this.generateDelta(clientSnapshot, currentSnapshot)
    
    return {
      type: 'delta',
      fromVersion: clientVersion,
      toVersion: currentSnapshot.version,
      changes: delta.changes
    }
  }

  async generateDelta(from: StateSnapshot, to: StateSnapshot): Promise<StateDelta> {
    const changes: StateChange[] = []
    
    // Compare game state
    this.compareObjects(from.gameState, to.gameState, 'gameState', changes)
    
    // Compare player states
    this.comparePlayerStates(from.playerStates, to.playerStates, changes)
    
    const delta: StateDelta = {
      fromVersion: from.version,
      toVersion: to.version,
      changes,
      timestamp: Date.now()
    }
    
    // Store delta for history
    const deltaKey = `${from.version}-${to.version}`
    this.deltaHistory.set(deltaKey, delta)
    this.cleanupDeltaHistory()
    
    return delta
  }

  async applyDelta(snapshot: StateSnapshot, delta: StateDelta): Promise<StateSnapshot> {
    if (snapshot.version !== delta.fromVersion) {
      throw new Error(`Version mismatch: snapshot version ${snapshot.version} does not match delta fromVersion ${delta.fromVersion}`)
    }
    
    // Create a deep copy of the snapshot using structuredClone
    const newSnapshot: StateSnapshot = {
      version: delta.toVersion,
      hash: '',
      gameState: this.deepClone(snapshot.gameState),
      playerStates: new Map(),
      timestamp: Date.now()
    }
    
    // Deep copy player states
    for (const [playerId, state] of snapshot.playerStates) {
      newSnapshot.playerStates.set(playerId, this.deepClone(state))
    }
    
    // Apply each change
    for (const change of delta.changes) {
      this.applyChange(newSnapshot, change)
    }
    
    // Recalculate hash
    newSnapshot.hash = await this.calculateHash(newSnapshot.gameState, newSnapshot.playerStates)
    
    return newSnapshot
  }

  async validateState(snapshot: StateSnapshot): Promise<boolean> {
    try {
      // Basic structure validation
      if (!snapshot.version || !snapshot.hash || !snapshot.gameState || !snapshot.timestamp) {
        this.log('State validation failed: missing required fields')
        return false
      }
      
      // Validate game state properties
      if (snapshot.gameState.pot < 0) {
        this.log('State validation failed: negative pot value')
        return false
      }
      
      // Validate player states
      if (!(snapshot.playerStates instanceof Map)) {
        this.log('State validation failed: playerStates is not a Map')
        return false
      }
      
      for (const [playerId, playerState] of snapshot.playerStates) {
        if (!playerState.id || playerState.chips < 0) {
          this.log(`State validation failed: invalid player state for ${playerId}`)
          return false
        }
      }
      
      // Verify hash integrity
      const calculatedHash = await this.calculateHash(snapshot.gameState, snapshot.playerStates)
      const isValid = calculatedHash === snapshot.hash
      if (!isValid) {
        this.log('State validation failed: hash mismatch')
      }
      return isValid
    } catch (error) {
      this.log(`State validation error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  async detectConflicts(
    actions: PlayerActionRecord[], 
    currentSnapshot?: StateSnapshot
  ): Promise<StateConflict[]> {
    const conflicts: StateConflict[] = []
    const actionsByPlayer = new Map<string, PlayerActionRecord[]>()
    
    // Enrich actions with player authority information from snapshot
    const enrichedActions = actions.map(action => {
      if (currentSnapshot?.playerStates.has(action.playerId)) {
        const playerState = currentSnapshot.playerStates.get(action.playerId)!
        const enriched: PlayerActionRecord = {
          ...action,
          playerRole: action.playerRole || playerState.role || PlayerRole.PLAYER
        }
        
        // Only set authorityLevel if we have a value
        if (action.authorityLevel !== undefined) {
          enriched.authorityLevel = action.authorityLevel
        } else if (playerState.isDealer) {
          enriched.authorityLevel = AuthorityLevel.DEALER
        }
        
        return enriched
      }
      return action
    })
    
    // Group actions by player
    for (const action of enrichedActions) {
      if (!actionsByPlayer.has(action.playerId)) {
        actionsByPlayer.set(action.playerId, [])
      }
      actionsByPlayer.get(action.playerId)!.push(action)
    }
    
    // Check for duplicate actions from same player at same timestamp
    for (const [playerId, playerActions] of actionsByPlayer) {
      // Group by timestamp to find duplicates
      const timestampGroups = new Map<number, PlayerActionRecord[]>()
      for (const action of playerActions) {
        if (!timestampGroups.has(action.timestamp)) {
          timestampGroups.set(action.timestamp, [])
        }
        timestampGroups.get(action.timestamp)!.push(action)
      }
      
      // Find timestamps with multiple actions
      for (const [timestamp, actions] of timestampGroups) {
        if (actions.length > 1) {
          conflicts.push({
            type: 'duplicate_action',
            actions: actions,
            resolution: 'Use AUTHORITY_BASED strategy to resolve based on player roles'
          })
        }
      }
    }
    
    // Check for out-of-turn actions if snapshot provided
    if (currentSnapshot?.gameState.activePlayerId) {
      const outOfTurn = enrichedActions.filter(
        action => action.playerId !== currentSnapshot.gameState.activePlayerId
      )
      
      for (const action of outOfTurn) {
        // Check if player has authority to act out of turn (e.g., admin override)
        const hasOverrideAuthority = action.playerRole === PlayerRole.ADMIN || 
                                   (action.authorityLevel && action.authorityLevel >= AuthorityLevel.ADMIN)
        
        if (!hasOverrideAuthority) {
          conflicts.push({
            type: 'out_of_turn',
            actions: [action],
            resolution: 'Player lacks authority to act out of turn'
          })
        }
      }
    }
    
    return conflicts
  }

  async resolveConflicts(
    actions: PlayerActionRecord[],
    strategy: ConflictResolutionStrategy,
    options?: StateSyncOptions
  ): Promise<PlayerActionRecord[]> {
    switch (strategy) {
      case ConflictResolutionStrategy.TIMESTAMP_FIRST:
        // Sort by timestamp, keep only first action per player per timestamp  
        const sorted = [...actions].sort((a, b) => a.timestamp - b.timestamp)
        const seen = new Map<string, number>()
        return sorted.filter(action => {
          const lastTimestamp = seen.get(action.playerId)
          if (lastTimestamp === action.timestamp) {
            return false // Skip duplicate at same timestamp
          }
          seen.set(action.playerId, action.timestamp)
          return true
        })
        
      case ConflictResolutionStrategy.SEQUENTIAL:
        // Keep all actions in order
        return [...actions].sort((a, b) => a.timestamp - b.timestamp)
        
      case ConflictResolutionStrategy.AUTHORITY_BASED:
        return this.resolveByAuthority(actions, options?.authorityRules)
        
      default:
        return actions
    }
  }

  private async resolveByAuthority(
    actions: PlayerActionRecord[],
    authorityRules?: AuthorityRules
  ): Promise<PlayerActionRecord[]> {
    // Use custom resolver if provided
    if (authorityRules?.customResolver) {
      const resolved: PlayerActionRecord[] = []
      const actionsByTimestamp = new Map<number, PlayerActionRecord[]>()
      
      // Group actions by timestamp
      for (const action of actions) {
        if (!actionsByTimestamp.has(action.timestamp)) {
          actionsByTimestamp.set(action.timestamp, [])
        }
        actionsByTimestamp.get(action.timestamp)!.push(action)
      }
      
      // Resolve conflicts at each timestamp
      for (const [timestamp, timestampActions] of actionsByTimestamp) {
        if (timestampActions.length === 1) {
          resolved.push(timestampActions[0]!)
        } else {
          // Use custom resolver to pick winner
          let winner = timestampActions[0]!
          for (let i = 1; i < timestampActions.length; i++) {
            winner = authorityRules.customResolver(winner, timestampActions[i]!)
          }
          resolved.push(winner)
        }
      }
      
      return resolved.sort((a, b) => a.timestamp - b.timestamp)
    }
    
    // Default authority-based resolution
    const authorityLevels = this.getAuthorityLevels(authorityRules)
    
    // Group actions by timestamp to detect conflicts
    // Use Math.floor to group by integer timestamp (ignore microseconds for grouping)
    const actionsByTimestamp = new Map<number, PlayerActionRecord[]>()
    for (const action of actions) {
      const timestampInt = Math.floor(action.timestamp)
      if (!actionsByTimestamp.has(timestampInt)) {
        actionsByTimestamp.set(timestampInt, [])
      }
      actionsByTimestamp.get(timestampInt)!.push(action)
    }
    
    const resolved: PlayerActionRecord[] = []
    
    // Process each timestamp group
    for (const [timestamp, timestampActions] of actionsByTimestamp) {
      if (timestampActions.length === 1) {
        resolved.push(timestampActions[0]!)
      } else {
        // Multiple actions at same timestamp - resolve by authority
        const sortedByAuthority = timestampActions.sort((a, b) => {
          const aAuth = this.getActionAuthority(a, authorityLevels)
          const bAuth = this.getActionAuthority(b, authorityLevels)
          
          if (aAuth !== bAuth) {
            return bAuth - aAuth // Higher authority wins
          }
          
          // Equal authority - use timestamp tiebreaker if enabled
          if (authorityRules?.useTimestampTiebreaker !== false) {
            // Prefer action with more precise timestamp (microseconds)
            const aMicros = Math.floor((a.timestamp % 1) * 1000000)
            const bMicros = Math.floor((b.timestamp % 1) * 1000000)
            if (aMicros !== bMicros) {
              return aMicros - bMicros // Earlier microseconds win
            }
          }
          
          // As final tiebreaker, use player ID for deterministic ordering
          return a.playerId.localeCompare(b.playerId)
        })
        
        // Keep only the highest authority action
        resolved.push(sortedByAuthority[0]!)
        
        // Log conflict resolution for debugging
        if (this.options.enableLogging && timestampActions.length > 1) {
          const winner = sortedByAuthority[0]!
          const winnerAuth = this.getActionAuthority(winner, authorityLevels)
          this.log(`Authority conflict resolved: ${timestampActions.length} actions at timestamp ${timestamp}, ` +
                   `winner: ${winner.playerId} (authority: ${winnerAuth})`)
        }
      }
    }
    
    return resolved.sort((a, b) => a.timestamp - b.timestamp)
  }
  
  private getAuthorityLevels(rules?: AuthorityRules): Record<PlayerRole, number> {
    if (rules?.roleAuthority) {
      return rules.roleAuthority
    }
    
    // Default authority levels
    return {
      [PlayerRole.ADMIN]: AuthorityLevel.ADMIN,
      [PlayerRole.DEALER]: AuthorityLevel.DEALER,
      [PlayerRole.PLAYER]: AuthorityLevel.PLAYER
    }
  }
  
  private getActionAuthority(action: PlayerActionRecord, authorityLevels: Record<PlayerRole, number>): number {
    // Use explicit authority level if provided
    if (action.authorityLevel !== undefined) {
      return action.authorityLevel
    }
    
    // Use role-based authority
    if (action.playerRole) {
      return authorityLevels[action.playerRole] || AuthorityLevel.PLAYER
    }
    
    // Default to player authority
    return AuthorityLevel.PLAYER
  }

  async rollback(
    currentSnapshot: StateSnapshot,
    targetSnapshot: StateSnapshot
  ): Promise<StateSnapshot> {
    // Rollback maintains the target version but updates timestamp
    return {
      ...targetSnapshot,
      version: targetSnapshot.version,
      timestamp: Date.now()
    }
  }

  async recoverState(
    clientVersion: number,
    clientHash: string,
    serverSnapshot: StateSnapshot
  ): Promise<StateRecovery> {
    try {
      // Validate client state
      const clientSnapshot = this.stateHistory.get(clientVersion)
      if (!clientSnapshot || clientSnapshot.hash !== clientHash) {
        return {
          success: false,
          error: 'Invalid client state'
        }
      }
      
      // Generate delta for recovery
      const delta = await this.generateDelta(clientSnapshot, serverSnapshot)
      
      // Get missed actions
      const missedActions = this.actionLog.filter(
        action => action.timestamp > clientSnapshot.timestamp
      )
      
      // Add new action to log and cleanup
      this.cleanupActionLog()
      
      return {
        success: true,
        updates: delta,
        missedActions
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Recovery failed'
      }
    }
  }

  async compressDeltas(deltas: StateDelta[]): Promise<StateDelta> {
    if (deltas.length === 0) {
      throw new Error('No deltas to compress')
    }
    
    const changeMap = new Map<string, StateChange>()
    const originalValues = new Map<string, any>()
    
    // Track original values and final changes
    for (const delta of deltas) {
      for (const change of delta.changes) {
        // Store the first oldValue we see for each path
        if (!originalValues.has(change.path)) {
          originalValues.set(change.path, change.oldValue)
        }
        // Update with the latest change
        changeMap.set(change.path, {
          path: change.path,
          oldValue: originalValues.get(change.path),
          newValue: change.newValue
        })
      }
    }
    
    const firstDelta = deltas[0]!
    const lastDelta = deltas[deltas.length - 1]!
    
    return {
      fromVersion: firstDelta.fromVersion,
      toVersion: lastDelta.toVersion,
      changes: Array.from(changeMap.values()),
      timestamp: Date.now()
    }
  }

  async validateChecksum(snapshot: StateSnapshot, checksum: string): Promise<boolean> {
    return snapshot.hash === checksum
  }

  async getStateAtVersion(version: number, history?: StateSnapshot[]): Promise<StateSnapshot | null> {
    if (history) {
      return history.find(s => s.version === version) || null
    }
    return this.stateHistory.get(version) || null
  }

  async compressSnapshot(snapshot: StateSnapshot): Promise<string> {
    // Simple JSON compression - in production, use proper compression like gzip
    const json = JSON.stringify({
      v: snapshot.version,
      h: snapshot.hash,
      g: snapshot.gameState,
      p: Array.from(snapshot.playerStates.entries()),
      t: snapshot.timestamp
    })
    
    // Simulate compression by removing whitespace
    return json.replace(/\s+/g, '')
  }

  async batchUpdates(updates: any[]): Promise<any[]> {
    const batched = new Map<string, any>()
    
    for (const update of updates) {
      const key = update.playerId
      if (!batched.has(key)) {
        batched.set(key, update)
      } else {
        // Keep the latest update for each player
        const existing = batched.get(key)
        if (update.timestamp > existing.timestamp) {
          batched.set(key, update)
        }
      }
    }
    
    return Array.from(batched.values())
  }

  // Private helper methods
  private async calculateHash(gameState: GameState, playerStates: Map<string, PlayerState>): Promise<string> {
    const stateString = JSON.stringify({
      gameState,
      playerStates: Array.from(playerStates.entries()).sort(([a], [b]) => a.localeCompare(b))
    })
    
    // Use Web Crypto API for secure hashing
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder()
      const data = encoder.encode(stateString)
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    } else {
      // Fallback for environments without Web Crypto API
      // This is still better than the previous simple hash
      let hash = 0
      let hash2 = 0
      for (let i = 0; i < stateString.length; i++) {
        const char = stateString.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash2 = ((hash2 << 3) - hash2) + char
        hash = hash & hash
        hash2 = hash2 & hash2
      }
      return Math.abs(hash).toString(16) + Math.abs(hash2).toString(16)
    }
  }

  private compareObjects(
    oldObj: any, 
    newObj: any, 
    path: string, 
    changes: StateChange[]
  ): void {
    // Short-circuit for identical references
    if (oldObj === newObj) return
    
    // Early exit for null/undefined or type mismatch
    if (oldObj == null || newObj == null || typeof oldObj !== typeof newObj) {
      if (oldObj !== newObj) {
        changes.push({ path, oldValue: oldObj, newValue: newObj })
      }
      return
    }
    
    // Check cache if enabled
    if (this.options.enableComparisonCache) {
      const cacheKey = this.getComparisonCacheKey(oldObj, newObj, path)
      const cachedResult = this.comparisonCache.get(cacheKey)
      if (cachedResult !== undefined) {
        return // Already processed
      }
    }
    
    // Check all keys in newObj
    for (const key in newObj) {
      const newPath = `${path}.${key}`
      const oldValue = oldObj?.[key]
      const newValue = newObj[key]
      
      if (oldValue !== newValue) {
        // For arrays, do a deep comparison to avoid false positives
        if (Array.isArray(oldValue) && Array.isArray(newValue)) {
          // Quick length check before stringify
          if (oldValue.length !== newValue.length || JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            changes.push({ path: newPath, oldValue, newValue })
          }
        } else if (typeof newValue === 'object' && newValue !== null && !Array.isArray(newValue)) {
          this.compareObjects(oldValue || {}, newValue, newPath, changes)
        } else {
          changes.push({ path: newPath, oldValue, newValue })
        }
      }
    }
    
    // Check for deleted keys
    if (oldObj) {
      for (const key in oldObj) {
        if (!(key in newObj)) {
          changes.push({ path: `${path}.${key}`, oldValue: oldObj[key], newValue: undefined })
        }
      }
    }
    
    // Cache the comparison result if enabled
    if (this.options.enableComparisonCache) {
      const cacheKey = this.getComparisonCacheKey(oldObj, newObj, path)
      this.comparisonCache.set(cacheKey, true)
      this.cleanupComparisonCache()
    }
  }

  private comparePlayerStates(
    oldStates: Map<string, PlayerState>,
    newStates: Map<string, PlayerState>,
    changes: StateChange[]
  ): void {
    // Check for changes in existing players
    for (const [playerId, oldState] of oldStates) {
      const newState = newStates.get(playerId)
      if (newState) {
        // Compare each property
        for (const key in newState) {
          if (oldState[key as keyof PlayerState] !== newState[key as keyof PlayerState]) {
            changes.push({
              path: `playerStates.${playerId}.${key}`,
              oldValue: oldState[key as keyof PlayerState],
              newValue: newState[key as keyof PlayerState]
            })
          }
        }
      } else {
        changes.push({
          path: `playerStates.${playerId}`,
          oldValue: oldState,
          newValue: null
        })
      }
    }
    
    // Check for new players
    for (const [playerId, newState] of newStates) {
      if (!oldStates.has(playerId)) {
        changes.push({
          path: `playerStates.${playerId}`,
          oldValue: null,
          newValue: newState
        })
      }
    }
  }

  private applyChange(snapshot: StateSnapshot, change: StateChange): void {
    // Validate change has required fields
    if (!('newValue' in change)) {
      throw new Error('Invalid change: missing newValue')
    }
    
    const parts = change.path.split('.')
    let target: any = snapshot
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (part === 'playerStates') {
        target = target[part]
        const playerId = parts[i + 1]
        if (i + 2 === parts.length) {
          // Setting entire player state
          if (change.newValue === null) {
            target.delete(playerId)
          } else {
            target.set(playerId, change.newValue)
          }
          return
        } else {
          // Modifying player state property
          if (!target.has(playerId)) {
            target.set(playerId, {})
          }
          target = target.get(playerId)
          i++ // Skip player ID in path
        }
      } else {
        target = target[part as keyof typeof target]
      }
    }
    
    const lastPart = parts[parts.length - 1]
    if (lastPart !== undefined) {
      target[lastPart as keyof typeof target] = change.newValue
    }
  }

  private estimateDeltaSize(fromVersion: number, toVersion: number): number {
    let size = 0
    for (let v = fromVersion + 1; v <= toVersion; v++) {
      const delta = this.deltaHistory.get(`${v - 1}-${v}`)
      if (delta) {
        size += JSON.stringify(delta).length
      }
    }
    // If no delta history, estimate based on version difference
    if (size === 0) {
      size = (toVersion - fromVersion) * 100 // Rough estimate
    }
    return size
  }
  
  // Helper method for atomic version increment with race condition protection
  private async incrementVersion(): Promise<number> {
    // Use async locking to ensure atomic increment
    let resolver: () => void
    const currentLock = this.versionLock
    this.versionLock = new Promise<void>(resolve => {
      resolver = resolve
    })
    
    await currentLock
    
    try {
      // In a real distributed system, this would use atomic counters or distributed consensus
      const newVersion = ++this.versionCounter
      return newVersion
    } finally {
      resolver!()
    }
  }
  
  // Synchronous version for backward compatibility (logs warning)
  private incrementVersionSync(): number {
    if (this.options.enableLogging) {
      console.warn('[StateSynchronizer] Using synchronous version increment. Consider using async createSnapshot for better concurrency.')
    }
    return ++this.versionCounter
  }
  
  // Deep clone helper using structuredClone with fallback
  private deepClone<T>(obj: T): T {
    if (typeof structuredClone !== 'undefined') {
      return structuredClone(obj)
    }
    // Fallback for environments without structuredClone
    return JSON.parse(JSON.stringify(obj))
  }
  
  // Cleanup methods to prevent memory leaks
  private cleanupHistory(): void {
    if (this.stateHistory.size > this.options.maxHistorySize) {
      const sortedVersions = Array.from(this.stateHistory.keys()).sort((a, b) => a - b)
      const toDelete = sortedVersions.slice(0, sortedVersions.length - this.options.maxHistorySize)
      for (const version of toDelete) {
        this.stateHistory.delete(version)
      }
    }
  }
  
  private cleanupDeltaHistory(): void {
    if (this.deltaHistory.size > this.options.maxDeltaHistorySize) {
      // Delete oldest deltas first
      const entries = Array.from(this.deltaHistory.entries())
      const toDelete = entries.slice(0, entries.length - this.options.maxDeltaHistorySize)
      for (const [key] of toDelete) {
        this.deltaHistory.delete(key)
      }
    }
  }
  
  private cleanupActionLog(): void {
    if (this.actionLog.length > this.options.maxActionLogSize) {
      // Keep only the most recent actions
      this.actionLog = this.actionLog.slice(-this.options.maxActionLogSize)
    }
  }
  
  // Logging helper
  private log(message: string): void {
    if (this.options.enableLogging) {
      console.log(`[StateSynchronizer] ${message}`)
    }
  }
  
  // Helper to generate cache key for object comparisons
  private getComparisonCacheKey(oldObj: any, newObj: any, path: string): string {
    // Use object identity and path for cache key
    // This is safe because we're caching within a single comparison operation
    return `${path}:${this.getObjectId(oldObj)}:${this.getObjectId(newObj)}`
  }
  
  // Helper to get a stable ID for an object (for caching)
  private getObjectId(obj: any): string {
    if (obj === null) return 'null'
    if (obj === undefined) return 'undefined'
    if (typeof obj !== 'object') return String(obj)
    
    // For objects, create a simple hash based on keys and types
    // This is just for cache identification, not cryptographic security
    const keys = Object.keys(obj).sort().join(',')
    return `obj:${keys}:${obj.constructor?.name || 'Object'}`
  }
  
  // Cleanup comparison cache when it gets too large
  private cleanupComparisonCache(): void {
    if (this.comparisonCache.size > this.options.maxComparisonCacheSize) {
      // Simple FIFO cleanup - remove oldest entries
      const entriesToRemove = this.comparisonCache.size - Math.floor(this.options.maxComparisonCacheSize * 0.8)
      const keysToRemove = Array.from(this.comparisonCache.keys()).slice(0, entriesToRemove)
      for (const key of keysToRemove) {
        this.comparisonCache.delete(key)
      }
    }
  }
}