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

export default function LobbyPageSimple() {
  const router = useRouter()
  const { user, isAuthenticated } = useAuthStore()
  const { isConnected, error, tables, createTable, joinTable } = useTableWebSocket()
  const [isLoading, setIsLoading] = useState(false)

  // Demo tables for when WebSocket is not connected
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
    } finally {
      setIsLoading(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-emerald-900 flex items-center justify-center">
        <div className="text-white text-center">
          <h1 className="text-2xl font-bold mb-4">Authentication Required</h1>
          <p>Please log in to access the lobby.</p>
        </div>
      </div>
    )
  }

  const activeTables = isConnected ? tables : demoTables

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-emerald-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">🃏 Poker Lobby</h1>
            <p className="text-green-200">Welcome back, {user?.username}!</p>
          </div>
          
          {/* Connection Status & Actions */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-800/50">
              {isConnected ? (
                <>
                  <Wifi className="w-4 h-4 text-green-300" />
                  <span className="text-sm text-green-300">Live</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-yellow-300" />
                  <span className="text-sm text-yellow-300">Demo Mode</span>
                </>
              )}
            </div>
            
            <Button
              onClick={handleCreateTable}
              disabled={isLoading}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Table
            </Button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-600 rounded-lg">
            <p className="text-red-200">Connection Error: {error}</p>
            <p className="text-sm text-red-300 mt-1">Running in demo mode with sample tables.</p>
          </div>
        )}

        {/* Tables List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {activeTables.map((table) => (
            <div key={table.id} className="bg-green-800/30 border border-green-600/30 rounded-lg p-6 hover:border-green-500/50 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-white">{table.name}</h3>
                <span
                  className={`px-3 py-1 rounded-full text-xs uppercase font-semibold ${
                    table.status === 'waiting' ? 'bg-green-500 text-white' :
                    table.status === 'playing' ? 'bg-yellow-500 text-black' : 
                    'bg-red-500 text-white'
                  }`}
                >
                  {table.status}
                </span>
              </div>
              
              <div className="flex items-center justify-between mb-4">
                <div className="text-green-200">
                  <p>Blinds: ${table.blinds.small}/${table.blinds.big}</p>
                  <p className="flex items-center gap-2 mt-1">
                    <Users className="w-4 h-4" />
                    {table.players}/{table.maxPlayers} players
                  </p>
                </div>
                
                <div className="w-24 bg-green-900 rounded-full h-3">
                  <div 
                    className="bg-gradient-to-r from-green-400 to-emerald-400 h-3 rounded-full transition-all"
                    style={{ width: `${(table.players / table.maxPlayers) * 100}%` }}
                  />
                </div>
              </div>
              
              <Button
                onClick={() => handleJoinTable(table.id)}
                disabled={isLoading || table.status === 'full'}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                <Play className="w-4 h-4 mr-2" />
                {table.status === 'full' ? 'Table Full' : 'Join Table'}
              </Button>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-green-800/30 border border-green-600/30 rounded-lg p-6 text-center">
            <h3 className="font-semibold text-white mb-2">Practice Mode</h3>
            <p className="text-green-200 text-sm mb-4">Play against AI opponents to improve your skills</p>
            <Button 
              onClick={() => router.push('/demo/table')}
              className="w-full bg-green-700 hover:bg-green-600 text-white"
            >
              Start Practice
            </Button>
          </div>
          
          <div className="bg-green-800/30 border border-green-600/30 rounded-lg p-6 text-center">
            <h3 className="font-semibold text-white mb-2">Full Multiplayer</h3>
            <p className="text-green-200 text-sm mb-4">Access advanced multiplayer features</p>
            <Button 
              onClick={() => router.push('/multiplayer')}
              className="w-full bg-green-700 hover:bg-green-600 text-white"
            >
              Enter Multiplayer
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
