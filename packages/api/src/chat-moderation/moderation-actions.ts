export type ModerationActionType = 'WARNING' | 'MUTE' | 'SHADOW_BAN' | 'BAN'

export interface ModerationAction {
  id: string
  playerId: string
  type: ModerationActionType
  reason: string
  appliedBy: string
  appliedAt: number
  expiresAt?: number
  metadata?: Record<string, any>
}

export interface ModerationActionRequest {
  playerId: string
  type: ModerationActionType
  reason: string
  appliedBy: string
  duration?: number
  metadata?: Record<string, any>
}

export interface PlayerRestrictions {
  canSendMessages: boolean
  messagesVisibleToOthers: boolean
  canJoinTables: boolean
  muteExpiresAt?: number
}

export interface ModerationRepository {
  saveAction(action: ModerationAction): Promise<ModerationAction>
  getPlayerActions(playerId: string): Promise<ModerationAction[]>
  getActiveActions(playerId: string): Promise<ModerationAction[]>
  updateActionStatus(actionId: string, status: string): Promise<void>
}

export class ModerationActionsManager {
  private repository: ModerationRepository
  
  // Escalation thresholds
  private static readonly WARNING_THRESHOLD = 3
  private static readonly DEFAULT_MUTE_DURATION = 5 * 60 * 1000 // 5 minutes
  private static readonly REPEAT_MUTE_DURATION = 30 * 60 * 1000 // 30 minutes
  
  constructor(repository: ModerationRepository) {
    this.repository = repository
  }

  async applyAction(request: ModerationActionRequest): Promise<ModerationAction> {
    const action: ModerationAction = {
      id: this.generateActionId(),
      playerId: request.playerId,
      type: request.type,
      reason: request.reason,
      appliedBy: request.appliedBy,
      appliedAt: Date.now(),
      metadata: request.metadata
    }

    // Set expiration for time-based actions
    if (request.type === 'MUTE' && request.duration) {
      action.expiresAt = action.appliedAt + request.duration
    }

    // Save action to repository
    return await this.repository.saveAction(action)
  }

  async shouldEscalate(playerId: string): Promise<boolean> {
    const actions = await this.repository.getPlayerActions(playerId)
    
    // Don't escalate if already banned
    if (actions.some(a => a.type === 'BAN')) {
      return false
    }

    // Escalate after shadow ban
    if (actions.some(a => a.type === 'SHADOW_BAN')) {
      return true
    }

    // Escalate after mute
    if (actions.some(a => a.type === 'MUTE')) {
      return true
    }

    // Escalate after threshold warnings
    const warningCount = actions.filter(a => a.type === 'WARNING').length
    return warningCount >= ModerationActionsManager.WARNING_THRESHOLD
  }

  async getNextAction(playerId: string): Promise<ModerationActionType> {
    const actions = await this.repository.getPlayerActions(playerId)
    
    // Check current highest action
    if (actions.some(a => a.type === 'BAN')) {
      return 'BAN' // Already at highest level
    }
    
    if (actions.some(a => a.type === 'SHADOW_BAN')) {
      return 'BAN'
    }
    
    if (actions.some(a => a.type === 'MUTE')) {
      return 'SHADOW_BAN'
    }

    // Count warnings
    const warningCount = actions.filter(a => a.type === 'WARNING').length
    if (warningCount >= ModerationActionsManager.WARNING_THRESHOLD) {
      return 'MUTE'
    }

    return 'WARNING'
  }

  async isPlayerMuted(playerId: string): Promise<boolean> {
    const activeActions = await this.repository.getActiveActions(playerId)
    const now = Date.now()
    
    return activeActions.some(action => 
      action.type === 'MUTE' && 
      (!action.expiresAt || action.expiresAt > now)
    )
  }

  async isPlayerShadowBanned(playerId: string): Promise<boolean> {
    const activeActions = await this.repository.getActiveActions(playerId)
    return activeActions.some(action => action.type === 'SHADOW_BAN')
  }

  async isPlayerBanned(playerId: string): Promise<boolean> {
    const activeActions = await this.repository.getActiveActions(playerId)
    return activeActions.some(action => action.type === 'BAN')
  }

  async getPlayerRestrictions(playerId: string): Promise<PlayerRestrictions> {
    const activeActions = await this.repository.getActiveActions(playerId)
    const now = Date.now()
    
    const restrictions: PlayerRestrictions = {
      canSendMessages: true,
      messagesVisibleToOthers: true,
      canJoinTables: true,
    }

    for (const action of activeActions) {
      switch (action.type) {
        case 'MUTE':
          if (!action.expiresAt || action.expiresAt > now) {
            restrictions.canSendMessages = false
            restrictions.muteExpiresAt = action.expiresAt
          }
          break
          
        case 'SHADOW_BAN':
          restrictions.messagesVisibleToOthers = false
          break
          
        case 'BAN':
          restrictions.canSendMessages = false
          restrictions.messagesVisibleToOthers = false
          restrictions.canJoinTables = false
          break
      }
    }

    return restrictions
  }

  async getMuteDuration(playerId: string): Promise<number> {
    const actions = await this.repository.getPlayerActions(playerId)
    const previousMutes = actions.filter(a => a.type === 'MUTE').length
    
    return previousMutes > 0 
      ? ModerationActionsManager.REPEAT_MUTE_DURATION 
      : ModerationActionsManager.DEFAULT_MUTE_DURATION
  }

  async clearExpiredActions(playerId: string): Promise<void> {
    const actions = await this.repository.getActiveActions(playerId)
    const now = Date.now()
    
    for (const action of actions) {
      if (action.expiresAt && action.expiresAt <= now) {
        await this.repository.updateActionStatus(action.id, 'expired')
      }
    }
  }

  private generateActionId(): string {
    return `mod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}