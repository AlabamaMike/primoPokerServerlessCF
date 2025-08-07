import { ModerationAction, ModerationActionType, ModerationActionsManager, ModerationConfig } from '../chat-moderation/moderation-actions'

describe('ModerationActionsManager', () => {
  let manager: ModerationActionsManager
  let mockRepository: any

  beforeEach(() => {
    mockRepository = {
      saveAction: jest.fn(),
      getPlayerActions: jest.fn(),
      getActiveActions: jest.fn(),
      updateActionStatus: jest.fn(),
    }
    
    const config: ModerationConfig = {
      warningThreshold: 3,
      defaultMuteDuration: 5 * 60 * 1000,
      repeatMuteDuration: 30 * 60 * 1000,
    }
    
    manager = new ModerationActionsManager(mockRepository, config)
  })

  describe('applyAction', () => {
    it('should apply a warning action', async () => {
      const action: ModerationAction = {
        id: '123',
        playerId: 'player1',
        type: 'WARNING',
        reason: 'Profanity',
        appliedBy: 'system',
        appliedAt: Date.now(),
        expiresAt: undefined,
        metadata: { severity: 'LOW' }
      }

      mockRepository.getPlayerActions.mockResolvedValue([])
      mockRepository.saveAction.mockResolvedValue(action)

      const result = await manager.applyAction({
        playerId: 'player1',
        type: 'WARNING',
        reason: 'Profanity',
        appliedBy: 'system',
        metadata: { severity: 'LOW' }
      })

      expect(result).toEqual(action)
      expect(mockRepository.saveAction).toHaveBeenCalled()
    })

    it('should apply a mute action with duration', async () => {
      const now = Date.now()
      const duration = 5 * 60 * 1000 // 5 minutes
      const action: ModerationAction = {
        id: '124',
        playerId: 'player1',
        type: 'MUTE',
        reason: 'Spam',
        appliedBy: 'moderator1',
        appliedAt: now,
        expiresAt: now + duration,
        metadata: { duration }
      }

      mockRepository.getPlayerActions.mockResolvedValue([])
      mockRepository.saveAction.mockResolvedValue(action)

      const result = await manager.applyAction({
        playerId: 'player1',
        type: 'MUTE',
        reason: 'Spam',
        appliedBy: 'moderator1',
        duration,
        metadata: { duration }
      })

      expect(result.expiresAt).toBe(now + duration)
      expect(mockRepository.saveAction).toHaveBeenCalled()
    })

    it('should apply shadow ban action', async () => {
      const action: ModerationAction = {
        id: '125',
        playerId: 'player1',
        type: 'SHADOW_BAN',
        reason: 'Repeated violations',
        appliedBy: 'admin',
        appliedAt: Date.now(),
        expiresAt: undefined,
        metadata: {}
      }

      mockRepository.getPlayerActions.mockResolvedValue([])
      mockRepository.saveAction.mockResolvedValue(action)

      const result = await manager.applyAction({
        playerId: 'player1',
        type: 'SHADOW_BAN',
        reason: 'Repeated violations',
        appliedBy: 'admin'
      })

      expect(result.type).toBe('SHADOW_BAN')
      expect(mockRepository.saveAction).toHaveBeenCalled()
    })

    it('should apply ban action', async () => {
      const action: ModerationAction = {
        id: '126',
        playerId: 'player1',
        type: 'BAN',
        reason: 'Severe violation',
        appliedBy: 'admin',
        appliedAt: Date.now(),
        expiresAt: undefined,
        metadata: { permanent: true }
      }

      mockRepository.getPlayerActions.mockResolvedValue([])
      mockRepository.saveAction.mockResolvedValue(action)

      const result = await manager.applyAction({
        playerId: 'player1',
        type: 'BAN',
        reason: 'Severe violation',
        appliedBy: 'admin',
        metadata: { permanent: true }
      })

      expect(result.type).toBe('BAN')
      expect(result.metadata?.permanent).toBe(true)
    })
  })

  describe('shouldEscalate', () => {
    it('should escalate after 3 warnings', async () => {
      const warnings = [
        { type: 'WARNING' as ModerationActionType, appliedAt: Date.now() - 3600000 },
        { type: 'WARNING' as ModerationActionType, appliedAt: Date.now() - 1800000 },
        { type: 'WARNING' as ModerationActionType, appliedAt: Date.now() - 900000 },
      ]
      
      mockRepository.getPlayerActions.mockResolvedValue(warnings)

      const shouldEscalate = await manager.shouldEscalate('player1')
      expect(shouldEscalate).toBe(true)
    })

    it('should not escalate with fewer than 3 warnings', async () => {
      const warnings = [
        { type: 'WARNING' as ModerationActionType, appliedAt: Date.now() - 3600000 },
        { type: 'WARNING' as ModerationActionType, appliedAt: Date.now() - 1800000 },
      ]
      
      mockRepository.getPlayerActions.mockResolvedValue(warnings)

      const shouldEscalate = await manager.shouldEscalate('player1')
      expect(shouldEscalate).toBe(false)
    })

    it('should escalate after a mute', async () => {
      const actions = [
        { type: 'WARNING' as ModerationActionType, appliedAt: Date.now() - 3600000 },
        { type: 'MUTE' as ModerationActionType, appliedAt: Date.now() - 1800000 },
      ]
      
      mockRepository.getPlayerActions.mockResolvedValue(actions)

      const shouldEscalate = await manager.shouldEscalate('player1')
      expect(shouldEscalate).toBe(true)
    })

    it('should not escalate if already banned', async () => {
      const actions = [
        { type: 'BAN' as ModerationActionType, appliedAt: Date.now() - 1800000 },
      ]
      
      mockRepository.getPlayerActions.mockResolvedValue(actions)

      const shouldEscalate = await manager.shouldEscalate('player1')
      expect(shouldEscalate).toBe(false)
    })
  })

  describe('getNextAction', () => {
    it('should return WARNING for first offense', async () => {
      mockRepository.getPlayerActions.mockResolvedValue([])

      const nextAction = await manager.getNextAction('player1')
      expect(nextAction).toBe('WARNING')
    })

    it('should return MUTE after warnings', async () => {
      const warnings = [
        { type: 'WARNING' as ModerationActionType, appliedAt: Date.now() - 3600000 },
        { type: 'WARNING' as ModerationActionType, appliedAt: Date.now() - 1800000 },
        { type: 'WARNING' as ModerationActionType, appliedAt: Date.now() - 900000 },
      ]
      
      mockRepository.getPlayerActions.mockResolvedValue(warnings)

      const nextAction = await manager.getNextAction('player1')
      expect(nextAction).toBe('MUTE')
    })

    it('should return SHADOW_BAN after mute', async () => {
      const actions = [
        { type: 'WARNING' as ModerationActionType, appliedAt: Date.now() - 3600000 },
        { type: 'MUTE' as ModerationActionType, appliedAt: Date.now() - 1800000 },
      ]
      
      mockRepository.getPlayerActions.mockResolvedValue(actions)

      const nextAction = await manager.getNextAction('player1')
      expect(nextAction).toBe('SHADOW_BAN')
    })

    it('should return BAN after shadow ban', async () => {
      const actions = [
        { type: 'WARNING' as ModerationActionType, appliedAt: Date.now() - 3600000 },
        { type: 'MUTE' as ModerationActionType, appliedAt: Date.now() - 2700000 },
        { type: 'SHADOW_BAN' as ModerationActionType, appliedAt: Date.now() - 1800000 },
      ]
      
      mockRepository.getPlayerActions.mockResolvedValue(actions)

      const nextAction = await manager.getNextAction('player1')
      expect(nextAction).toBe('BAN')
    })
  })

  describe('isPlayerMuted', () => {
    it('should return true if player has active mute', async () => {
      const activeMute = {
        type: 'MUTE' as ModerationActionType,
        expiresAt: Date.now() + 60000, // expires in 1 minute
      }
      
      mockRepository.getActiveActions.mockResolvedValue([activeMute])

      const isMuted = await manager.isPlayerMuted('player1')
      expect(isMuted).toBe(true)
    })

    it('should return false if mute expired', async () => {
      const expiredMute = {
        type: 'MUTE' as ModerationActionType,
        expiresAt: Date.now() - 60000, // expired 1 minute ago
      }
      
      mockRepository.getActiveActions.mockResolvedValue([expiredMute])

      const isMuted = await manager.isPlayerMuted('player1')
      expect(isMuted).toBe(false)
    })

    it('should return false if no mute actions', async () => {
      mockRepository.getActiveActions.mockResolvedValue([])

      const isMuted = await manager.isPlayerMuted('player1')
      expect(isMuted).toBe(false)
    })
  })

  describe('isPlayerShadowBanned', () => {
    it('should return true if player has shadow ban', async () => {
      const shadowBan = {
        type: 'SHADOW_BAN' as ModerationActionType,
      }
      
      mockRepository.getActiveActions.mockResolvedValue([shadowBan])

      const isShadowBanned = await manager.isPlayerShadowBanned('player1')
      expect(isShadowBanned).toBe(true)
    })

    it('should return false if no shadow ban', async () => {
      mockRepository.getActiveActions.mockResolvedValue([])

      const isShadowBanned = await manager.isPlayerShadowBanned('player1')
      expect(isShadowBanned).toBe(false)
    })
  })

  describe('isPlayerBanned', () => {
    it('should return true if player has ban', async () => {
      const ban = {
        type: 'BAN' as ModerationActionType,
      }
      
      mockRepository.getActiveActions.mockResolvedValue([ban])

      const isBanned = await manager.isPlayerBanned('player1')
      expect(isBanned).toBe(true)
    })

    it('should return false if no ban', async () => {
      mockRepository.getActiveActions.mockResolvedValue([])

      const isBanned = await manager.isPlayerBanned('player1')
      expect(isBanned).toBe(false)
    })
  })

  describe('getPlayerRestrictions', () => {
    it('should return all active restrictions', async () => {
      const actions = [
        { type: 'MUTE' as ModerationActionType, expiresAt: Date.now() + 60000 },
        { type: 'SHADOW_BAN' as ModerationActionType },
      ]
      
      mockRepository.getActiveActions.mockResolvedValue(actions)

      const restrictions = await manager.getPlayerRestrictions('player1')
      
      expect(restrictions.canSendMessages).toBe(false)
      expect(restrictions.messagesVisibleToOthers).toBe(false)
      expect(restrictions.canJoinTables).toBe(true)
      expect(restrictions.muteExpiresAt).toBeDefined()
    })

    it('should return no restrictions for clean player', async () => {
      mockRepository.getActiveActions.mockResolvedValue([])

      const restrictions = await manager.getPlayerRestrictions('player1')
      
      expect(restrictions.canSendMessages).toBe(true)
      expect(restrictions.messagesVisibleToOthers).toBe(true)
      expect(restrictions.canJoinTables).toBe(true)
      expect(restrictions.muteExpiresAt).toBeUndefined()
    })

    it('should prevent joining tables if banned', async () => {
      const actions = [
        { type: 'BAN' as ModerationActionType },
      ]
      
      mockRepository.getActiveActions.mockResolvedValue(actions)

      const restrictions = await manager.getPlayerRestrictions('player1')
      
      expect(restrictions.canSendMessages).toBe(false)
      expect(restrictions.messagesVisibleToOthers).toBe(false)
      expect(restrictions.canJoinTables).toBe(false)
    })
  })
})