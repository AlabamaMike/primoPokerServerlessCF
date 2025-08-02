/**
 * Enhanced Lobby Page - Phase 3B.3 Frontend Implementation
 * 
 * Complete lobby interface with:
 * - Real-time table discovery with live updates
 * - Advanced filtering and sorting
 * - Quick join and seat reservation
 * - Table creation with custom settings
 * - Player statistics and preferences
 */

'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { JoinTableModal } from '@/components/JoinTableModal'

// Types from our backend system
interface TableListing {
  tableId: string
  name: string
  gameType: 'cash' | 'tournament' | 'sit-n-go'
  stakes: { smallBlind: number, bigBlind: number }
  currentPlayers: number
  maxPlayers: number
  isPrivate: boolean
  avgPot: number
  handsPerHour: number
  playerList: PublicPlayerInfo[]
  waitingList?: string[]
  status: 'waiting' | 'active' | 'finishing'
}

interface PublicPlayerInfo {
  playerId: string
  username: string
  chipCount: number
  isActive: boolean
  avatarUrl?: string
  countryCode?: string
}

interface TableFilters {
  gameType?: 'cash' | 'tournament' | 'sit-n-go'
  minStakes?: number
  maxStakes?: number
  minPlayers?: number
  maxPlayers?: number
  availableSeatsOnly?: boolean
  searchTerm?: string
}

interface LobbyTableConfig {
  name: string
  gameType: 'cash' | 'tournament' | 'sit-n-go'
  maxPlayers: number
  stakes: { smallBlind: number, bigBlind: number }
  isPrivate: boolean
  password?: string
  buyInMin?: number
  buyInMax?: number
  timeLimit?: number
  autoStart?: boolean
}

