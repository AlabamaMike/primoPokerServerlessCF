import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useAdminApi, ChatLog } from '../../hooks/useAdminApi'

export const ChatLogSearch: React.FC = () => {
  const [searchParams, setSearchParams] = useState({
    keyword: '',
    playerId: '',
    startTime: '',
    endTime: '',
  })
  const [results, setResults] = useState<ChatLog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<string>('')
  const [bulkReason, setBulkReason] = useState('')
  const [showBulkModal, setShowBulkModal] = useState(false)
  
  const { searchChatLogs, bulkApplyActions } = useAdminApi()
  const containerRef = useRef<HTMLDivElement>(null)

  const handleSearch = useCallback(async (newSearch = true) => {
    if (newSearch) {
      setOffset(0)
      setResults([])
      setHasMore(true)
    }

    setLoading(newSearch)
    setLoadingMore(!newSearch)
    setError(null)

    try {
      const params: Parameters<typeof searchChatLogs>[0] = {
        limit: 50,
        offset: newSearch ? 0 : offset,
      }

      if (searchParams.keyword) params.keyword = searchParams.keyword
      if (searchParams.playerId) params.playerId = searchParams.playerId
      if (searchParams.startTime) params.startTime = new Date(searchParams.startTime).getTime()
      if (searchParams.endTime) params.endTime = new Date(searchParams.endTime).getTime()

      const logs = await searchChatLogs(params)
      
      if (newSearch) {
        setResults(logs)
      } else {
        setResults(prev => [...prev, ...logs])
      }
      
      setHasMore(logs.length === 50)
      setOffset(prev => prev + logs.length)
    } catch (err) {
      setError('Failed to search chat logs')
      console.error(err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [searchParams, offset, searchChatLogs])

  const handleClear = () => {
    setSearchParams({
      keyword: '',
      playerId: '',
      startTime: '',
      endTime: '',
    })
    setResults([])
    setOffset(0)
    setHasMore(true)
    setError(null)
  }

  const handleScroll = useCallback(() => {
    if (!containerRef.current || loadingMore || !hasMore) return

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    if (scrollTop + clientHeight >= scrollHeight - 100) {
      handleSearch(false)
    }
  }, [handleSearch, loadingMore, hasMore])

  const handleExport = () => {
    const exportData = selectedMessages.size > 0 
      ? results.filter(log => selectedMessages.has(log.id))
      : results

    const data = exportData.map(log => ({
      timestamp: new Date(log.timestamp).toISOString(),
      playerId: log.playerId,
      username: log.username,
      message: log.message,
      tableId: log.tableId || '',
      flagged: log.flagged,
    }))

    const csv = [
      'Timestamp,Player ID,Username,Message,Table ID,Flagged',
      ...data.map(row => 
        `"${row.timestamp}","${row.playerId}","${row.username}","${row.message.replace(/"/g, '""')}","${row.tableId}","${row.flagged}"`
      )
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chat-logs-${new Date().toISOString()}.csv`
    a.click()
    URL.revokeObjectURL(url)

    // Show success message
    const successDiv = document.createElement('div')
    successDiv.textContent = `${exportData.length} messages exported`
    successDiv.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow'
    document.body.appendChild(successDiv)
    setTimeout(() => successDiv.remove(), 3000)
  }

  const toggleMessageSelection = (messageId: string) => {
    setSelectedMessages(prev => {
      const newSet = new Set(prev)
      if (newSet.has(messageId)) {
        newSet.delete(messageId)
      } else {
        newSet.add(messageId)
      }
      return newSet
    })
  }

  const selectAllMessages = () => {
    if (selectedMessages.size === results.length) {
      setSelectedMessages(new Set())
    } else {
      setSelectedMessages(new Set(results.map(r => r.id)))
    }
  }

  const handleBulkAction = async () => {
    if (!bulkAction || selectedMessages.size === 0 || !bulkReason) return

    try {
      const actions = Array.from(selectedMessages).map(messageId => {
        const log = results.find(r => r.id === messageId)
        if (!log) return null
        
        return {
          playerId: log.playerId,
          type: bulkAction as 'WARNING' | 'MUTE' | 'SHADOW_BAN' | 'BAN',
          reason: bulkReason,
          metadata: { messageId, originalMessage: log.message }
        }
      }).filter(Boolean)

      await bulkApplyActions(actions as any)
      
      setSelectedMessages(new Set())
      setBulkAction('')
      setBulkReason('')
      setShowBulkModal(false)

      // Show success message
      const successDiv = document.createElement('div')
      successDiv.textContent = `Bulk action applied to ${actions.length} players`
      successDiv.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow'
      document.body.appendChild(successDiv)
      setTimeout(() => successDiv.remove(), 3000)
    } catch (err) {
      setError('Failed to apply bulk action')
      console.error(err)
    }
  }

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Chat Log Search</h2>
      
      <div className="bg-white shadow rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <input
              type="text"
              placeholder="Search messages..."
              value={searchParams.keyword}
              onChange={(e) => setSearchParams(prev => ({ ...prev, keyword: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          
          <div>
            <input
              type="text"
              placeholder="Player ID"
              value={searchParams.playerId}
              onChange={(e) => setSearchParams(prev => ({ ...prev, playerId: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          
          <div>
            <label htmlFor="from-date" className="block text-sm font-medium text-gray-700">
              From Date
            </label>
            <input
              id="from-date"
              type="datetime-local"
              value={searchParams.startTime}
              onChange={(e) => setSearchParams(prev => ({ ...prev, startTime: e.target.value }))}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          
          <div>
            <label htmlFor="to-date" className="block text-sm font-medium text-gray-700">
              To Date
            </label>
            <input
              id="to-date"
              type="datetime-local"
              value={searchParams.endTime}
              onChange={(e) => setSearchParams(prev => ({ ...prev, endTime: e.target.value }))}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        
        <div className="mt-4 flex space-x-4">
          <button
            onClick={() => handleSearch(true)}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
          
          <button
            onClick={handleClear}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
          >
            Clear
          </button>
          
          {results.length > 0 && (
            <button
              onClick={handleExport}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            >
              Export {selectedMessages.size > 0 ? `${selectedMessages.size} Selected` : 'Results'}
            </button>
          )}
          
          {selectedMessages.size > 0 && (
            <button
              onClick={() => setShowBulkModal(true)}
              className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700"
            >
              Bulk Action ({selectedMessages.size})
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {loading && <div className="text-center py-4">Searching...</div>}

      {!loading && results.length === 0 && offset === 0 && (
        <div className="text-center py-8 text-gray-500">
          No chat logs found
        </div>
      )}

      {results.length > 0 && (
        <div
          ref={containerRef}
          onScroll={handleScroll}
          data-testid="chat-logs-container"
          className="bg-white shadow rounded-lg overflow-hidden max-h-[600px] overflow-y-auto"
        >
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedMessages.size === results.length && results.length > 0}
                    onChange={selectAllMessages}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Player
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Message
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Table
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {results.map((log) => (
                <tr key={log.id} className={`chat-log-item ${selectedMessages.has(log.id) ? 'bg-indigo-50' : log.flagged ? 'flagged bg-red-50' : ''}`}>
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedMessages.has(log.id)}
                      onChange={() => toggleMessageSelection(log.id)}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatTimestamp(log.timestamp)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {log.username}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {log.message}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {log.tableId || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          const modal = document.createElement('div')
                          modal.innerHTML = '<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"><div class="bg-white p-4 rounded"><h3 class="text-lg font-bold mb-2">Report Message</h3><p>Report functionality coming soon</p></div></div>'
                          document.body.appendChild(modal)
                          setTimeout(() => modal.remove(), 2000)
                        }}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        Report
                      </button>
                      <div className="relative group">
                        <button className="text-indigo-600 hover:text-indigo-900">
                          Actions
                        </button>
                        <div className="absolute hidden group-hover:block right-0 mt-1 w-32 bg-white border border-gray-200 rounded shadow-lg z-10">
                          <button className="block w-full text-left px-4 py-2 hover:bg-gray-100">Warn</button>
                          <button className="block w-full text-left px-4 py-2 hover:bg-gray-100">Mute</button>
                          <button className="block w-full text-left px-4 py-2 hover:bg-gray-100">Ban</button>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {loadingMore && (
            <div className="text-center py-4">Loading more...</div>
          )}
        </div>
      )}

      {/* Bulk Action Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">Apply Bulk Action</h3>
            <p className="text-sm text-gray-600 mb-4">
              This action will be applied to {selectedMessages.size} selected messages
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Action Type
                </label>
                <select
                  value={bulkAction}
                  onChange={(e) => setBulkAction(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select Action</option>
                  <option value="WARNING">Warning</option>
                  <option value="MUTE">Mute</option>
                  <option value="SHADOW_BAN">Shadow Ban</option>
                  <option value="BAN">Ban</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason
                </label>
                <textarea
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  rows={3}
                  placeholder="Enter reason for this action..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowBulkModal(false)
                  setBulkAction('')
                  setBulkReason('')
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAction}
                disabled={!bulkAction || !bulkReason}
                className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
              >
                Apply Action
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}