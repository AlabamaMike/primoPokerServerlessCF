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
  role?: PlayerRole
  isDealer?: boolean
}

export enum PlayerRole {
  ADMIN = 'admin',
  DEALER = 'dealer',
  PLAYER = 'player'
}

export enum AuthorityLevel {
  ADMIN = 3,
  DEALER = 2,
  PLAYER = 1
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
  playerRole?: PlayerRole
  authorityLevel?: number
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
  authorityRules?: AuthorityRules
}

export interface AuthorityRules {
  // Allow customizing authority levels for different roles
  roleAuthority?: Record<PlayerRole, number>
  // Whether to use timestamp as tiebreaker when authority is equal
  useTimestampTiebreaker?: boolean
  // Custom authority resolver function
  customResolver?: (action1: PlayerActionRecord, action2: PlayerActionRecord) => PlayerActionRecord
}