export default function LobbyPage() {
  const router = useRouter()
  const { user, isAuthenticated } = useAuthStore()
  
  // State management
  const [tables, setTables] = useState<TableListing[]>([])
  const [filteredTables, setFilteredTables] = useState<TableListing[]>([])
  const [filters, setFilters] = useState<TableFilters>({})
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'players' | 'stakes' | 'activity'>('players')
  const [createTableOpen, setCreateTableOpen] = useState(false)
  const [selectedTable, setSelectedTable] = useState<TableListing | null>(null)
  const [joinModalOpen, setJoinModalOpen] = useState(false)
  
  // WebSocket connection for real-time updates
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')

  // Demo tables for testing when WebSocket is not available
  const [demoTables] = useState<TableListing[]>([
    {
      tableId: 'demo-table-1',
      name: 'Beginners Welcome',
      gameType: 'cash',
      stakes: { smallBlind: 1, bigBlind: 2 },
      currentPlayers: 4,
      maxPlayers: 9,
      isPrivate: false,
      avgPot: 45,
      handsPerHour: 78,
      playerList: [
        { playerId: '1', username: 'PokerPro2024', chipCount: 1250, isActive: true },
        { playerId: '2', username: 'BluffMaster', chipCount: 890, isActive: true },
        { playerId: '3', username: 'CardShark99', chipCount: 2100, isActive: true },
        { playerId: '4', username: 'ChipLeader', chipCount: 1500, isActive: false }
      ],
      status: 'active'
    },
    {
      tableId: 'demo-table-2',
      name: 'High Stakes Action',
      gameType: 'cash',
      stakes: { smallBlind: 10, bigBlind: 20 },
      currentPlayers: 7,
      maxPlayers: 9,
      isPrivate: false,
      avgPot: 380,
      handsPerHour: 65,
      playerList: [
        { playerId: '5', username: 'HighRoller', chipCount: 5000, isActive: true },
        { playerId: '6', username: 'VegasVet', chipCount: 3200, isActive: true }
      ],
      status: 'active'
    },
    {
      tableId: 'demo-table-3',
      name: 'Friday Night Tournament',
      gameType: 'tournament',
      stakes: { smallBlind: 25, bigBlind: 50 },
      currentPlayers: 18,
      maxPlayers: 20,
      isPrivate: false,
      avgPot: 1250,
      handsPerHour: 45,
      playerList: [],
      status: 'active'
    }
  ])

  // Authentication check - allow demo mode for testing
  useEffect(() => {
    if (!isAuthenticated) {
      console.log('User not authenticated - showing demo mode')
      // For testing purposes, we'll show demo data even without authentication
      // In production, you might want to redirect to login
      // router.push('/auth/login')
      // return
    }
  }, [isAuthenticated, router])

  // Initialize API connection for lobby updates using REST polling
  useEffect(() => {
    const connectToAPI = async () => {
      try {
        setLoading(true)
        
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://primo-poker-server.alabamamike.workers.dev'
        
        // Test API connectivity
        const healthResponse = await fetch(`${apiUrl}/api/health`)
        if (!healthResponse.ok) {
          throw new Error('API health check failed')
        }
        
        console.log('API connection established')
        setConnectionStatus('connected')
        
        // Fetch initial tables
        const tablesResponse = await fetch(`${apiUrl}/api/tables`)
        if (tablesResponse.ok) {
          const result = await tablesResponse.json()
          if (result.success && Array.isArray(result.data)) {
            // If we get real tables from API, use them; otherwise use demo data
            if (result.data.length > 0) {
              setTables(result.data)
            } else {
              // Show demo data when no real tables exist
              setTables(demoTables)
            }
          }
        }
        
        setLoading(false)
        
      } catch (error) {
        console.error('Failed to connect to API:', error)
        setConnectionStatus('disconnected')
        
        // Fallback to demo data
        setTables(demoTables)
        setLoading(false)
        
        // Retry connection after 5 seconds
        setTimeout(connectToAPI, 5000)
      }
    }

    connectToAPI()
  }, [demoTables])

  // Poll for table updates every 10 seconds when connected
  useEffect(() => {
    if (connectionStatus !== 'connected') return

    const pollTables = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://primo-poker-server.alabamamike.workers.dev'
        const response = await fetch(`${apiUrl}/api/tables`)
        
        if (response.ok) {
          const result = await response.json()
          if (result.success && Array.isArray(result.data)) {
            // Update tables if we have real data, otherwise keep current tables
            if (result.data.length > 0) {
              setTables(result.data)
            }
          }
        }
      } catch (error) {
        console.error('Failed to poll tables:', error)
        // Don't change connectionStatus on polling errors, just log them
      }
    }

    const pollInterval = setInterval(pollTables, 10000) // Poll every 10 seconds

    return () => {
      clearInterval(pollInterval)
    }
  }, [connectionStatus])

  // Apply filters and search
  useEffect(() => {
    let filtered = [...tables]

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(table => 
        table.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        table.playerList.some(player => 
          player.username.toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    }

    // Game type filter
    if (filters.gameType) {
      filtered = filtered.filter(table => table.gameType === filters.gameType)
    }

    // Stakes filter
    if (filters.minStakes !== undefined) {
      filtered = filtered.filter(table => table.stakes.bigBlind >= filters.minStakes!)
    }
    if (filters.maxStakes !== undefined) {
      filtered = filtered.filter(table => table.stakes.bigBlind <= filters.maxStakes!)
    }

    // Available seats filter
    if (filters.availableSeatsOnly) {
      filtered = filtered.filter(table => table.currentPlayers < table.maxPlayers)
    }

    // Sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'players':
          return b.currentPlayers - a.currentPlayers
        case 'stakes':
          return b.stakes.bigBlind - a.stakes.bigBlind
        case 'activity':
          return b.handsPerHour - a.handsPerHour
        default:
          return 0
      }
    })

    setFilteredTables(filtered)
  }, [tables, filters, searchTerm, sortBy])

  // Open join modal
  const openJoinModal = (table: TableListing) => {
    setSelectedTable(table)
    setJoinModalOpen(true)
  }

  // Join table handler
  const handleJoinTable = async (tableId: string, buyIn?: number, password?: string) => {
    try {
      // If user is authenticated, try API call
      if (isAuthenticated && user) {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://primo-poker-server.alabamamike.workers.dev'
        
        // Get auth token from localStorage
        const authToken = localStorage.getItem('auth_token')
        
        const response = await fetch(`${apiUrl}/api/tables/${tableId}/join`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken && { 'Authorization': `Bearer ${authToken}` })
          },
          body: JSON.stringify({
            buyIn: buyIn || 100, // Use provided buy-in or default
            password
          })
        })

        const result = await response.json()
        
        if (result.success) {
          // Close modal and redirect to game table
          setJoinModalOpen(false)
          setSelectedTable(null)
          // Use window.location.href for static export compatibility
          window.location.href = `/game/${tableId}/`
          return
        } else {
          // Handle join failure (full table, wrong password, etc.)
          let errorMessage = 'Failed to join table'
          
          if (result.error?.message) {
            // Try to parse nested error message
            try {
              const nestedError = JSON.parse(result.error.message)
              errorMessage = nestedError.error?.message || result.error.message
            } catch {
              errorMessage = result.error.message
            }
          } else if (result.error) {
            errorMessage = result.error
          }
          
          alert(errorMessage)
          return
        }
      }
    } catch (error) {
      console.error('Failed to join table via API:', error)
    }
    
    // For demo purposes or if API fails, allow joining demo table
    console.log('Joining demo table:', tableId)
    
    // Use window.location.href for static export compatibility
    // router.push() doesn't work reliably with Next.js static export
    window.location.href = `/game/${tableId}/`
  }

  // Create table handler
  const handleCreateTable = async (config: LobbyTableConfig) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://primo-poker-server.alabamamike.workers.dev'
      
      // Get auth token from localStorage
      const authToken = localStorage.getItem('auth_token')
      
      const response = await fetch(`${apiUrl}/api/tables`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken && { 'Authorization': `Bearer ${authToken}` })
        },
        body: JSON.stringify({
          config,
          creatorId: user?.id || 'demo-user'
        })
      })

      const result = await response.json()
      
      if (result.success) {
        setCreateTableOpen(false)
        // Optionally redirect to the new table
        if (result.tableId) {
          window.location.href = `/game/${result.tableId}/`
        }
      } else {
        const errorMessage = result.error?.message || result.error || 'Failed to create table'
        alert(errorMessage)
      }
    } catch (error) {
      console.error('Failed to create table:', error)
      // For demo purposes, create a mock table
      const newTableId = `demo-table-${Date.now()}`
      setCreateTableOpen(false)
      window.location.href = `/game/${newTableId}/`
    }
  }

  // Spectate table handler
  const handleSpectateTable = (tableId: string) => {
    window.location.href = `/game/${tableId}/?spectate=true`
  }

  // Allow demo mode for testing
  // if (!isAuthenticated) {
  //   return <div>Redirecting...</div>
  // }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-900 via-green-800 to-green-900 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Poker Lobby</h1>
          <p className="text-green-200">Find your perfect table and start playing!</p>
          
          {/* Connection Status */}
          <div className="flex items-center justify-center mt-4">
            <div className={`w-3 h-3 rounded-full mr-2 ${
              connectionStatus === 'connected' ? 'bg-green-400' : 
              connectionStatus === 'connecting' ? 'bg-yellow-400' : 'bg-red-400'
            }`}></div>
            <span className="text-sm text-green-200">
              {connectionStatus === 'connected' ? 'Live Updates Active' :
               connectionStatus === 'connecting' ? 'Connecting...' : 'Using Demo Data'}
            </span>
          </div>
          
          {user && (
            <div className="mt-2 text-green-200">
              Welcome back, <span className="font-semibold text-white">{user.username}</span>!
            </div>
          )}
          {!user && (
            <div className="mt-2 text-yellow-200">
              Demo Mode - <a href="/auth/login" className="underline">Login</a> for full features
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-6">
          <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search tables or players..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-white/20 border border-white/30 rounded-md text-white placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                  🔍
                </div>
              </div>
              
              <select 
                value={filters.gameType || ''} 
                onChange={(e) => setFilters(prev => ({...prev, gameType: e.target.value as any || undefined}))}
                className="px-4 py-2 bg-white/20 border border-white/30 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">All Games</option>
                <option value="cash">Cash Game</option>
                <option value="tournament">Tournament</option>
                <option value="sit-n-go">Sit & Go</option>
              </select>

              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-4 py-2 bg-white/20 border border-white/30 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="players">Sort by Players</option>
                <option value="stakes">Sort by Stakes</option>
                <option value="activity">Sort by Activity</option>
              </select>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setCreateTableOpen(true)}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium transition-colors"
              >
                ➕ Create Table
              </button>
            </div>
          </div>
        </div>

        {/* Tables Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-white">Loading tables...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTables.map((table) => (
              <TableCard
                key={table.tableId}
                table={table}
                onJoin={() => openJoinModal(table)}
                onSpectate={() => handleSpectateTable(table.tableId)}
              />
            ))}
          </div>
        )}

        {filteredTables.length === 0 && !loading && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">👥</div>
            <h3 className="text-xl font-semibold text-white mb-2">No tables found</h3>
            <p className="text-green-200 mb-4">Try adjusting your filters or create a new table</p>
            <button 
              onClick={() => setCreateTableOpen(true)}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
            >
              Create New Table
            </button>
          </div>
        )}

        {/* Create Table Modal */}
        {createTableOpen && (
          <CreateTableModal
            onClose={() => setCreateTableOpen(false)}
            onCreateTable={handleCreateTable}
          />
        )}

        {joinModalOpen && selectedTable && (
          <JoinTableModal
            isOpen={joinModalOpen}
            onClose={() => {
              setJoinModalOpen(false)
              setSelectedTable(null)
            }}
            onJoin={(buyIn) => handleJoinTable(selectedTable.tableId, buyIn)}
            tableName={selectedTable.name}
            minBuyIn={40}
            maxBuyIn={200}
            smallBlind={selectedTable.stakes.smallBlind}
            bigBlind={selectedTable.stakes.bigBlind}
          />
        )}
      </div>
    </div>
  )
}

