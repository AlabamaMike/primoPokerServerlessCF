/**
 * Durable Object Migration and Versioning - Phase 2
 * 
 * Provides schema migration capabilities for Durable Objects to handle
 * state evolution over time.
 */

import { logger } from '@primo-poker/core'

export interface MigrationConfig {
  objectName: string
  currentVersion: number
  targetVersion: number
  migrations: Migration[]
}

export interface Migration {
  version: number
  description: string
  up: (state: any) => Promise<any>
  down?: (state: any) => Promise<any>
  validate?: (state: any) => Promise<boolean>
}

export interface MigrationResult {
  success: boolean
  fromVersion: number
  toVersion: number
  migrationsApplied: number
  error?: string
  duration: number
}

export interface VersionedState {
  version: number
  data: any
  lastMigration?: {
    fromVersion: number
    toVersion: number
    timestamp: number
    duration: number
  }
}

export class DurableObjectMigrator {
  private migrations: Map<string, Migration[]> = new Map()

  /**
   * Register migrations for a Durable Object type
   */
  registerMigrations(objectName: string, migrations: Migration[]): void {
    // Sort migrations by version
    const sorted = [...migrations].sort((a, b) => a.version - b.version)
    
    // Validate migration sequence
    for (let i = 0; i < sorted.length; i++) {
      const migration = sorted[i]
      if (!migration || migration.version !== i + 1) {
        throw new Error(`Migration versions must be sequential. Expected version ${i + 1}, got ${migration?.version || 'undefined'}`)
      }
    }

    this.migrations.set(objectName, sorted)
    logger.info(`Registered ${sorted.length} migrations for ${objectName}`)
  }

  /**
   * Get current version from state
   */
  async getCurrentVersion(state: DurableObjectState, objectName: string): Promise<number> {
    try {
      const versionInfo = await state.storage.get<VersionedState>('_version_info')
      return versionInfo?.version || 0
    } catch (error) {
      logger.error('Failed to get current version', error as Error)
      return 0
    }
  }

