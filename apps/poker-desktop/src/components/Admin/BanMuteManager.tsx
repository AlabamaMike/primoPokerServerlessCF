import React, { useState, useEffect, useCallback } from 'react'
import { useAdminApi } from '../../hooks/useAdminApi'

interface BanMuteAction {
  id: string
  type: 'WARNING' | 'MUTE' | 'SHADOW_BAN' | 'BAN'
  playerId: string
  username: string
  reason: string
  appliedBy: string
  appliedAt: number
  expiresAt?: number
  isActive: boolean
}

interface PlayerHistory {
  playerId: string
  username: string
  totalActions: number
  warnings: number
  mutes: number
  shadowBans: number
  bans: number
  lastActionAt: number
}

export const BanMuteManager: React.FC = () => {
  const [activeActions, setActiveActions] = useState<BanMuteAction[]>([])
  const [playerHistory, setPlayerHistory] = useState<PlayerHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<string>('ALL')
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [editingAction, setEditingAction] = useState<BanMuteAction | null>(null)
  const [editReason, setEditReason] = useState('')
  const [editDuration, setEditDuration] = useState<number | null>(null)

  const { getActiveActions, getPlayerActionHistory, updateAction, revokeAction } = useAdminApi()

  const fetchData = async () => {
    try {
      setLoading(true)
      const [actions, history] = await Promise.all([
        getActiveActions(),
        getPlayerActionHistory()
      ])
      setActiveActions(actions)
      setPlayerHistory(history)
      setError(null)
    } catch (err) {
      setError('Failed to load ban/mute data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleEdit = (action: BanMuteAction) => {
    setEditingAction(action)
    setEditReason(action.reason)
    if (action.expiresAt) {
      const duration = Math.max(0, Math.floor((action.expiresAt - Date.now()) / 1000 / 60))
      setEditDuration(duration)
    } else {
      setEditDuration(null)
    }
  }

  const handleSaveEdit = async () => {
    if (!editingAction) return

    try {
      await updateAction({
        actionId: editingAction.id,
        reason: editReason,
        expiresAt: editDuration ? Date.now() + editDuration * 60 * 1000 : undefined
      })
      setEditingAction(null)
      setEditReason('')
      setEditDuration(null)
      await fetchData()
    } catch (err) {
      setError('Failed to update action')
      console.error(err)
    }
  }

  const handleRevoke = async (actionId: string) => {
    if (!confirm('Are you sure you want to revoke this action?')) return

    try {
      await revokeAction(actionId)
      await fetchData()
    } catch (err) {
      setError('Failed to revoke action')
      console.error(err)
    }
  }

  const filteredActions = activeActions.filter(action => {
    const matchesSearch = 
      action.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      action.playerId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      action.reason.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesType = filterType === 'ALL' || action.type === filterType

    return matchesSearch && matchesType
  })

  const selectedPlayerHistory = playerHistory.find(p => p.playerId === selectedPlayer)

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  const formatDuration = (timestamp: number) => {
    const minutes = Math.floor((timestamp - Date.now()) / 1000 / 60)
    if (minutes < 0) return 'Expired'
    if (minutes < 60) return `${minutes} minutes`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} hours`
    return `${Math.floor(hours / 24)} days`
  }

  const getActionColor = (type: string) => {
    switch (type) {
      case 'WARNING': return 'bg-yellow-100 text-yellow-800'
      case 'MUTE': return 'bg-orange-100 text-orange-800'
      case 'SHADOW_BAN': return 'bg-purple-100 text-purple-800'
      case 'BAN': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading ban/mute data...</div>
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Ban/Mute Management</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Search and Filter */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <input
            type="text"
            placeholder="Search by player name, ID, or reason..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">All Types</option>
            <option value="WARNING">Warnings</option>
            <option value="MUTE">Mutes</option>
            <option value="SHADOW_BAN">Shadow Bans</option>
            <option value="BAN">Bans</option>
          </select>

          <button
            onClick={fetchData}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Active Actions */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b">
          <h3 className="text-lg font-semibold">Active Actions ({filteredActions.length})</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Player
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reason
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Applied
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Expires
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredActions.map((action) => (
                <tr key={action.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => setSelectedPlayer(action.playerId)}
                      className="text-indigo-600 hover:text-indigo-900 font-medium"
                    >
                      {action.username}
                    </button>
                    <div className="text-xs text-gray-500">{action.playerId}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionColor(action.type)}`}>
                      {action.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {action.reason}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(action.appliedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {action.expiresAt ? formatDuration(action.expiresAt) : 'Permanent'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEdit(action)}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleRevoke(action.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Revoke
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {filteredActions.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No active actions found
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingAction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">Edit Action</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Player: {editingAction.username}
                </label>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionColor(editingAction.type)}`}>
                  {editingAction.type}
                </span>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason
                </label>
                <textarea
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              
              {editingAction.type === 'MUTE' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Duration (minutes)
                  </label>
                  <input
                    type="number"
                    value={editDuration || ''}
                    onChange={(e) => setEditDuration(e.target.value ? parseInt(e.target.value) : null)}
                    min="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setEditingAction(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Player History Modal */}
      {selectedPlayer && selectedPlayerHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold">Player History</h3>
                <p className="text-sm text-gray-600">{selectedPlayerHistory.username}</p>
                <p className="text-xs text-gray-500">{selectedPlayer}</p>
              </div>
              <button
                onClick={() => setSelectedPlayer(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-yellow-50 p-3 rounded">
                <div className="text-2xl font-bold text-yellow-800">{selectedPlayerHistory.warnings}</div>
                <div className="text-sm text-yellow-600">Warnings</div>
              </div>
              <div className="bg-orange-50 p-3 rounded">
                <div className="text-2xl font-bold text-orange-800">{selectedPlayerHistory.mutes}</div>
                <div className="text-sm text-orange-600">Mutes</div>
              </div>
              <div className="bg-purple-50 p-3 rounded">
                <div className="text-2xl font-bold text-purple-800">{selectedPlayerHistory.shadowBans}</div>
                <div className="text-sm text-purple-600">Shadow Bans</div>
              </div>
              <div className="bg-red-50 p-3 rounded">
                <div className="text-2xl font-bold text-red-800">{selectedPlayerHistory.bans}</div>
                <div className="text-sm text-red-600">Bans</div>
              </div>
            </div>
            
            <div className="text-sm text-gray-600">
              <p>Total Actions: {selectedPlayerHistory.totalActions}</p>
              <p>Last Action: {formatDate(selectedPlayerHistory.lastActionAt)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}