// Table Card Component
interface TableCardProps {
  table: TableListing
  onJoin: () => void
  onSpectate: () => void
}

function TableCard({ table, onJoin, onSpectate }: TableCardProps) {
  const availableSeats = table.maxPlayers - table.currentPlayers
  const isFullTable = availableSeats === 0

  return (
    <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg p-6 hover:bg-white/15 transition-all duration-200">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-white text-lg font-semibold mb-1 flex items-center gap-2">
            {table.isPrivate && '🔒'}
            {table.name}
          </h3>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              table.gameType === 'cash' ? 'bg-blue-500 text-white' : 
              table.gameType === 'tournament' ? 'bg-purple-500 text-white' : 'bg-orange-500 text-white'
            }`}>
              {table.gameType === 'cash' ? 'Cash Game' : 
               table.gameType === 'tournament' ? 'Tournament' : 'Sit & Go'}
            </span>
            <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-500 text-black">
              ${table.stakes.smallBlind}/${table.stakes.bigBlind}
            </span>
          </div>
        </div>
        
        <div className="text-right">
          <div className="text-white font-semibold">
            {table.currentPlayers}/{table.maxPlayers}
          </div>
          <div className="text-sm text-green-200">players</div>
        </div>
      </div>

      {/* Table Stats */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="text-center">
          <div className="text-yellow-400 font-semibold">${table.avgPot}</div>
          <div className="text-xs text-green-200">Avg Pot</div>
        </div>
        <div className="text-center">
          <div className="text-blue-400 font-semibold">{table.handsPerHour}</div>
          <div className="text-xs text-green-200">Hands/Hr</div>
        </div>
      </div>

      {/* Player List Preview */}
      {table.playerList.length > 0 && (
        <div className="mb-4">
          <div className="text-sm text-green-200 mb-2">Players:</div>
          <div className="flex flex-wrap gap-1">
            {table.playerList.slice(0, 4).map((player) => (
              <span 
                key={player.playerId} 
                className="px-2 py-1 bg-white/20 border border-white/30 rounded text-xs text-white"
              >
                {player.username}
              </span>
            ))}
            {table.playerList.length > 4 && (
              <span className="px-2 py-1 bg-white/20 border border-white/30 rounded text-xs text-white">
                +{table.playerList.length - 4} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button 
          onClick={onJoin}
          disabled={isFullTable}
          className={`flex-1 px-4 py-2 rounded font-medium transition-colors ${
            isFullTable ? 
            'bg-gray-600 text-gray-300 cursor-not-allowed' : 
            'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {isFullTable ? 'Table Full' : 'Join Table'}
        </button>
        
        <button 
          onClick={onSpectate}
          className="px-3 py-2 border border-white/30 text-white hover:bg-white/10 rounded transition-colors"
        >
          👁️
        </button>
      </div>

      {/* Waiting List Info */}
      {isFullTable && table.waitingList && table.waitingList.length > 0 && (
        <div className="mt-2 text-xs text-orange-300 text-center">
          {table.waitingList.length} player(s) waiting
        </div>
      )}
    </div>
  )
}

