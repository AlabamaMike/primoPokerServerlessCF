import React, { useState, useEffect, useCallback } from 'react'
import { useAdminApi, Report, ProcessReportRequest } from '../../hooks/useAdminApi'

interface ReportStats {
  pendingCount: number
  todayCount: number
  weekCount: number
  approvalRate: number
  averageResponseTime: number
  repeatOffenders: Array<{
    playerId: string
    username: string
    reportCount: number
  }>
}

export const ReportQueue: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([])
  const [stats, setStats] = useState<ReportStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set())
  const [filterStatus, setFilterStatus] = useState('PENDING')
  const [processingReport, setProcessingReport] = useState<string | null>(null)
  const [bulkAction, setBulkAction] = useState<'APPROVED' | 'REJECTED' | null>(null)
  const [bulkActionType, setBulkActionType] = useState<'WARNING' | 'MUTE' | 'SHADOW_BAN' | 'BAN' | null>(null)

  const { getReports, processReport, getReportStats } = useAdminApi()

  const fetchData = async () => {
    try {
      setLoading(true)
      const [reportsData, statsData] = await Promise.all([
        getReports({ status: filterStatus }),
        getReportStats()
      ])
      setReports(reportsData)
      setStats(statsData)
      setError(null)
    } catch (err) {
      setError('Failed to load reports')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [filterStatus])

  const handleProcessReport = async (
    reportId: string,
    decision: 'APPROVED' | 'REJECTED',
    actionType?: 'WARNING' | 'MUTE' | 'SHADOW_BAN' | 'BAN',
    notes?: string
  ) => {
    try {
      setProcessingReport(reportId)
      await processReport({
        reportId,
        decision,
        actionType,
        notes,
      })
      await fetchData()
      setSelectedReports(prev => {
        const newSet = new Set(prev)
        newSet.delete(reportId)
        return newSet
      })
    } catch (err) {
      setError('Failed to process report')
      console.error(err)
    } finally {
      setProcessingReport(null)
    }
  }

  const handleBulkProcess = async () => {
    if (!bulkAction || selectedReports.size === 0) return

    const processingPromises = Array.from(selectedReports).map(reportId =>
      handleProcessReport(reportId, bulkAction, bulkActionType || undefined)
    )

    try {
      await Promise.all(processingPromises)
      setSelectedReports(new Set())
      setBulkAction(null)
      setBulkActionType(null)
    } catch (err) {
      setError('Failed to process bulk reports')
      console.error(err)
    }
  }

  const toggleReportSelection = (reportId: string) => {
    setSelectedReports(prev => {
      const newSet = new Set(prev)
      if (newSet.has(reportId)) {
        newSet.delete(reportId)
      } else {
        newSet.add(reportId)
      }
      return newSet
    })
  }

  const selectAllReports = () => {
    if (selectedReports.size === reports.length) {
      setSelectedReports(new Set())
    } else {
      setSelectedReports(new Set(reports.map(r => r.id)))
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-yellow-100 text-yellow-800'
      case 'APPROVED': return 'bg-green-100 text-green-800'
      case 'REJECTED': return 'bg-red-100 text-red-800'
      case 'AUTO_ACTIONED': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading reports...</div>
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Report Review Queue</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white shadow rounded-lg p-4">
            <div className="text-2xl font-bold text-orange-600">{stats.pendingCount}</div>
            <div className="text-sm text-gray-600">Pending Reports</div>
          </div>
          <div className="bg-white shadow rounded-lg p-4">
            <div className="text-2xl font-bold">{stats.todayCount}</div>
            <div className="text-sm text-gray-600">Today</div>
          </div>
          <div className="bg-white shadow rounded-lg p-4">
            <div className="text-2xl font-bold">{stats.weekCount}</div>
            <div className="text-sm text-gray-600">This Week</div>
          </div>
          <div className="bg-white shadow rounded-lg p-4">
            <div className="text-2xl font-bold">{(stats.approvalRate * 100).toFixed(1)}%</div>
            <div className="text-sm text-gray-600">Approval Rate</div>
          </div>
          <div className="bg-white shadow rounded-lg p-4">
            <div className="text-2xl font-bold">{stats.averageResponseTime}h</div>
            <div className="text-sm text-gray-600">Avg Response</div>
          </div>
        </div>
      )}

      {/* Repeat Offenders */}
      {stats && stats.repeatOffenders.length > 0 && (
        <div className="bg-white shadow rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3">Repeat Offenders</h3>
          <div className="flex flex-wrap gap-2">
            {stats.repeatOffenders.map(offender => (
              <div key={offender.playerId} className="bg-red-50 px-3 py-1 rounded-full text-sm">
                <span className="font-medium">{offender.username}</span>
                <span className="text-red-600 ml-1">({offender.reportCount} reports)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter and Bulk Actions */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="AUTO_ACTIONED">Auto-Actioned</option>
            <option value="">All Reports</option>
          </select>

          {selectedReports.size > 0 && (
            <>
              <select
                value={bulkAction || ''}
                onChange={(e) => setBulkAction(e.target.value as 'APPROVED' | 'REJECTED' | null)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select Bulk Action</option>
                <option value="APPROVED">Approve Selected</option>
                <option value="REJECTED">Reject Selected</option>
              </select>

              {bulkAction === 'APPROVED' && (
                <select
                  value={bulkActionType || ''}
                  onChange={(e) => setBulkActionType(e.target.value as any)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select Action Type</option>
                  <option value="WARNING">Warning</option>
                  <option value="MUTE">Mute</option>
                  <option value="SHADOW_BAN">Shadow Ban</option>
                  <option value="BAN">Ban</option>
                </select>
              )}

              <button
                onClick={handleBulkProcess}
                disabled={!bulkAction || (bulkAction === 'APPROVED' && !bulkActionType)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                Process {selectedReports.size} Reports
              </button>
            </>
          )}

          <button
            onClick={fetchData}
            className="ml-auto px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Reports Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedReports.size === reports.length && reports.length > 0}
                  onChange={selectAllReports}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reported Player
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reason
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reporter
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Time
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {reports.map((report) => (
              <tr key={report.id} className={selectedReports.has(report.id) ? 'bg-indigo-50' : ''}>
                <td className="px-6 py-4">
                  <input
                    type="checkbox"
                    checked={selectedReports.has(report.id)}
                    onChange={() => toggleReportSelection(report.id)}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {report.playerId}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {report.reason}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {report.reportedBy}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(report.reportedAt)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(report.status)}`}>
                    {report.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {report.status === 'PENDING' && (
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          const actionType = prompt('Action type? (WARNING/MUTE/SHADOW_BAN/BAN)')
                          if (actionType) {
                            handleProcessReport(report.id, 'APPROVED', actionType as any)
                          }
                        }}
                        disabled={processingReport === report.id}
                        className="text-green-600 hover:text-green-900 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleProcessReport(report.id, 'REJECTED')}
                        disabled={processingReport === report.id}
                        className="text-red-600 hover:text-red-900 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                  {report.status !== 'PENDING' && report.reviewedBy && (
                    <span className="text-xs text-gray-500">
                      by {report.reviewedBy}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {reports.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No reports found
          </div>
        )}
      </div>
    </div>
  )
}