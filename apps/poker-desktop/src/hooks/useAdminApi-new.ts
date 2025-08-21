import { useCallback } from 'react'
import { z } from 'zod'
import { apiClient } from '../api/type-safe-client'

// Define schemas for admin API types
const ModerationStatsSchema = z.object({
  actions: z.object({
    total_warnings: z.number(),
    total_mutes: z.number(),
    total_shadow_bans: z.number(),
    total_bans: z.number(),
    active_actions: z.number(),
    affected_players: z.number()
  }),
  reports: z.object({
    total_reports: z.number(),
    pending_reports: z.number(),
    approved_reports: z.number(),
    rejected_reports: z.number()
  }),
  recentActivity: z.array(z.object({
    id: z.string(),
    type: z.enum(['WARNING', 'MUTE', 'SHADOW_BAN', 'BAN']),
    playerId: z.string(),
    username: z.string(),
    reason: z.string(),
    appliedBy: z.string(),
    appliedAt: z.number(),
    expiresAt: z.number().optional()
  })).optional()
})

const ReportSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  playerId: z.string(),
  reportedBy: z.string(),
  reason: z.string(),
  reportedAt: z.number(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'AUTO_ACTIONED']),
  reviewedBy: z.string().optional(),
  reviewedAt: z.number().optional(),
  actionTaken: z.string().optional(),
  notes: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
})

const ChatLogSchema = z.object({
  id: z.string(),
  playerId: z.string(),
  username: z.string(),
  message: z.string(),
  timestamp: z.number(),
  tableId: z.string().optional(),
  flagged: z.boolean().optional()
})

const ApplyActionRequestSchema = z.object({
  playerId: z.string(),
  type: z.enum(['WARNING', 'MUTE', 'SHADOW_BAN', 'BAN']),
  reason: z.string(),
  duration: z.number().optional(),
  metadata: z.record(z.unknown()).optional()
})

const ProcessReportRequestSchema = z.object({
  reportId: z.string(),
  decision: z.enum(['APPROVED', 'REJECTED']),
  actionType: z.enum(['WARNING', 'MUTE', 'SHADOW_BAN', 'BAN']).optional(),
  notes: z.string().optional()
})

// Type exports
export type ModerationStats = z.infer<typeof ModerationStatsSchema>
export type Report = z.infer<typeof ReportSchema>
export type ChatLog = z.infer<typeof ChatLogSchema>
export type ApplyActionRequest = z.infer<typeof ApplyActionRequestSchema>
export type ProcessReportRequest = z.infer<typeof ProcessReportRequestSchema>

