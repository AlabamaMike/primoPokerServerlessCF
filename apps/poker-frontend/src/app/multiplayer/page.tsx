'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useTableWebSocket } from '@/hooks/useWebSocket'
import { Button } from '@/components/ui/button'
import { Users, Play, Plus, Wifi, WifiOff } from 'lucide-react'
import MultiplayerGameClient from '@/app/game/[tableId]/client-page'
import { apiClient } from '@/lib/api-client'


function MultiplayerLobbyContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tableId = searchParams.get('table')
  const { user, isAuthenticated } = useAuthStore()
  const { isConnected, error, tables, joinTable } = useTableWebSocket()
  const [isLoading, setIsLoading] = useState(false)
  const [apiTables, setApiTables] = useState<any[]>([])

  // If table ID is provided, render the game client
  if (tableId) {
    console.log('Multiplayer page rendering game client for table:', tableId)
    return <MultiplayerGameClient tableId={tableId} />
  }


  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login')
    }
  }, [isAuthenticated, router])

  // Fetch tables from API
  useEffect(() => {
    const fetchTables = async () => {
      try {
        const response = await apiClient.getTables()
        if (response.success && response.data) {
          setApiTables(response.data)
        }
      } catch (error) {
        console.error('Failed to fetch tables:', error)
      }
    }

    if (isAuthenticated) {
      fetchTables()
      // Refresh tables every 5 seconds
      const interval = setInterval(fetchTables, 5000)
      return () => clearInterval(interval)
    }
  }, [isAuthenticated])

  const handleCreateTable = async () => {
    setIsLoading(true)
    try {
      const config = {
        name: `${user?.username}'s Table`,
        maxPlayers: 9,
        blinds: { small: 5, big: 10 },
        buyIn: 1000
      }
      
      // Create table via API
      const response = await apiClient.createTable(config)
      
      if (response.success && response.data) {
        // Navigate to the newly created table
        router.push(`/game/${response.data.id}`)
      } else {
        throw new Error('Failed to create table')
      }
    } catch (error) {
      console.error('Failed to create table:', error)
      alert('Failed to create table. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleJoinTable = async (tableId: string) => {
    setIsLoading(true)
    try {
      if (isConnected) {
        joinTable(tableId)
        router.push(`/game/${tableId}`)
      } else {
        alert('You must be connected to join a table')
      }
    } catch (error) {
      console.error('Failed to join table:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <h1 className="text-2xl font-bold mb-4">Authentication Required</h1>
          <p>Please log in to access the multiplayer lobby.</p>
        </div>
      </div>
    )
  }

  // Use API tables if available, otherwise use WebSocket tables
  const activeTables = apiTables.length > 0 ? apiTables : tables

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
              Multiplayer Lobby
            </h1>
            <p className="text-slate-300 mt-2">Welcome back, {user?.username}!</p>
          </div>
          
          {/* Connection Status */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800">
              {isConnected ? (
                <>
                  <Wifi className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-green-400">Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-red-400" />
                  <span className="text-sm text-red-400">Disconnected</span>
                </>
              )}
            </div>
            
            <Button
              onClick={handleCreateTable}
              disabled={isLoading}
              className="bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Table
            </Button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-600 rounded-lg">
            <p className="text-red-300">Connection Error: {error}</p>
          </div>
        )}

        {/* Tables Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activeTables.map((table) => {
            // Handle both API response format and WebSocket format
            const playerCount = table.playerCount || table.players?.length || table.players || 0
            const maxPlayers = table.config?.maxPlayers || table.maxPlayers || 9
            const smallBlind = table.config?.smallBlind || table.blinds?.small || 5
            const bigBlind = table.config?.bigBlind || table.blinds?.big || 10
            const status = table.status || (playerCount === 0 ? 'waiting' : playerCount >= maxPlayers ? 'full' : 'playing')
            
            return (
              <div key={table.id} className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-slate-600 transition-colors">
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-semibold text-white">{table.name}</h3>
                    <span
                      className={`px-2 py-1 rounded text-xs uppercase font-semibold ${
                        status === 'waiting' ? 'bg-green-600 text-white' :
                        status === 'playing' ? 'bg-yellow-600 text-white' : 
                        'bg-red-600 text-white'
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                  <p className="text-slate-400">
                    Blinds: ${smallBlind}/${bigBlind}
                  </p>
                </div>
                
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Users className="w-4 h-4" />
                      <span>{playerCount}/{maxPlayers} players</span>
                    </div>
                    
                    <div className="w-20 bg-slate-700 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-yellow-400 to-orange-500 h-2 rounded-full transition-all"
                        style={{ width: `${(playerCount / maxPlayers) * 100}%` }}
                      />
                    </div>
                  </div>
                  
                  <Button
                    onClick={() => handleJoinTable(table.id)}
                    disabled={isLoading || status === 'full'}
                    className="w-full bg-slate-700 hover:bg-slate-600 border-slate-600"
                    variant="outline"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    {status === 'full' ? 'Table Full' : 'Join Table'}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Quick Actions */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 text-center">
            <h3 className="font-semibold text-white mb-2">Practice Mode</h3>
            <p className="text-slate-400 text-sm mb-4">Play against AI opponents</p>
            <Button 
              onClick={() => router.push('/demo/table')}
              variant="outline" 
              className="w-full border-slate-600"
            >
              Play Now
            </Button>
          </div>
          
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 text-center">
            <h3 className="font-semibold text-white mb-2">Tournament</h3>
            <p className="text-slate-400 text-sm mb-4">Compete for big prizes</p>
            <Button 
              variant="outline" 
              className="w-full border-slate-600"
              disabled
            >
              Coming Soon
            </Button>
          </div>
          
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 text-center">
            <h3 className="font-semibold text-white mb-2">Private Table</h3>
            <p className="text-slate-400 text-sm mb-4">Play with friends</p>
            <Button 
              variant="outline" 
              className="w-full border-slate-600"
              disabled
            >
              Coming Soon
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MultiplayerLobby() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400 mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    }>
      <MultiplayerLobbyContent />
    </Suspense>
  )
}