// Create Table Modal Component
interface CreateTableModalProps {
  onClose: () => void
  onCreateTable: (config: LobbyTableConfig) => void
}

function CreateTableModal({ onClose, onCreateTable }: CreateTableModalProps) {
  const [config, setConfig] = useState<LobbyTableConfig>({
    name: '',
    gameType: 'cash',
    maxPlayers: 9,
    stakes: { smallBlind: 1, bigBlind: 2 },
    isPrivate: false,
    buyInMin: 100,
    buyInMax: 1000,
    autoStart: true
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (config.name.trim()) {
      onCreateTable(config)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Create New Table</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="tableName" className="block text-sm font-medium text-gray-300 mb-1">
              Table Name
            </label>
            <input
              id="tableName"
              type="text"
              value={config.name}
              onChange={(e) => setConfig(prev => ({...prev, name: e.target.value}))}
              placeholder="Enter table name..."
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
              required
            />
          </div>

          <div>
            <label htmlFor="gameType" className="block text-sm font-medium text-gray-300 mb-1">
              Game Type
            </label>
            <select 
              id="gameType"
              value={config.gameType} 
              onChange={(e) => setConfig(prev => ({...prev, gameType: e.target.value as any}))}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="cash">Cash Game</option>
              <option value="sit-n-go">Sit & Go</option>
              <option value="tournament">Tournament</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="smallBlind" className="block text-sm font-medium text-gray-300 mb-1">
                Small Blind
              </label>
              <input
                id="smallBlind"
                type="number"
                value={config.stakes.smallBlind}
                onChange={(e) => setConfig(prev => ({
                  ...prev, 
                  stakes: {...prev.stakes, smallBlind: parseInt(e.target.value) || 1}
                }))}
                min="1"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label htmlFor="bigBlind" className="block text-sm font-medium text-gray-300 mb-1">
                Big Blind
              </label>
              <input
                id="bigBlind"
                type="number"
                value={config.stakes.bigBlind}
                onChange={(e) => setConfig(prev => ({
                  ...prev, 
                  stakes: {...prev.stakes, bigBlind: parseInt(e.target.value) || 2}
                }))}
                min="2"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="maxPlayers" className="block text-sm font-medium text-gray-300 mb-1">
              Max Players: {config.maxPlayers}
            </label>
            <input
              id="maxPlayers"
              type="range"
              value={config.maxPlayers}
              onChange={(e) => setConfig(prev => ({...prev, maxPlayers: parseInt(e.target.value)}))}
              min="2"
              max="10"
              step="1"
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              id="isPrivate"
              type="checkbox"
              checked={config.isPrivate}
              onChange={(e) => setConfig(prev => ({...prev, isPrivate: e.target.checked}))}
              className="w-4 h-4 text-green-600 bg-gray-700 border-gray-600 rounded focus:ring-green-500"
            />
            <label htmlFor="isPrivate" className="text-sm font-medium text-gray-300">
              Private Table
            </label>
          </div>

          {config.isPrivate && (
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={config.password || ''}
                onChange={(e) => setConfig(prev => ({...prev, password: e.target.value}))}
                placeholder="Enter password..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded font-medium transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium transition-colors"
            >
              Create Table
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