  /**
   * Migrate state to target version
   */
  async migrate(
    state: DurableObjectState,
    objectName: string,
    targetVersion?: number
  ): Promise<MigrationResult> {
    const startTime = Date.now()
    const migrations = this.migrations.get(objectName) || []
    
    if (migrations.length === 0) {
      return {
        success: true,
        fromVersion: 0,
        toVersion: 0,
        migrationsApplied: 0,
        duration: 0
      }
    }

    const currentVersion = await this.getCurrentVersion(state, objectName)
    const latestVersion = migrations.length
    const target = targetVersion ?? latestVersion

    if (target > latestVersion) {
      return {
        success: false,
        fromVersion: currentVersion,
        toVersion: target,
        migrationsApplied: 0,
        error: `Target version ${target} exceeds latest version ${latestVersion}`,
        duration: Date.now() - startTime
      }
    }

    if (currentVersion === target) {
      return {
        success: true,
        fromVersion: currentVersion,
        toVersion: target,
        migrationsApplied: 0,
        duration: Date.now() - startTime
      }
    }

    try {
      // Load current state
      let currentState = await this.loadState(state)
      let appliedCount = 0

      // Apply migrations
      if (currentVersion < target) {
        // Forward migration
        for (let i = currentVersion; i < target; i++) {
          const migration = migrations[i]
          if (!migration) {
            throw new Error(`Migration at index ${i} not found`)
          }
          logger.info(`Applying migration ${migration.version}: ${migration.description}`)
          
          currentState = await migration.up(currentState)
          appliedCount++
          
          // Validate if validator provided
          if (migration.validate) {
            const isValid = await migration.validate(currentState)
            if (!isValid) {
              throw new Error(`Migration ${migration.version} validation failed`)
            }
          }
        }
      } else {
        // Backward migration (if down migrations exist)
        for (let i = currentVersion - 1; i >= target; i--) {
          const migration = migrations[i]
          if (!migration) {
            throw new Error(`Migration at index ${i} not found`)
          }
          if (!migration.down) {
            throw new Error(`Migration ${migration.version} does not support rollback`)
          }
          
          logger.info(`Rolling back migration ${migration.version}: ${migration.description}`)
          currentState = await migration.down(currentState)
          appliedCount++
        }
      }

      // Save migrated state
      await this.saveState(state, currentState, target, {
        fromVersion: currentVersion,
        toVersion: target,
        timestamp: Date.now(),
        duration: Date.now() - startTime
      })

      logger.info(`Migration completed: v${currentVersion} -> v${target}`)

      return {
        success: true,
        fromVersion: currentVersion,
        toVersion: target,
        migrationsApplied: appliedCount,
        duration: Date.now() - startTime
      }
    } catch (error) {
      logger.error('Migration failed', error as Error)
      
      return {
        success: false,
        fromVersion: currentVersion,
        toVersion: target,
        migrationsApplied: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * Load state from storage
   */
  private async loadState(state: DurableObjectState): Promise<any> {
    const allData: Record<string, any> = {}
    
    // Get all keys except version info
    const keys = await state.storage.list()
    for (const [key, value] of keys) {
      if (key !== '_version_info') {
        allData[key] = value
      }
    }
    
    return allData
  }

  /**
   * Save state to storage with version info
   */
  private async saveState(
    state: DurableObjectState,
    data: any,
    version: number,
    migrationInfo?: any
  ): Promise<void> {
    const txn = state.storage.transaction(async () => {
      // Clear existing data
      await state.storage.deleteAll()
      
      // Save new data
      for (const [key, value] of Object.entries(data)) {
        await state.storage.put(key, value)
      }
      
      // Save version info
      const versionInfo: VersionedState = {
        version,
        data: {},
        lastMigration: migrationInfo
      }
      await state.storage.put('_version_info', versionInfo)
    })

    await txn
  }
}

// Global migrator instance
export const migrator = new DurableObjectMigrator()

/**
 * Example migrations for each Durable Object type
 */

// LobbyCoordinator migrations
export const lobbyCoordinatorMigrations: Migration[] = [
  {
    version: 1,
    description: 'Add table statistics tracking',
    up: async (state) => {
      // Add tableStats if it doesn't exist
      if (!state.tableStats) {
        state.tableStats = {}
      }
      return state
    }
  },
  {
    version: 2,
    description: 'Add seat reservations',
    up: async (state) => {
      // Add seatReservations if it doesn't exist
      if (!state.seatReservations) {
        state.seatReservations = {}
      }
      return state
    }
  }
]

// WalletManager migrations
export const walletManagerMigrations: Migration[] = [
  {
    version: 1,
    description: 'Add daily limits tracking',
    up: async (state) => {
      // Add dailyLimits if it doesn't exist
      if (!state.dailyLimits) {
        state.dailyLimits = {}
      }
      return state
    }
  },
  {
    version: 2,
    description: 'Add frozen amounts tracking',
    up: async (state) => {
      // Add frozenAmounts if it doesn't exist
      if (!state.frozenAmounts) {
        state.frozenAmounts = {}
      }
      // Migrate frozen field from wallets to separate tracking
      if (state.wallets) {
        for (const [playerId, wallet] of Object.entries(state.wallets as any)) {
          if ((wallet as any).frozen > 0) {
            state.frozenAmounts[playerId] = [{
              id: crypto.randomUUID(),
              playerId,
              amount: (wallet as any).frozen,
              tableId: 'legacy',
              frozenAt: Date.now(),
              reason: 'legacy_migration'
            }]
          }
        }
      }
      return state
    }
  },
  {
    version: 3,
    description: 'Add transaction metadata',
    up: async (state) => {
      // Add metadata field to existing transactions
      if (state.transactions) {
        for (const [playerId, transactions] of Object.entries(state.transactions as any)) {
          for (const transaction of transactions as any[]) {
            if (!transaction.metadata) {
              transaction.metadata = {}
            }
          }
        }
      }
      return state
    }
  }
]

// ChatModerator migrations  
export const chatModeratorMigrations: Migration[] = [
  {
    version: 1,
    description: 'Add channel configurations',
    up: async (state) => {
      // Add channelConfigs if it doesn't exist
      if (!state.channelConfigs) {
        state.channelConfigs = {}
      }
      return state
    }
  },
  {
    version: 2,
    description: 'Add moderation statistics',
    up: async (state) => {
      // Add moderationStats if it doesn't exist
      if (!state.moderationStats) {
        state.moderationStats = {
          messagesModerated: 0,
          warningsIssued: 0,
          usersMuted: 0,
          messagesDeleted: 0,
          reportsReceived: 0,
          falsePositives: 0
        }
      }
      return state
    }
  }
]

// Register all migrations
migrator.registerMigrations('LobbyCoordinator', lobbyCoordinatorMigrations)
migrator.registerMigrations('WalletManager', walletManagerMigrations)
migrator.registerMigrations('ChatModerator', chatModeratorMigrations)

/**
 * Helper to ensure Durable Object is at latest version
 */
export async function ensureLatestVersion(
  state: DurableObjectState,
  objectName: string
): Promise<MigrationResult> {
  return migrator.migrate(state, objectName)
}

/**
 * Helper to get migration status
 */
export async function getMigrationStatus(
  state: DurableObjectState,
  objectName: string
): Promise<{
  currentVersion: number
  latestVersion: number
  needsMigration: boolean
  lastMigration?: any
}> {
  const currentVersion = await migrator.getCurrentVersion(state, objectName)
  const migrations = migrator['migrations'].get(objectName) || []
  const latestVersion = migrations.length

  const versionInfo = await state.storage.get<VersionedState>('_version_info')

  return {
    currentVersion,
    latestVersion,
    needsMigration: currentVersion < latestVersion,
    lastMigration: versionInfo?.lastMigration
  }
}