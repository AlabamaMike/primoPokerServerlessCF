import { GameState } from '@primo-poker/shared'

export interface StateSnapshot {
  version: number
  hash: string
  gameState: GameState
  playerStates: Map<string, PlayerState>
  timestamp: number
}

export interface PlayerState {
  id: string
  username?: string
  chips: number
  currentBet: number
  hasActed: boolean
  isFolded?: boolean
  isAllIn?: boolean
  position?: { seat: number }
  cards?: any[]
}

export interface StateDelta {
  fromVersion: number
  toVersion: number
  changes: StateChange[]
  timestamp: number
}

export interface StateChange {
  path: string
  oldValue: any
  newValue: any
}

export interface SyncResult {
  type: 'delta' | 'snapshot'
  fromVersion?: number
  toVersion?: number
  changes?: StateChange[]
  snapshot?: StateSnapshot
}

export interface StateRecovery {
  success: boolean
  updates?: StateDelta
  missedActions?: PlayerActionRecord[]
  error?: string
}

export interface PlayerActionRecord {
  playerId: string
  action: string
  amount?: number
  timestamp: number
}

export interface StateConflict {
  type: 'duplicate_action' | 'out_of_turn' | 'invalid_state'
  actions: PlayerActionRecord[]
  resolution?: string
}

export enum ConflictResolutionStrategy {
  TIMESTAMP_FIRST = 'timestamp_first',
  SEQUENTIAL = 'sequential',
  AUTHORITY_BASED = 'authority_based'
}

export interface StateSyncOptions {
  maxDeltaSize?: number
  compressionEnabled?: boolean
  conflictStrategy?: ConflictResolutionStrategy
}