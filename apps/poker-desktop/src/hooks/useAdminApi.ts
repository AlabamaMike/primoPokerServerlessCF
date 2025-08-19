import { useCallback } from 'react'
import { useAuthStore } from '../stores/auth-store'

export interface ModerationStats {
  actions: {
    total_warnings: number
    total_mutes: number
    total_shadow_bans: number
    total_bans: number
    active_actions: number
    affected_players: number
  }
  reports: {
    total_reports: number
    pending_reports: number
    approved_reports: number
    rejected_reports: number
  }
  recentActivity?: Array<{
    id: string
    type: 'WARNING' | 'MUTE' | 'SHADOW_BAN' | 'BAN'
    playerId: string
    username: string
    reason: string
    appliedBy: string
    appliedAt: number
    expiresAt?: number
  }>
}

export interface Report {
  id: string
  messageId: string
  playerId: string
  reportedBy: string
  reason: string
  reportedAt: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO_ACTIONED'
  reviewedBy?: string
  reviewedAt?: number
  actionTaken?: string
  notes?: string
  metadata?: Record<string, unknown>
}

export interface ChatLog {
  id: string
  playerId: string
  username: string
  message: string
  timestamp: number
  tableId?: string
  flagged?: boolean
}

export interface ApplyActionRequest {
  playerId: string
  type: 'WARNING' | 'MUTE' | 'SHADOW_BAN' | 'BAN'
  reason: string
  duration?: number
  metadata?: Record<string, unknown>
}

export interface ProcessReportRequest {
  reportId: string
  decision: 'APPROVED' | 'REJECTED'
  actionType?: 'WARNING' | 'MUTE' | 'SHADOW_BAN' | 'BAN'
  notes?: string
}

export const useAdminApi = () => {
  const authStore = useAuthStore()

  const apiCall = useCallback(async (path: string, options?: RequestInit) => {
    const token = authStore.token
    if (!token) {
      throw new Error('No authentication token')
    }

    // Get API URL, fallback to production URL if not set
    const apiUrl = 'https://primo-poker-server.alabamamike.workers.dev'
    
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }))
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    return response.json()
  }, [authStore.token])

  const getStats = useCallback(async (): Promise<ModerationStats> => {
    const result = await apiCall('/api/moderation/stats')
    return result.data
  }, [apiCall])

  const searchChatLogs = useCallback(async (params: {
    playerId?: string
    keyword?: string
    startTime?: number
    endTime?: number
    limit?: number
    offset?: number
  }): Promise<ChatLog[]> => {
    const queryParams = new URLSearchParams()
    if (params.playerId) queryParams.append('playerId', params.playerId)
    if (params.keyword) queryParams.append('keyword', params.keyword)
    if (params.startTime) queryParams.append('startTime', params.startTime.toString())
    if (params.endTime) queryParams.append('endTime', params.endTime.toString())
    if (params.limit) queryParams.append('limit', params.limit.toString())
    if (params.offset) queryParams.append('offset', params.offset.toString())

    const result = await apiCall(`/api/chat/logs?${queryParams}`)
    return result.data
  }, [apiCall])

  const getReports = useCallback(async (params?: {
    status?: string
    playerId?: string
    limit?: number
    offset?: number
  }): Promise<Report[]> => {
    const queryParams = new URLSearchParams()
    if (params?.status) queryParams.append('status', params.status)
    if (params?.playerId) queryParams.append('playerId', params.playerId)
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    if (params?.offset) queryParams.append('offset', params.offset.toString())

    const result = await apiCall(`/api/moderation/reports?${queryParams}`)
    return result.data
  }, [apiCall])

  const processReport = useCallback(async (request: ProcessReportRequest): Promise<void> => {
    await apiCall(`/api/moderation/reports/${request.reportId}/process`, {
      method: 'POST',
      body: JSON.stringify({
        decision: request.decision,
        actionType: request.actionType,
        notes: request.notes,
      }),
    })
  }, [apiCall])

  const applyAction = useCallback(async (request: ApplyActionRequest): Promise<void> => {
    await apiCall('/api/moderation/actions', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  }, [apiCall])

  const bulkApplyActions = useCallback(async (requests: ApplyActionRequest[]): Promise<void> => {
    await apiCall('/api/moderation/actions/bulk', {
      method: 'POST',
      body: JSON.stringify({ actions: requests }),
    })
  }, [apiCall])

  const getActiveActions = useCallback(async (): Promise<any[]> => {
    const result = await apiCall('/api/moderation/actions/active')
    return result.data
  }, [apiCall])

  const getPlayerActionHistory = useCallback(async (): Promise<any[]> => {
    const result = await apiCall('/api/moderation/players/history')
    return result.data
  }, [apiCall])

  const updateAction = useCallback(async (params: {
    actionId: string
    reason?: string
    expiresAt?: number
  }): Promise<void> => {
    await apiCall(`/api/moderation/actions/${params.actionId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        reason: params.reason,
        expiresAt: params.expiresAt,
      }),
    })
  }, [apiCall])

  const revokeAction = useCallback(async (actionId: string): Promise<void> => {
    await apiCall(`/api/moderation/actions/${actionId}/revoke`, {
      method: 'POST',
    })
  }, [apiCall])

  const getReportStats = useCallback(async (): Promise<any> => {
    const result = await apiCall('/api/moderation/reports/stats')
    return result.data
  }, [apiCall])

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
    getReportStats,
  }
}