// Create typed endpoints
const adminEndpoints = {
  getStats: apiClient.createEndpoint<void, ModerationStats>({
    method: 'GET',
    path: '/api/moderation/stats',
    responseSchema: ModerationStatsSchema,
    authenticated: true
  }),

  searchChatLogs: apiClient.createEndpoint<void, ChatLog[]>({
    method: 'GET',
    path: '/api/chat/logs',
    responseSchema: z.array(ChatLogSchema),
    authenticated: true
  }),

  getReports: apiClient.createEndpoint<void, Report[]>({
    method: 'GET',
    path: '/api/moderation/reports',
    responseSchema: z.array(ReportSchema),
    authenticated: true
  }),

  processReport: apiClient.createEndpoint<
    { decision: string; actionType?: string; notes?: string },
    void
  >({
    method: 'POST',
    path: '/api/moderation/reports/{reportId}/process',
    requestSchema: z.object({
      decision: z.enum(['APPROVED', 'REJECTED']),
      actionType: z.enum(['WARNING', 'MUTE', 'SHADOW_BAN', 'BAN']).optional(),
      notes: z.string().optional()
    }),
    authenticated: true
  }),

  applyAction: apiClient.createEndpoint<ApplyActionRequest, void>({
    method: 'POST',
    path: '/api/moderation/actions',
    requestSchema: ApplyActionRequestSchema,
    authenticated: true
  }),

  bulkApplyActions: apiClient.createEndpoint<
    { actions: ApplyActionRequest[] },
    void
  >({
    method: 'POST',
    path: '/api/moderation/actions/bulk',
    requestSchema: z.object({
      actions: z.array(ApplyActionRequestSchema)
    }),
    authenticated: true
  }),

  getActiveActions: apiClient.createEndpoint<void, any[]>({
    method: 'GET',
    path: '/api/moderation/actions/active',
    authenticated: true
  }),

  getPlayerActionHistory: apiClient.createEndpoint<void, any[]>({
    method: 'GET',
    path: '/api/moderation/players/history',
    authenticated: true
  }),

  updateAction: apiClient.createEndpoint<
    { reason?: string; expiresAt?: number },
    void
  >({
    method: 'PATCH',
    path: '/api/moderation/actions/{actionId}',
    requestSchema: z.object({
      reason: z.string().optional(),
      expiresAt: z.number().optional()
    }),
    authenticated: true
  }),

  revokeAction: apiClient.createEndpoint<void, void>({
    method: 'POST',
    path: '/api/moderation/actions/{actionId}/revoke',
    authenticated: true
  }),

  getReportStats: apiClient.createEndpoint<void, any>({
    method: 'GET',
    path: '/api/moderation/reports/stats',
    authenticated: true
  })
}

export const useAdminApi = () => {
  const getStats = useCallback(async (): Promise<ModerationStats> => {
    return adminEndpoints.getStats()
  }, [])

  const searchChatLogs = useCallback(async (params: {
    playerId?: string
    keyword?: string
    startTime?: number
    endTime?: number
    limit?: number
    offset?: number
  }): Promise<ChatLog[]> => {
    return adminEndpoints.searchChatLogs(undefined, { params })
  }, [])

  const getReports = useCallback(async (params?: {
    status?: string
    playerId?: string
    limit?: number
    offset?: number
  }): Promise<Report[]> => {
    return adminEndpoints.getReports(undefined, { params })
  }, [])

  const processReport = useCallback(async (request: ProcessReportRequest): Promise<void> => {
    const path = `/api/moderation/reports/${request.reportId}/process`
    await apiClient.post(path, {
      decision: request.decision,
      actionType: request.actionType,
      notes: request.notes
    })
  }, [])

  const applyAction = useCallback(async (request: ApplyActionRequest): Promise<void> => {
    await adminEndpoints.applyAction(request)
  }, [])

  const bulkApplyActions = useCallback(async (requests: ApplyActionRequest[]): Promise<void> => {
    await adminEndpoints.bulkApplyActions({ actions: requests })
  }, [])

  const getActiveActions = useCallback(async (): Promise<any[]> => {
    return adminEndpoints.getActiveActions()
  }, [])

  const getPlayerActionHistory = useCallback(async (): Promise<any[]> => {
    return adminEndpoints.getPlayerActionHistory()
  }, [])

  const updateAction = useCallback(async (params: {
    actionId: string
    reason?: string
    expiresAt?: number
  }): Promise<void> => {
    const path = `/api/moderation/actions/${params.actionId}`
    await apiClient.patch(path, {
      reason: params.reason,
      expiresAt: params.expiresAt
    })
  }, [])

  const revokeAction = useCallback(async (actionId: string): Promise<void> => {
    const path = `/api/moderation/actions/${actionId}/revoke`
    await apiClient.post(path)
  }, [])

  const getReportStats = useCallback(async (): Promise<any> => {
    return adminEndpoints.getReportStats()
  }, [])

  return {
    getStats,
    searchChatLogs,
    getReports,
    processReport,
    applyAction,
    bulkApplyActions,
    getActiveActions,
    getPlayerActionHistory,
    updateAction,
    revokeAction,
    getReportStats
  }
}