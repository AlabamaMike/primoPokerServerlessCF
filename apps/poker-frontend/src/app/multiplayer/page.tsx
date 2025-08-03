'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Users, Play, Plus, Wifi, WifiOff, AlertCircle, Loader2 } from 'lucide-react'

export default function SimplifiedMultiplayerPage() {
  const router = useRouter()
  const { user, isAuthenticated } = useAuthStore()
  const [tables, setTables] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCreatingTable, setIsCreatingTable] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login')
    }
  }, [isAuthenticated, router])

  // Fetch tables from API
  useEffect(() => {
    const fetchTables = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const response = await apiClient.getTables()
        if (response.success && response.data) {
          setTables(response.data)
        } else {
          setTables([])
        }
      } catch (error) {
        console.error('Failed to fetch tables:', error)
        setError('Failed to load tables')
        setTables([])
      } finally {
        setIsLoading(false)
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
    setIsCreatingTable(true)
    setError(null)
    
    try {
      const config = {
        name: `${user?.username}'s Table`,
        maxPlayers: 9,
        blinds: { small: 5, big: 10 },
        buyIn: 1000
      }
      
      console.log('Creating table with config:', config)
      
      // Create table via API
      const response = await apiClient.createTable(config)
      console.log('Create table response:', response)
      
      if (response.success && response.data) {
        // Navigate to the newly created table
        const tableId = response.data.id || response.data.tableId
        console.log('Navigating to table:', tableId)
        router.push(`/game/${tableId}`)
      } else {
        throw new Error(response.error?.message || 'Failed to create table')
      }
    } catch (error: any) {
      console.error('Failed to create table:', error)
      setError(error.message || 'Failed to create table. Please try again.')
    } finally {
      setIsCreatingTable(false)
    }
  }

  const handleJoinTable = (tableId: string) => {
    router.push(`/game/${tableId}`)
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white">Redirecting to login...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Multiplayer Tables</h1>
            <div className="flex items-center gap-2 text-green-400">
              <Wifi className="w-4 h-4" />
              <span className="text-sm">API Connected</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">
              Welcome, <span className="text-white font-medium">{user?.username}</span>
            </span>
            <Button 
              onClick={() => router.push('/lobby')}
              variant="outline"
              className="text-white border-white/20 hover:bg-white/10"
            >
              Back to Lobby
            </Button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-6 mt-6 p-4 bg-red-900/50 border border-red-600 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <p className="text-red-300">{error}</p>
        </div>
      )}

      {/* Create Table Section */}
      <div className="px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-slate-800 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">Create New Table</h2>
            <p className="text-gray-400 mb-6">
              Start your own table with custom blinds and settings
            </p>
            <Button
              onClick={handleCreateTable}
              disabled={isCreatingTable}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isCreatingTable ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Table...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Table
                </>
              )}
            </Button>
          </div>

          {/* Tables List */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Available Tables</h2>
            
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-white" />
              </div>
            ) : tables.length === 0 ? (
              <div className="bg-slate-800 rounded-lg p-12 text-center">
                <p className="text-gray-400 mb-4">No tables available</p>
                <p className="text-sm text-gray-500">Create a table to start playing!</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {tables.map((table) => {
                  const playerCount = table.playerCount || table.players?.length || 0
                  const maxPlayers = table.config?.maxPlayers || table.maxPlayers || 9
                  const smallBlind = table.config?.smallBlind || table.blinds?.small || 5
                  const bigBlind = table.config?.bigBlind || table.blinds?.big || 10
                  const status = playerCount === 0 ? 'waiting' : playerCount >= maxPlayers ? 'full' : 'playing'
                  
                  return (
                    <div key={table.id} className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-slate-600 transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-white mb-1">{table.name}</h3>
                          <div className="flex items-center gap-4 text-sm text-gray-400">
                            <span>Blinds: ${smallBlind}/${bigBlind}</span>
                            <span className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {playerCount}/{maxPlayers} players
                            </span>
                            <span className={`px-2 py-1 rounded text-xs uppercase font-semibold ${
                              status === 'waiting' ? 'bg-green-600 text-white' :
                              status === 'playing' ? 'bg-yellow-600 text-white' : 
                              'bg-red-600 text-white'
                            }`}>
                              {status}
                            </span>
                          </div>
                        </div>
                        <Button
                          onClick={() => handleJoinTable(table.id)}
                          disabled={status === 'full'}
                          variant={status === 'full' ? 'outline' : 'default'}
                          className={status === 'full' ? 'text-gray-400' : 'bg-blue-600 hover:bg-blue-700'}
                        >
                          <Play className="w-4 h-4 mr-2" />
                          {status === 'full' ? 'Table Full' : 'Join Table'}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}