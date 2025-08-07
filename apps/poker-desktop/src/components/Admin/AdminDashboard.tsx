import React, { useEffect, useState } from 'react'
import { useAdminApi, ModerationStats } from '../../hooks/useAdminApi'

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<ModerationStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { getStats } = useAdminApi()

  const fetchStats = async () => {
    try {
      setLoading(true)
      const data = await getStats()
      setStats(data)
      setError(null)
    } catch (err) {
      setError('Failed to load statistics')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()

    // Set up auto-refresh
    const interval = setInterval(fetchStats, 30 * 1000) // 30 seconds
    return () => clearInterval(interval)
  }, [])

  if (loading && !stats) {
    return <div className="text-center py-8">Loading statistics...</div>
  }

  if (error) {
    return <div className="text-red-600 text-center py-8">{error}</div>
  }

  const formatRelativeTime = (timestamp: number) => {
    const minutes = Math.floor((Date.now() - timestamp) / 1000 / 60)
    if (minutes < 60) return `${minutes} minutes ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} hours ago`
    return `${Math.floor(hours / 24)} days ago`
  }

  const formatExpiryTime = (expiresAt: number) => {
    const minutes = Math.floor((expiresAt - Date.now()) / 1000 / 60)
    if (minutes < 60) return `expires in ${minutes} minutes`
    const hours = Math.floor(minutes / 60)
    return `expires in ${hours} hours`
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Moderation Statistics</h2>
      
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Warnings</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">{stats?.actions.total_warnings || 0}</dd>
          </div>
        </div>
        
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Mutes</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">{stats?.actions.total_mutes || 0}</dd>
          </div>
        </div>
        
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Shadow Bans</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">{stats?.actions.total_shadow_bans || 0}</dd>
          </div>
        </div>
        
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Bans</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">{stats?.actions.total_bans || 0}</dd>
          </div>
        </div>
      </div>

      <h3 className="text-xl font-semibold">Report Statistics</h3>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Pending</dt>
            <dd className="mt-1 text-3xl font-semibold text-orange-600">{stats?.reports.pending_reports || 0}</dd>
          </div>
        </div>
        
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Total Reports</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">{stats?.reports.total_reports || 0}</dd>
          </div>
        </div>
      </div>

      {stats?.recentActivity && stats.recentActivity.length > 0 && (
        <>
          <h3 className="text-xl font-semibold">Recent Activity</h3>
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {stats.recentActivity.map((action) => (
                <li key={action.id} className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                          ${action.type === 'WARNING' ? 'bg-yellow-100 text-yellow-800' : ''}
                          ${action.type === 'MUTE' ? 'bg-orange-100 text-orange-800' : ''}
                          ${action.type === 'SHADOW_BAN' ? 'bg-purple-100 text-purple-800' : ''}
                          ${action.type === 'BAN' ? 'bg-red-100 text-red-800' : ''}
                        `}>
                          {action.type}
                        </span>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{action.username}</div>
                        <div className="text-sm text-gray-500">{action.reason}</div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-500">
                      <div>{formatRelativeTime(action.appliedAt)}</div>
                      {action.expiresAt && (
                        <div className="text-xs">{formatExpiryTime(action.expiresAt)}</div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <div className="flex space-x-4">
        <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700">
          View Pending Reports
        </button>
        <button className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
          Search Chat Logs
        </button>
        <button className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
          Manage Bans
        </button>
      </div>
    </div>
  )
}