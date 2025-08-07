import { ModerationActionsManager, ModerationActionType } from './moderation-actions'

export type ReportStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO_ACTIONED'

export interface MessageReport {
  id: string
  messageId: string
  playerId: string // The player who sent the reported message
  reportedBy: string // The player who submitted the report
  reason: string
  reportedAt: number
  status: ReportStatus
  reviewedBy?: string
  reviewedAt?: number
  actionTaken?: ModerationActionType
  notes?: string
  metadata?: Record<string, any>
}

export interface ReportRequest {
  messageId: string
  playerId: string
  reportedBy: string
  reason: string
  metadata?: Record<string, any>
}

export interface ReportDecision {
  reportId: string
  decision: 'APPROVED' | 'REJECTED'
  reviewedBy: string
  actionType?: ModerationActionType
  notes?: string
}

export interface ReportStats {
  totalReports: number
  approvedReports: number
  rejectedReports: number
  pendingReports: number
  approvalRate: number
}

export interface ReportThresholds {
  requiresReview: boolean
  requiresAutoAction: boolean
  reportCount: number
}

export interface ReportSystemConfig {
  autoActionThreshold: number
  reviewRequiredThreshold: number
  falseReportPenaltyThreshold: number
  reportCooldownMs: number
}

export interface ReportRepository {
  saveReport(report: MessageReport): Promise<MessageReport>
  getReport(reportId: string): Promise<MessageReport | null>
  getReportsByMessage(messageId: string): Promise<MessageReport[]>
  getReportsByPlayer(playerId: string): Promise<MessageReport[]>
  getReportsByReporter(reporterId: string): Promise<MessageReport[]>
  updateReportStatus(reportId: string, status: ReportStatus, metadata?: any): Promise<void>
  getReportsCount(reporterId: string, since: number): Promise<number>
}

export class ReportSystem {
  private repository: ReportRepository
  private actionsManager: ModerationActionsManager
  private config: ReportSystemConfig

  constructor(
    repository: ReportRepository,
    actionsManager: ModerationActionsManager,
    config: ReportSystemConfig
  ) {
    this.repository = repository
    this.actionsManager = actionsManager
    this.config = config
  }

  async submitReport(request: ReportRequest): Promise<MessageReport> {
    // Check for duplicate reports from same user
    const existingReports = await this.repository.getReportsByMessage(request.messageId)
    const duplicateReport = existingReports.find(r => 
      r.reportedBy === request.reportedBy && r.status === 'PENDING'
    )
    
    if (duplicateReport) {
      throw new Error('You have already reported this message')
    }

    // Check report cooldown
    const recentReportCount = await this.repository.getReportsCount(
      request.reportedBy,
      Date.now() - this.config.reportCooldownMs
    )
    
    if (recentReportCount > 0) {
      throw new Error('Please wait before submitting another report')
    }

    // Create the report
    const report: MessageReport = {
      id: this.generateReportId(),
      messageId: request.messageId,
      playerId: request.playerId,
      reportedBy: request.reportedBy,
      reason: request.reason,
      reportedAt: Date.now(),
      status: 'PENDING',
      metadata: request.metadata
    }

    // Save the report
    const savedReport = await this.repository.saveReport(report)

    // Check thresholds for auto-action
    const allReports = [...existingReports, savedReport]
    const thresholds = await this.checkReportThresholds(request.messageId, allReports)
    
    if (thresholds.requiresAutoAction) {
      await this.applyAutoAction(request.playerId, request.messageId, thresholds.reportCount)
      await this.repository.updateReportStatus(savedReport.id, 'AUTO_ACTIONED')
    }

    return savedReport
  }

  async processReport(decision: ReportDecision): Promise<void> {
    const report = await this.repository.getReport(decision.reportId)
    
    if (!report) {
      throw new Error('Report not found')
    }

    if (report.status !== 'PENDING') {
      throw new Error('Report has already been processed')
    }

    const metadata = {
      reviewedBy: decision.reviewedBy,
      reviewedAt: Date.now(),
      actionTaken: decision.actionType,
      notes: decision.notes
    }

    // Update report status
    await this.repository.updateReportStatus(
      decision.reportId,
      decision.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
      metadata
    )

    // Apply moderation action if approved
    if (decision.decision === 'APPROVED' && decision.actionType) {
      await this.actionsManager.applyAction({
        playerId: report.playerId,
        type: decision.actionType,
        reason: `Report approved: ${decision.notes || report.reason}`,
        appliedBy: decision.reviewedBy,
        metadata: { reportId: report.id }
      })
    }

    // Check if reporter should be penalized for false reports
    if (decision.decision === 'REJECTED') {
      const shouldPenalize = await this.shouldPenalizeFalseReporter(report.reportedBy)
      if (shouldPenalize) {
        await this.actionsManager.applyAction({
          playerId: report.reportedBy,
          type: 'WARNING',
          reason: 'Excessive false reporting',
          appliedBy: 'system',
          metadata: { falseReportCount: await this.getFalseReportCount(report.reportedBy) }
        })
      }
    }
  }

  async checkReportThresholds(messageId: string, reports: MessageReport[]): Promise<ReportThresholds> {
    const pendingReports = reports.filter(r => r.status === 'PENDING')
    const reportCount = pendingReports.length

    return {
      requiresReview: reportCount >= this.config.reviewRequiredThreshold,
      requiresAutoAction: reportCount >= this.config.autoActionThreshold,
      reportCount
    }
  }

  async getReportStats(playerId: string): Promise<ReportStats> {
    const reports = await this.repository.getReportsByPlayer(playerId)
    
    const stats: ReportStats = {
      totalReports: reports.length,
      approvedReports: reports.filter(r => r.status === 'APPROVED').length,
      rejectedReports: reports.filter(r => r.status === 'REJECTED').length,
      pendingReports: reports.filter(r => r.status === 'PENDING').length,
      approvalRate: 0
    }

    if (stats.totalReports > 0) {
      stats.approvalRate = stats.approvedReports / stats.totalReports
    }

    return stats
  }

  async getFalseReportCount(reporterId: string): Promise<number> {
    const reports = await this.repository.getReportsByReporter(reporterId)
    return reports.filter(r => r.status === 'REJECTED').length
  }

  async shouldPenalizeFalseReporter(reporterId: string): Promise<boolean> {
    const falseReportCount = await this.getFalseReportCount(reporterId)
    return falseReportCount >= this.config.falseReportPenaltyThreshold
  }

  private async applyAutoAction(
    playerId: string,
    messageId: string,
    reportCount: number
  ): Promise<void> {
    const nextAction = await this.actionsManager.getNextAction(playerId)
    
    await this.actionsManager.applyAction({
      playerId,
      type: nextAction,
      reason: `Auto-moderation: Message reported ${reportCount} times`,
      appliedBy: 'system',
      metadata: { 
        messageId,
        reportCount,
      }
    })
  }

  private generateReportId(): string {
    return `report_${crypto.randomUUID()}`
  }
}