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
  
  const { searchChatLogs } = useAdminApi()
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
    const data = results.map(log => ({
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
    successDiv.textContent = 'Results exported'
    successDiv.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow'
    document.body.appendChild(successDiv)
    setTimeout(() => successDiv.remove(), 3000)
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
              Export Results
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
                <tr key={log.id} className={`chat-log-item ${log.flagged ? 'flagged bg-red-50' : ''}`}>
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
    </div>
  )
}