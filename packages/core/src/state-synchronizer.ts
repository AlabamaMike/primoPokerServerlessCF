// Using any for GameState to avoid circular dependency issues
// In production, this would import from '@primo-poker/shared'
type GameState = any
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
  PlayerState
} from './state-snapshot'

export * from './state-snapshot'

export class StateSynchronizer {
  private versionCounter: number = 0
  private stateHistory: Map<number, StateSnapshot> = new Map()
  private deltaHistory: Map<string, StateDelta> = new Map()
  private actionLog: PlayerActionRecord[] = []

  async createSnapshot(
    gameState: GameState, 
    playerStates: Map<string, PlayerState>
  ): Promise<StateSnapshot> {
    this.versionCounter++
    
    // Deep copy player states to avoid reference issues
    const copiedPlayerStates = new Map<string, PlayerState>()
    for (const [playerId, state] of playerStates) {
      copiedPlayerStates.set(playerId, { ...state })
    }
    
    const snapshot: StateSnapshot = {
      version: this.versionCounter,
      hash: this.calculateHash(gameState, copiedPlayerStates),
      gameState: { ...gameState },
      playerStates: copiedPlayerStates,
      timestamp: Date.now()
    }
    
    this.stateHistory.set(snapshot.version, snapshot)
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
    if (versionDiff > 10 || (options?.maxDeltaSize && estimatedSize > options.maxDeltaSize)) {
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
    
    return delta
  }

  async applyDelta(snapshot: StateSnapshot, delta: StateDelta): Promise<StateSnapshot> {
    if (snapshot.version !== delta.fromVersion) {
      throw new Error(`Version mismatch: snapshot version ${snapshot.version} does not match delta fromVersion ${delta.fromVersion}`)
    }
    
    // Create a deep copy of the snapshot
    const newSnapshot: StateSnapshot = {
      version: delta.toVersion,
      hash: '',
      gameState: { ...snapshot.gameState },
      playerStates: new Map(snapshot.playerStates),
      timestamp: Date.now()
    }
    
    // Apply each change
    for (const change of delta.changes) {
      this.applyChange(newSnapshot, change)
    }
    
    // Recalculate hash
    newSnapshot.hash = this.calculateHash(newSnapshot.gameState, newSnapshot.playerStates)
    
    return newSnapshot
  }

  async validateState(snapshot: StateSnapshot): Promise<boolean> {
    try {
      // Basic structure validation
      if (!snapshot.version || !snapshot.hash || !snapshot.gameState || !snapshot.timestamp) {
        return false
      }
      
      // Validate game state properties
      if (snapshot.gameState.pot < 0) {
        return false
      }
      
      // Validate player states
      if (!(snapshot.playerStates instanceof Map)) {
        return false
      }
      
      for (const [playerId, playerState] of snapshot.playerStates) {
        if (!playerState.id || playerState.chips < 0) {
          return false
        }
      }
      
      // Verify hash integrity
      const calculatedHash = this.calculateHash(snapshot.gameState, snapshot.playerStates)
      return calculatedHash === snapshot.hash
    } catch (error) {
      return false
    }
  }

  async detectConflicts(
    actions: PlayerActionRecord[], 
    currentSnapshot?: StateSnapshot
  ): Promise<StateConflict[]> {
    const conflicts: StateConflict[] = []
    const actionsByPlayer = new Map<string, PlayerActionRecord[]>()
    
    // Group actions by player
    for (const action of actions) {
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
            actions: actions
          })
        }
      }
    }
    
    // Check for out-of-turn actions if snapshot provided
    if (currentSnapshot?.gameState.activePlayerId) {
      const outOfTurn = actions.filter(
        action => action.playerId !== currentSnapshot.gameState.activePlayerId
      )
      
      for (const action of outOfTurn) {
        conflicts.push({
          type: 'out_of_turn',
          actions: [action]
        })
      }
    }
    
    return conflicts
  }

  async resolveConflicts(
    actions: PlayerActionRecord[],
    strategy: ConflictResolutionStrategy
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
        // In a real implementation, this would check player authority/roles
        return actions
        
      default:
        return actions
    }
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
  private calculateHash(gameState: GameState, playerStates: Map<string, PlayerState>): string {
    const stateString = JSON.stringify({
      gameState,
      playerStates: Array.from(playerStates.entries()).sort(([a], [b]) => a.localeCompare(b))
    })
    // Simple hash function for now - in production, use crypto
    let hash = 0
    for (let i = 0; i < stateString.length; i++) {
      const char = stateString.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16)
  }

  private compareObjects(
    oldObj: any, 
    newObj: any, 
    path: string, 
    changes: StateChange[]
  ): void {
    for (const key in newObj) {
      const newPath = `${path}.${key}`
      const oldValue = oldObj[key]
      const newValue = newObj[key]
      
      if (oldValue !== newValue) {
        if (typeof newValue === 'object' && newValue !== null && !Array.isArray(newValue)) {
          this.compareObjects(oldValue || {}, newValue, newPath, changes)
        } else {
          changes.push({ path: newPath, oldValue, newValue })
        }
      }
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
}