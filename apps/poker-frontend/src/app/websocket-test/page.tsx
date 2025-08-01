'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { WebSocketClient } from '@/lib/websocket-client'

export default function WebSocketTest() {
  const { user, token, isAuthenticated } = useAuthStore()
  const [connectionStatus, setConnectionStatus] = useState('Not connected')
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])

  const addLog = (message: string) => {
    setLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: ${message}`])
  }

  useEffect(() => {
    if (!isAuthenticated) {
      setError('Not authenticated')
      addLog('User not authenticated')
      return
    }

    if (!token) {
      setError('No token available')
      addLog('No token available')
      return
    }

    addLog(`Starting WebSocket test for user: ${user?.username}`)
    addLog(`Token length: ${token.length}`)

    const testConnection = async () => {
      try {
        setConnectionStatus('Connecting...')
        addLog('Creating WebSocket client')
        
        const wsUrl = process.env.NEXT_PUBLIC_API_URL?.replace('https://', 'wss://').replace('http://', 'ws://') || 'wss://primo-poker-server.alabamamike.workers.dev'
        addLog(`WebSocket URL: ${wsUrl}`)
        
        const client = new WebSocketClient(wsUrl)
        client.setToken(token)
        client.setTableId('lobby')
        
        addLog('Attempting to connect...')
        await client.connect()
        
        setConnectionStatus('Connected!')
        setError(null)
        addLog('✅ Connected successfully!')
        
        // Test sending a message
        client.send('get_tables', {})
        addLog('Sent get_tables message')
        
        // Set up message handler
        client.on('tables_update', (message) => {
          addLog(`Received tables_update: ${JSON.stringify(message.payload)}`)
        })
        
        client.on('connection_established', (message) => {
          addLog(`Connection established: ${JSON.stringify(message.payload)}`)
        })
        
        // Clean up after 30 seconds
        setTimeout(() => {
          client.disconnect()
          addLog('Disconnected after 30 seconds')
          setConnectionStatus('Disconnected')
        }, 30000)
        
      } catch (err) {
        setConnectionStatus('Failed to connect')
        setError(err instanceof Error ? err.message : 'Unknown error')
        addLog(`❌ Connection failed: ${err}`)
      }
    }

    testConnection()
  }, [isAuthenticated, token, user])

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">WebSocket Test - Not Authenticated</h1>
          <p>Please log in to test WebSocket connections.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">WebSocket Connection Test</h1>
        
        <div className="bg-slate-800 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">Authentication Info</h2>
          <div className="space-y-2 text-sm">
            <div>User: {user?.username || 'None'}</div>
            <div>Authenticated: {isAuthenticated ? '✅' : '❌'}</div>
            <div>Token: {token ? `${token.substring(0, 20)}...` : 'None'}</div>
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">Connection Status</h2>
          <div className={`text-lg font-semibold ${
            connectionStatus.includes('Connected') ? 'text-green-400' :
            connectionStatus.includes('Failed') ? 'text-red-400' :
            'text-yellow-400'
          }`}>
            {connectionStatus}
          </div>
          {error && (
            <div className="mt-2 text-red-400 text-sm">
              Error: {error}
            </div>
          )}
        </div>

        <div className="bg-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-3">Connection Log</h2>
          <div className="bg-slate-900 rounded p-3 font-mono text-sm max-h-64 overflow-y-auto">
            {logs.length > 0 ? (
              logs.map((log, i) => (
                <div key={i} className="mb-1">{log}</div>
              ))
            ) : (
              <div className="text-slate-500">No logs yet...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
