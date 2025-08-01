'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useTableWebSocket } from '@/hooks/useWebSocket'
import { Button } from '@/components/ui/button'
import { Users, Play, Plus, Wifi, WifiOff } from 'lucide-react'

interface LiveTable {
  id: string
  name: string
  players: number
  maxPlayers: number
  blinds: {
    small: number
    big: number
  }
  status: 'waiting' | 'playing' | 'full'
}

export default function MultiplayerLobby() {
  const router = useRouter()
  const { user, isAuthenticated } = useAuthStore()
  const { isConnected, error, tables, createTable, joinTable } = useTableWebSocket()
  const [isLoading, setIsLoading] = useState(false)

  // Demo tables for development
  const [demoTables] = useState<LiveTable[]>([
    {
      id: 'table-1',
      name: 'Beginners Table',
      players: 3,
      maxPlayers: 9,
      blinds: { small: 5, big: 10 },
      status: 'waiting'
    },
    {
      id: 'table-2', 
      name: 'High Stakes',
      players: 6,
      maxPlayers: 9,
      blinds: { small: 25, big: 50 },
      status: 'playing'
    },
    {
      id: 'table-3',
      name: 'Tournament Final',
      players: 9,
      maxPlayers: 9,
      blinds: { small: 100, big: 200 },
      status: 'full'
    }
  ])

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login')
    }
  }, [isAuthenticated, router])

  const handleCreateTable = async () => {
    setIsLoading(true)
    try {
      const config = {
        name: `${user?.username}'s Table`,
        maxPlayers: 9,
        blinds: { small: 5, big: 10 },
        buyIn: 1000
      }
      
      if (isConnected) {
        createTable(config)
      } else {
        // Fallback to demo mode
        router.push('/demo/table')
      }
    } catch (error) {
      console.error('Failed to create table:', error)
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
        // Fallback to demo mode
        router.push('/demo/table')
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

  const activeTables = isConnected ? tables : demoTables

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
                  <WifiOff className="w-4 h-4 text-orange-400" />
                  <span className="text-sm text-orange-400">Demo Mode</span>
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
            <p className="text-sm text-red-400 mt-1">Running in demo mode with sample tables.</p>
          </div>
        )}

        {/* Tables Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activeTables.map((table) => (
            <div key={table.id} className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-slate-600 transition-colors">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-semibold text-white">{table.name}</h3>
                  <span
                    className={`px-2 py-1 rounded text-xs uppercase font-semibold ${
                      table.status === 'waiting' ? 'bg-green-600 text-white' :
                      table.status === 'playing' ? 'bg-yellow-600 text-white' : 
                      'bg-red-600 text-white'
                    }`}
                  >
                    {table.status}
                  </span>
                </div>
                <p className="text-slate-400">
                  Blinds: ${table.blinds.small}/${table.blinds.big}
                </p>
              </div>
              
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-slate-300">
                    <Users className="w-4 h-4" />
                    <span>{table.players}/{table.maxPlayers} players</span>
                  </div>
                  
                  <div className="w-20 bg-slate-700 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-yellow-400 to-orange-500 h-2 rounded-full transition-all"
                      style={{ width: `${(table.players / table.maxPlayers) * 100}%` }}
                    />
                  </div>
                </div>
                
                <Button
                  onClick={() => handleJoinTable(table.id)}
                  disabled={isLoading || table.status === 'full'}
                  className="w-full bg-slate-700 hover:bg-slate-600 border-slate-600"
                  variant="outline"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {table.status === 'full' ? 'Table Full' : 'Join Table'}
                </Button>
              </div>
            </div>
          ))}
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
