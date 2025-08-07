import { ReportSystem, MessageReport, ReportStatus } from '../chat-moderation/report-system'
import { ModerationActionsManager } from '../chat-moderation/moderation-actions'

describe('ReportSystem', () => {
  let reportSystem: ReportSystem
  let mockRepository: any
  let mockActionsManager: jest.Mocked<ModerationActionsManager>

  beforeEach(() => {
    mockRepository = {
      saveReport: jest.fn(),
      getReport: jest.fn(),
      getReportsByMessage: jest.fn(),
      getReportsByPlayer: jest.fn(),
      getReportsByReporter: jest.fn(),
      updateReportStatus: jest.fn(),
      getReportsCount: jest.fn(),
    }

    mockActionsManager = {
      applyAction: jest.fn(),
      getNextAction: jest.fn(),
      shouldEscalate: jest.fn(),
    } as any

    reportSystem = new ReportSystem(mockRepository, mockActionsManager, {
      autoActionThreshold: 3,
      reviewRequiredThreshold: 2,
      falseReportPenaltyThreshold: 5,
      reportCooldownMs: 60000, // 1 minute
    })
  })

  describe('submitReport', () => {
    it('should create a new report', async () => {
      const report: MessageReport = {
        id: '123',
        messageId: 'msg123',
        playerId: 'player1',
        reportedBy: 'player2',
        reason: 'Offensive language',
        reportedAt: Date.now(),
        status: 'PENDING',
        metadata: {
          messageContent: 'offensive text',
          channelId: 'table123',
        }
      }

      mockRepository.saveReport.mockResolvedValue(report)
      mockRepository.getReportsByMessage.mockResolvedValue([])
      mockRepository.getReportsCount.mockResolvedValue(0)

      const result = await reportSystem.submitReport({
        messageId: 'msg123',
        playerId: 'player1',
        reportedBy: 'player2',
        reason: 'Offensive language',
        metadata: {
          messageContent: 'offensive text',
          channelId: 'table123',
        }
      })

      expect(result).toEqual(report)
      expect(mockRepository.saveReport).toHaveBeenCalled()
    })

    it('should prevent duplicate reports from same user', async () => {
      const existingReport = {
        reportedBy: 'player2',
        status: 'PENDING',
      }

      mockRepository.getReportsByMessage.mockResolvedValue([existingReport])

      await expect(reportSystem.submitReport({
        messageId: 'msg123',
        playerId: 'player1',
        reportedBy: 'player2',
        reason: 'Offensive language',
      })).rejects.toThrow('You have already reported this message')
    })

    it('should enforce report cooldown', async () => {
      mockRepository.getReportsByMessage.mockResolvedValue([])
      mockRepository.getReportsCount.mockResolvedValue(1)
      mockRepository.getReportsByReporter.mockResolvedValue([{
        reportedAt: Date.now() - 30000, // 30 seconds ago
      }])

      await expect(reportSystem.submitReport({
        messageId: 'msg124',
        playerId: 'player1',
        reportedBy: 'player2',
        reason: 'Spam',
      })).rejects.toThrow('Please wait before submitting another report')
    })

    it('should trigger auto-action at threshold', async () => {
      const existingReports = [
        { reportedBy: 'player3', status: 'PENDING' },
        { reportedBy: 'player4', status: 'PENDING' },
      ]

      mockRepository.getReportsByMessage.mockResolvedValue(existingReports)
      mockRepository.saveReport.mockResolvedValue({
        id: '123',
        messageId: 'msg123',
        playerId: 'player1',
        reportedBy: 'player2',
        reason: 'Offensive language',
        reportedAt: Date.now(),
        status: 'PENDING',
      })
      mockRepository.getReportsCount.mockResolvedValue(0)
      mockActionsManager.getNextAction.mockResolvedValue('WARNING')

      await reportSystem.submitReport({
        messageId: 'msg123',
        playerId: 'player1',
        reportedBy: 'player2',
        reason: 'Offensive language',
      })

      expect(mockActionsManager.applyAction).toHaveBeenCalledWith({
        playerId: 'player1',
        type: 'WARNING',
        reason: 'Auto-moderation: Message reported 3 times',
        appliedBy: 'system',
        metadata: { 
          messageId: 'msg123',
          reportCount: 3,
        }
      })
    })
  })

  describe('processReport', () => {
    it('should approve report and apply action', async () => {
      const report = {
        id: '123',
        playerId: 'player1',
        status: 'PENDING',
      }

      mockRepository.getReport.mockResolvedValue(report)
      mockActionsManager.getNextAction.mockResolvedValue('MUTE')

      await reportSystem.processReport({
        reportId: '123',
        decision: 'APPROVED',
        reviewedBy: 'moderator1',
        actionType: 'MUTE',
        notes: 'Clear violation',
      })

      expect(mockRepository.updateReportStatus).toHaveBeenCalledWith(
        '123',
        'APPROVED',
        expect.objectContaining({
          reviewedBy: 'moderator1',
          reviewedAt: expect.any(Number),
          actionTaken: 'MUTE',
          notes: 'Clear violation',
        })
      )

      expect(mockActionsManager.applyAction).toHaveBeenCalledWith({
        playerId: 'player1',
        type: 'MUTE',
        reason: 'Report approved: Clear violation',
        appliedBy: 'moderator1',
        metadata: { reportId: '123' }
      })
    })

    it('should reject report without action', async () => {
      const report = {
        id: '123',
        playerId: 'player1',
        reportedBy: 'player3',
        status: 'PENDING',
      }

      mockRepository.getReport.mockResolvedValue(report)
      mockRepository.getReportsByReporter.mockResolvedValue([])

      await reportSystem.processReport({
        reportId: '123',
        decision: 'REJECTED',
        reviewedBy: 'moderator1',
        notes: 'Not a violation',
      })

      expect(mockRepository.updateReportStatus).toHaveBeenCalledWith(
        '123',
        'REJECTED',
        expect.objectContaining({
          reviewedBy: 'moderator1',
          reviewedAt: expect.any(Number),
          notes: 'Not a violation',
        })
      )

      expect(mockActionsManager.applyAction).not.toHaveBeenCalled()
    })

    it('should not process already reviewed report', async () => {
      const report = {
        id: '123',
        status: 'APPROVED',
      }

      mockRepository.getReport.mockResolvedValue(report)

      await expect(reportSystem.processReport({
        reportId: '123',
        decision: 'APPROVED',
        reviewedBy: 'moderator1',
      })).rejects.toThrow('Report has already been processed')
    })
  })

  describe('checkReportThresholds', () => {
    it('should trigger review at review threshold', async () => {
      const reports = [
        { status: 'PENDING' },
        { status: 'PENDING' },
      ]

      const result = await reportSystem.checkReportThresholds('msg123', reports)

      expect(result.requiresReview).toBe(true)
      expect(result.requiresAutoAction).toBe(false)
      expect(result.reportCount).toBe(2)
    })

    it('should trigger auto-action at action threshold', async () => {
      const reports = [
        { status: 'PENDING' },
        { status: 'PENDING' },
        { status: 'PENDING' },
      ]

      const result = await reportSystem.checkReportThresholds('msg123', reports)

      expect(result.requiresReview).toBe(true)
      expect(result.requiresAutoAction).toBe(true)
      expect(result.reportCount).toBe(3)
    })

    it('should not count processed reports', async () => {
      const reports = [
        { status: 'PENDING' },
        { status: 'APPROVED' },
        { status: 'REJECTED' },
      ]

      const result = await reportSystem.checkReportThresholds('msg123', reports)

      expect(result.requiresReview).toBe(false)
      expect(result.requiresAutoAction).toBe(false)
      expect(result.reportCount).toBe(1)
    })
  })

  describe('getReportStats', () => {
    it('should calculate report statistics for a player', async () => {
      const reports = [
        { status: 'APPROVED' as ReportStatus },
        { status: 'APPROVED' as ReportStatus },
        { status: 'REJECTED' as ReportStatus },
        { status: 'PENDING' as ReportStatus },
      ]

      mockRepository.getReportsByPlayer.mockResolvedValue(reports)

      const stats = await reportSystem.getReportStats('player1')

      expect(stats).toEqual({
        totalReports: 4,
        approvedReports: 2,
        rejectedReports: 1,
        pendingReports: 1,
        approvalRate: 0.5,
      })
    })

    it('should handle player with no reports', async () => {
      mockRepository.getReportsByPlayer.mockResolvedValue([])

      const stats = await reportSystem.getReportStats('player1')

      expect(stats).toEqual({
        totalReports: 0,
        approvedReports: 0,
        rejectedReports: 0,
        pendingReports: 0,
        approvalRate: 0,
      })
    })
  })

  describe('getFalseReportCount', () => {
    it('should count rejected reports by reporter', async () => {
      const reports = [
        { status: 'REJECTED' as ReportStatus },
        { status: 'REJECTED' as ReportStatus },
        { status: 'APPROVED' as ReportStatus },
        { status: 'PENDING' as ReportStatus },
      ]

      mockRepository.getReportsByReporter.mockResolvedValue(reports)

      const count = await reportSystem.getFalseReportCount('player2')

      expect(count).toBe(2)
    })
  })

  describe('shouldPenalizeFalseReporter', () => {
    it('should penalize reporter with too many false reports', async () => {
      const reports = [
        { status: 'REJECTED' as ReportStatus },
        { status: 'REJECTED' as ReportStatus },
        { status: 'REJECTED' as ReportStatus },
        { status: 'REJECTED' as ReportStatus },
        { status: 'REJECTED' as ReportStatus },
      ]

      mockRepository.getReportsByReporter.mockResolvedValue(reports)

      const shouldPenalize = await reportSystem.shouldPenalizeFalseReporter('player2')

      expect(shouldPenalize).toBe(true)
    })

    it('should not penalize reporter with few false reports', async () => {
      const reports = [
        { status: 'REJECTED' as ReportStatus },
        { status: 'APPROVED' as ReportStatus },
      ]

      mockRepository.getReportsByReporter.mockResolvedValue(reports)

      const shouldPenalize = await reportSystem.shouldPenalizeFalseReporter('player2')

      expect(shouldPenalize).toBe(false)
    })
  })
})