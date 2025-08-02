/**
 * Professional Poker Room Lobby
 * 
 * Features:
 * - Dark theme professional design
 * - Game type tabs (Cash Games, Tournaments, Sit & Go)
 * - Advanced filtering sidebar
 * - Table data grid with real-time updates
 * - Table preview panel with seat visualization
 * - Quick seat functionality
 */

'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { JoinTableModal } from '@/components/JoinTableModal'

// Types
interface TableListing {
  tableId: string
  name: string
  gameType: 'cash' | 'tournament' | 'sit-n-go'
  gameVariant?: 'nlh' | 'plo' | 'plo5' | 'stud'
  stakes: { smallBlind: number, bigBlind: number }
  currentPlayers: number
  maxPlayers: number
  isPrivate: boolean
  avgPot: number
  handsPerHour: number
  playerList: PublicPlayerInfo[]
  waitingList?: string[]
  status: 'waiting' | 'active' | 'finishing'
  minBuyIn?: number
  maxBuyIn?: number
  speed?: 'regular' | 'fast' | 'zoom'
  playersToFlop?: number
}

interface PublicPlayerInfo {
  playerId: string
  username: string
  chipCount: number
  isActive: boolean
  avatarUrl?: string
  countryCode?: string
  position?: {
    seat: number
    seatName?: string
  }
}

interface TableFilters {
  gameVariant: string[]
  minStakes?: number
  maxStakes?: number
  tableSize: string[]
  speed: string[]
}

type GameTab = 'cash' | 'tournaments' | 'sit-n-go' | 'spin-n-go' | 'home'

export default function LobbyPage() {
  const router = useRouter()
  const { user, isAuthenticated, logout } = useAuthStore()
  
  // State
  const [activeTab, setActiveTab] = useState<GameTab>('cash')
  const [tables, setTables] = useState<TableListing[]>([])
  const [filteredTables, setFilteredTables] = useState<TableListing[]>([])
  const [filters, setFilters] = useState<TableFilters>({
    gameVariant: ['nlh'],
    tableSize: ['6max', '9max'],
    speed: ['regular']
  })
  const [loading, setLoading] = useState(true)
  const [selectedTable, setSelectedTable] = useState<TableListing | null>(null)
  const [joinModalOpen, setJoinModalOpen] = useState(false)
  const [createTableOpen, setCreateTableOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'tile'>('list')
  
  // Connection status
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')

  // Demo tables
  const demoTables: TableListing[] = [
    {
      tableId: 'demo-1',
      name: 'Bellagio IV',
      gameType: 'cash',
      gameVariant: 'nlh',
      stakes: { smallBlind: 0.5, bigBlind: 1 },
      currentPlayers: 5,
      maxPlayers: 6,
      isPrivate: false,
      avgPot: 24.50,
      handsPerHour: 62,
      playerList: [
        { playerId: '1', username: 'ProPlayer123', chipCount: 248.50, isActive: true, position: { seat: 1, seatName: 'BTN' } },
        { playerId: '2', username: 'FishCatcher', chipCount: 100.00, isActive: true, position: { seat: 2, seatName: 'CO' } },
        { playerId: '3', username: 'Reg_Grinder', chipCount: 187.25, isActive: true, position: { seat: 3, seatName: 'HJ' } },
        { playerId: '4', username: 'Lucky777', chipCount: 95.00, isActive: true, position: { seat: 4, seatName: 'UTG' } },
        { playerId: '5', username: 'SharkBait', chipCount: 320.75, isActive: false, position: { seat: 5, seatName: 'BB' } }
      ],
      status: 'active',
      minBuyIn: 50,
      maxBuyIn: 200,
      speed: 'regular',
      playersToFlop: 42
    },
    {
      tableId: 'demo-2',
      name: 'Vegas Dreams',
      gameType: 'cash',
      gameVariant: 'nlh',
      stakes: { smallBlind: 1, bigBlind: 2 },
      currentPlayers: 8,
      maxPlayers: 9,
      isPrivate: false,
      avgPot: 47.20,
      handsPerHour: 58,
      playerList: [],
      status: 'active',
      minBuyIn: 100,
      maxBuyIn: 400,
      speed: 'regular'
    },
    {
      tableId: 'demo-3',
      name: 'Monte Carlo',
      gameType: 'cash',
      gameVariant: 'nlh',
      stakes: { smallBlind: 0.25, bigBlind: 0.50 },
      currentPlayers: 6,
      maxPlayers: 6,
      isPrivate: false,
      avgPot: 18.75,
      handsPerHour: 84,
      playerList: [],
      waitingList: ['player1', 'player2'],
      status: 'active',
      minBuyIn: 25,
      maxBuyIn: 100,
      speed: 'fast'
    },
    {
      tableId: 'demo-4',
      name: 'Rio Grande',
      gameType: 'cash',
      gameVariant: 'plo',
      stakes: { smallBlind: 0.5, bigBlind: 1 },
      currentPlayers: 4,
      maxPlayers: 6,
      isPrivate: false,
      avgPot: 38.90,
      handsPerHour: 55,
      playerList: [],
      status: 'active',
      minBuyIn: 50,
      maxBuyIn: 200,
      speed: 'regular'
    },
    {
      tableId: 'demo-5',
      name: 'Atlantic City',
      gameType: 'cash',
      gameVariant: 'nlh',
      stakes: { smallBlind: 0.10, bigBlind: 0.25 },
      currentPlayers: 7,
      maxPlayers: 9,
      isPrivate: false,
      avgPot: 8.40,
      handsPerHour: 71,
      playerList: [],
      status: 'active',
      minBuyIn: 10,
      maxBuyIn: 50,
      speed: 'regular'
    },
    {
      tableId: 'demo-6',
      name: 'Mirage',
      gameType: 'cash',
      gameVariant: 'nlh',
      stakes: { smallBlind: 0.25, bigBlind: 0.50 },
      currentPlayers: 127,
      maxPlayers: 999,
      isPrivate: false,
      avgPot: 15.20,
      handsPerHour: 240,
      playerList: [],
      status: 'active',
      minBuyIn: 25,
      maxBuyIn: 100,
      speed: 'zoom'
    }
  ]

  // Initialize API connection and fetch tables
  useEffect(() => {
    const fetchTables = async () => {
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
        
        // Fetch tables from API
        const tablesResponse = await fetch(`${apiUrl}/api/tables`)
        if (tablesResponse.ok) {
          const result = await tablesResponse.json()
          if (result.success && Array.isArray(result.data)) {
            // Map API response to our interface
            const apiTables = result.data.map((table: any) => ({
              tableId: table.id,
              name: table.name || `Table ${table.id}`,
              gameType: table.config?.gameType || 'cash',
              gameVariant: table.config?.gameVariant || 'nlh',
              stakes: {
                smallBlind: table.config?.stakes?.smallBlind || 1,
                bigBlind: table.config?.stakes?.bigBlind || 2
              },
              currentPlayers: table.players?.length || 0,
              maxPlayers: table.config?.maxPlayers || 9,
              isPrivate: table.config?.isPrivate || false,
              avgPot: table.stats?.avgPot || 0,
              handsPerHour: table.stats?.handsPerHour || 0,
              playerList: table.players || [],
              waitingList: table.waitingList || [],
              status: table.status || 'waiting',
              minBuyIn: table.config?.minBuyIn || 40,
              maxBuyIn: table.config?.maxBuyIn || 200,
              speed: table.config?.speed || 'regular'
            }))
            
            // Use API tables if available, otherwise show demo data
            setTables(apiTables.length > 0 ? apiTables : demoTables)
          } else {
            // Use demo data if no tables from API
            setTables(demoTables)
          }
        } else {
          // Use demo data on API error
          setTables(demoTables)
        }
      } catch (error) {
        console.error('Failed to fetch tables:', error)
        setConnectionStatus('disconnected')
        // Fallback to demo data
        setTables(demoTables)
      } finally {
        setLoading(false)
      }
    }

    fetchTables()
  }, [])

  // Poll for table updates when connected
  useEffect(() => {
    if (connectionStatus !== 'connected') return

    const pollTables = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://primo-poker-server.alabamamike.workers.dev'
        const response = await fetch(`${apiUrl}/api/tables`)
        
        if (response.ok) {
          const result = await response.json()
          if (result.success && Array.isArray(result.data)) {
            const apiTables = result.data.map((table: any) => ({
              tableId: table.id,
              name: table.name || `Table ${table.id}`,
              gameType: table.config?.gameType || 'cash',
              gameVariant: table.config?.gameVariant || 'nlh',
              stakes: {
                smallBlind: table.config?.stakes?.smallBlind || 1,
                bigBlind: table.config?.stakes?.bigBlind || 2
              },
              currentPlayers: table.players?.length || 0,
              maxPlayers: table.config?.maxPlayers || 9,
              isPrivate: table.config?.isPrivate || false,
              avgPot: table.stats?.avgPot || 0,
              handsPerHour: table.stats?.handsPerHour || 0,
              playerList: table.players || [],
              waitingList: table.waitingList || [],
              status: table.status || 'waiting',
              minBuyIn: table.config?.minBuyIn || 40,
              maxBuyIn: table.config?.maxBuyIn || 200,
              speed: table.config?.speed || 'regular'
            }))
            
            if (apiTables.length > 0) {
              setTables(apiTables)
            }
          }
        }
      } catch (error) {
        console.error('Failed to poll tables:', error)
      }
    }

    // Poll every 5 seconds
    const pollInterval = setInterval(pollTables, 5000)

    return () => clearInterval(pollInterval)
  }, [connectionStatus])

  // Apply filters
  useEffect(() => {
    let filtered = tables.filter(table => {
      // Filter by active tab
      if (activeTab === 'cash' && table.gameType !== 'cash') return false
      if (activeTab === 'tournaments' && table.gameType !== 'tournament') return false
      if (activeTab === 'sit-n-go' && table.gameType !== 'sit-n-go') return false
      
      // Filter by game variant
      if (filters.gameVariant.length > 0 && table.gameVariant && !filters.gameVariant.includes(table.gameVariant)) {
        return false
      }
      
      // Filter by stakes
      if (filters.minStakes && table.stakes.bigBlind < filters.minStakes) return false
      if (filters.maxStakes && table.stakes.bigBlind > filters.maxStakes) return false
      
      // Filter by table size
      if (filters.tableSize.length > 0) {
        const tableSize = table.maxPlayers <= 2 ? 'hu' : table.maxPlayers <= 6 ? '6max' : '9max'
        if (!filters.tableSize.includes(tableSize)) return false
      }
      
      // Filter by speed
      if (filters.speed.length > 0 && table.speed && !filters.speed.includes(table.speed)) {
        return false
      }
      
      return true
    })
    
    setFilteredTables(filtered)
  }, [tables, filters, activeTab])

  // Handle filter changes
  const toggleFilter = (category: keyof TableFilters, value: string) => {
    setFilters(prev => {
      const array = prev[category] as string[]
      const newArray = array.includes(value) 
        ? array.filter(v => v !== value)
        : [...array, value]
      return { ...prev, [category]: newArray }
    })
  }

  // Handle table join
  const handleJoinTable = async (tableId: string, buyIn?: number) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://primo-poker-server.alabamamike.workers.dev'
      const authToken = localStorage.getItem('auth_token')
      
      // If authenticated, try to join via API
      if (authToken) {
        const response = await fetch(`${apiUrl}/api/tables/${tableId}/join`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({
            buyIn: buyIn || 100,
            seatPreference: null
          })
        })

        const result = await response.json()
        
        if (result.success) {
          // Successfully joined, redirect to table
          setJoinModalOpen(false)
          window.location.href = `/game/${tableId}/`
          return
        } else {
          // Handle errors
          let errorMessage = 'Failed to join table'
          
          if (result.error?.message) {
            errorMessage = result.error.message
          } else if (result.error) {
            errorMessage = result.error
          }
          
          // Check for auth errors
          if (errorMessage.includes('expired') || errorMessage.includes('unauthorized')) {
            alert('Your session has expired. Please log in again.')
            localStorage.removeItem('auth_token')
            window.location.href = '/auth/login'
            return
          }
          
          alert(errorMessage)
          return
        }
      }
    } catch (error) {
      console.error('Failed to join table:', error)
    }
    
    // For demo mode or if API fails, allow direct navigation
    setJoinModalOpen(false)
    window.location.href = `/game/${tableId}/`
  }

  // Quick seat functionality
  const handleQuickSeat = () => {
    const availableTables = filteredTables.filter(t => t.currentPlayers < t.maxPlayers)
    if (availableTables.length > 0) {
      const randomTable = availableTables[Math.floor(Math.random() * availableTables.length)]
      handleJoinTable(randomTable.tableId)
    }
  }

  // Handle create table
  const handleCreateTable = async (config: any) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://primo-poker-server.alabamamike.workers.dev'
      const authToken = localStorage.getItem('auth_token')
      
      // Map frontend config to backend TableConfig format
      const tableConfig = {
        name: config.name,
        gameType: 'texas_holdem', // Always Texas Hold'em for now
        bettingStructure: 'no_limit', // Always No Limit for now
        gameFormat: config.gameType === 'cash' ? 'cash' : config.gameType === 'tournament' ? 'tournament' : 'sit_n_go',
        maxPlayers: config.maxPlayers,
        minBuyIn: config.minBuyIn || config.stakes.bigBlind * 20,
        maxBuyIn: config.maxBuyIn || config.stakes.bigBlind * 200,
        smallBlind: config.stakes.smallBlind,
        bigBlind: config.stakes.bigBlind,
        ante: 0,
        timeBank: 30,
        isPrivate: config.isPrivate || false,
        password: config.password
      }
      
      console.log('Creating table with config:', tableConfig)
      
      const response = await fetch(`${apiUrl}/api/tables`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken && { 'Authorization': `Bearer ${authToken}` })
        },
        body: JSON.stringify(tableConfig)
      })

      const result = await response.json()
      console.log('Create table response:', result)
      
      if (result.success && result.data?.tableId) {
        setCreateTableOpen(false)
        // Redirect to the new table
        window.location.href = `/game/${result.data.tableId}/`
      } else {
        alert(result.error?.message || result.error || 'Failed to create table')
      }
    } catch (error) {
      console.error('Failed to create table:', error)
      alert('Failed to create table. Please try again.')
    }
  }

  // Table counts by type
  const tableCounts = {
    cash: tables.filter(t => t.gameType === 'cash').length,
    tournaments: tables.filter(t => t.gameType === 'tournament').length,
    'sit-n-go': tables.filter(t => t.gameType === 'sit-n-go').length,
    'spin-n-go': 24, // Mock count
    home: 0
  }

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white flex flex-col">
      {/* Header */}
      <header className="bg-[#2d2d2d] px-5 py-3 flex justify-between items-center border-b-2 border-[#3d3d3d]">
        <div className="text-2xl font-bold text-[#4CAF50]">PokerRoom Pro</div>
        <div className="flex items-center gap-5">
          <div className="bg-[#3d3d3d] px-4 py-2 rounded-full text-sm">
            Balance: <span className="text-[#4CAF50] font-bold">${user?.chipCount?.toFixed(2) || '1,234.56'}</span>
          </div>
          <button className="border border-[#4CAF50] text-[#4CAF50] px-4 py-2 rounded hover:bg-[#4CAF50] hover:text-white transition-colors">
            Cashier
          </button>
          <div className="w-8 h-8 bg-[#4CAF50] rounded-full flex items-center justify-center text-sm font-bold">
            {user?.username?.slice(0, 2).toUpperCase() || 'JD'}
          </div>
        </div>
      </header>

      {/* Game Type Tabs */}
      <div className="bg-[#252525] px-5 flex gap-0.5 border-b-[3px] border-[#3d3d3d]">
        {(['cash', 'tournaments', 'sit-n-go', 'spin-n-go', 'home'] as GameTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 text-sm font-medium transition-all relative ${
              activeTab === tab 
                ? 'bg-[#4CAF50] text-white' 
                : 'bg-[#2d2d2d] text-[#aaa] hover:bg-[#3d3d3d] hover:text-white'
            }`}
          >
            {tab.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
            {tableCounts[tab] > 0 && (
              <span className="ml-1.5 bg-[#ff5722] text-white rounded-full px-1.5 py-0.5 text-[11px]">
                {tableCounts[tab]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Filters Sidebar */}
        <aside className="w-[250px] bg-[#252525] p-5 overflow-y-auto border-r border-[#3d3d3d]">
          {/* Game Type Filter */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold mb-3 text-[#ddd] uppercase tracking-wider">Game Type</h3>
            {[
              { id: 'nlh', label: 'No Limit Hold\'em' },
              { id: 'plo', label: 'Pot Limit Omaha' },
              { id: 'plo5', label: '5 Card PLO' },
              { id: 'stud', label: '7 Card Stud' }
            ].map(game => (
              <label key={game.id} className="flex items-center mb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.gameVariant.includes(game.id)}
                  onChange={() => toggleFilter('gameVariant', game.id)}
                  className="mr-2"
                />
                <span className="text-sm text-[#bbb]">{game.label}</span>
              </label>
            ))}
          </div>

          {/* Stakes Filter */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold mb-3 text-[#ddd] uppercase tracking-wider">Stakes</h3>
            <div className="flex justify-between text-xs text-[#888] mb-2">
              <span>$0.01/$0.02</span>
              <span>$25/$50</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              defaultValue="30"
              className="w-full h-1 bg-[#3d3d3d] rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Table Size Filter */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold mb-3 text-[#ddd] uppercase tracking-wider">Table Size</h3>
            {[
              { id: 'hu', label: 'Heads-up' },
              { id: '6max', label: '6-max' },
              { id: '9max', label: '9-max' }
            ].map(size => (
              <label key={size.id} className="flex items-center mb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.tableSize.includes(size.id)}
                  onChange={() => toggleFilter('tableSize', size.id)}
                  className="mr-2"
                />
                <span className="text-sm text-[#bbb]">{size.label}</span>
              </label>
            ))}
          </div>

          {/* Table Speed Filter */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold mb-3 text-[#ddd] uppercase tracking-wider">Table Speed</h3>
            {[
              { id: 'regular', label: 'Regular' },
              { id: 'fast', label: 'Fast' },
              { id: 'zoom', label: 'Zoom' }
            ].map(speed => (
              <label key={speed.id} className="flex items-center mb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.speed.includes(speed.id)}
                  onChange={() => toggleFilter('speed', speed.id)}
                  className="mr-2"
                />
                <span className="text-sm text-[#bbb]">{speed.label}</span>
              </label>
            ))}
          </div>

          {/* Quick Seat Button */}
          <button
            onClick={handleQuickSeat}
            className="w-full bg-[#4CAF50] text-white py-3 rounded-md text-base font-semibold hover:bg-[#45a049] transition-colors"
          >
            Quick Seat
          </button>

          {/* Create Table Button */}
          <button
            onClick={() => setCreateTableOpen(true)}
            className="w-full mt-3 bg-[#2196F3] text-white py-3 rounded-md text-base font-semibold hover:bg-[#1976D2] transition-colors"
          >
            Create Table
          </button>
        </aside>

        {/* Table List Container */}
        <div className="flex-1 bg-[#1a1a1a] overflow-y-auto">
          {/* Table List Header */}
          <div className="bg-[#2d2d2d] px-5 py-3 flex justify-between items-center sticky top-0 z-10">
            <div className="text-sm text-[#888]">Showing {filteredTables.length} tables</div>
            <div className="flex gap-2.5">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded text-xs ${
                  viewMode === 'list' ? 'bg-[#4CAF50] text-white' : 'bg-[#3d3d3d] text-[#aaa]'
                }`}
              >
                List View
              </button>
              <button
                onClick={() => setViewMode('tile')}
                className={`px-3 py-1.5 rounded text-xs ${
                  viewMode === 'tile' ? 'bg-[#4CAF50] text-white' : 'bg-[#3d3d3d] text-[#aaa]'
                }`}
              >
                Tile View
              </button>
            </div>
          </div>

          {/* Table Grid */}
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4CAF50]"></div>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="bg-[#252525] px-3 py-3 text-left text-xs font-semibold text-[#888] uppercase tracking-wider sticky top-[53px] z-[5]">
                    Table Name
                  </th>
                  <th className="bg-[#252525] px-3 py-3 text-left text-xs font-semibold text-[#888] uppercase tracking-wider sticky top-[53px] z-[5]">
                    Stakes
                  </th>
                  <th className="bg-[#252525] px-3 py-3 text-left text-xs font-semibold text-[#888] uppercase tracking-wider sticky top-[53px] z-[5]">
                    Players
                  </th>
                  <th className="bg-[#252525] px-3 py-3 text-left text-xs font-semibold text-[#888] uppercase tracking-wider sticky top-[53px] z-[5]">
                    Avg Pot
                  </th>
                  <th className="bg-[#252525] px-3 py-3 text-left text-xs font-semibold text-[#888] uppercase tracking-wider sticky top-[53px] z-[5]">
                    H/Hour
                  </th>
                  <th className="bg-[#252525] px-3 py-3 text-left text-xs font-semibold text-[#888] uppercase tracking-wider sticky top-[53px] z-[5]">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTables.map(table => (
                  <tr
                    key={table.tableId}
                    onClick={() => setSelectedTable(table)}
                    className="cursor-pointer hover:bg-[#252525] transition-colors"
                  >
                    <td className="px-3 py-3.5 border-b border-[#2d2d2d]">
                      <div className="font-medium text-[#4CAF50]">{table.name}</div>
                      <div className="text-xs text-[#888]">
                        {table.gameVariant?.toUpperCase() || 'NL Hold\'em'} • {table.maxPlayers <= 6 ? '6-max' : '9-max'}
                        {table.speed && table.speed !== 'regular' && ` • ${table.speed.charAt(0).toUpperCase() + table.speed.slice(1)}`}
                      </div>
                    </td>
                    <td className="px-3 py-3.5 border-b border-[#2d2d2d] text-[#ffc107] font-medium">
                      ${table.stakes.smallBlind}/${table.stakes.bigBlind}
                    </td>
                    <td className="px-3 py-3.5 border-b border-[#2d2d2d]">
                      <div className="flex items-center gap-1.5">
                        <span>{table.speed === 'zoom' ? `Pool: ${table.currentPlayers}` : `${table.currentPlayers}/${table.maxPlayers}`}</span>
                        <div className="w-[60px] h-1.5 bg-[#3d3d3d] rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-[#4CAF50] transition-all duration-300"
                            style={{ width: `${(table.currentPlayers / table.maxPlayers) * 100}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 border-b border-[#2d2d2d] text-[#2196F3] font-medium">
                      ${table.avgPot.toFixed(2)}
                    </td>
                    <td className="px-3 py-3.5 border-b border-[#2d2d2d] text-[#888]">
                      {table.handsPerHour}
                    </td>
                    <td className="px-3 py-3.5 border-b border-[#2d2d2d]">
                      {table.waitingList && table.waitingList.length > 0 ? (
                        <button className="bg-[#ff9800] text-white px-4 py-1.5 rounded text-xs font-medium hover:bg-[#f57c00] transition-colors">
                          Wait List ({table.waitingList.length})
                        </button>
                      ) : table.speed === 'zoom' ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleJoinTable(table.tableId)
                          }}
                          className="bg-[#4CAF50] text-white px-4 py-1.5 rounded text-xs font-medium hover:bg-[#45a049] transition-colors"
                        >
                          Join Pool
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedTable(table)
                            setJoinModalOpen(true)
                          }}
                          className="bg-[#4CAF50] text-white px-4 py-1.5 rounded text-xs font-medium hover:bg-[#45a049] transition-colors"
                        >
                          Join Table
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Table Preview Panel */}
        {selectedTable && (
          <aside className="w-[300px] bg-[#252525] p-5 border-l border-[#3d3d3d] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4 text-[#4CAF50]">{selectedTable.name}</h2>
            
            {/* Table Info */}
            <div className="mb-5">
              {[
                { label: 'Game Type', value: selectedTable.gameVariant?.toUpperCase() || 'NL Hold\'em' },
                { label: 'Stakes', value: `$${selectedTable.stakes.smallBlind}/$${selectedTable.stakes.bigBlind}` },
                { label: 'Table Size', value: `${selectedTable.maxPlayers}-max` },
                { label: 'Avg Pot', value: `$${selectedTable.avgPot.toFixed(2)}` },
                { label: 'Players/Flop', value: `${selectedTable.playersToFlop || 42}%` },
                { label: 'Hands/Hour', value: selectedTable.handsPerHour }
              ].map(info => (
                <div key={info.label} className="flex justify-between mb-2.5 text-sm">
                  <span className="text-[#888]">{info.label}:</span>
                  <span className="text-white font-medium">{info.value}</span>
                </div>
              ))}
            </div>

            {/* Seat Map */}
            <h3 className="text-sm mb-3 text-[#ddd]">Table View</h3>
            <div className="bg-[#1a1a1a] rounded-[120px] p-10 relative h-[240px] mb-5">
              {Array.from({ length: selectedTable.maxPlayers <= 6 ? 6 : 9 }).map((_, index) => {
                const player = selectedTable.playerList.find(p => p.position?.seat === index + 1)
                const isOccupied = !!player
                
                // Calculate seat positions
                const angle = (index * 360) / (selectedTable.maxPlayers <= 6 ? 6 : 9) - 90
                const radius = 70
                const x = 50 + radius * Math.cos(angle * Math.PI / 180)
                const y = 50 + radius * Math.sin(angle * Math.PI / 180)
                
                return (
                  <div
                    key={index}
                    className={`absolute w-12 h-12 rounded-full flex items-center justify-center text-xs ${
                      isOccupied ? 'bg-[#4CAF50] text-white' : 'bg-[#3d3d3d] text-[#888]'
                    }`}
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      transform: 'translate(-50%, -50%)'
                    }}
                  >
                    {player?.position?.seatName || 'Empty'}
                  </div>
                )
              })}
            </div>

            {/* Player List */}
            <h3 className="text-sm mb-3 text-[#ddd]">Players</h3>
            <div className="bg-[#1a1a1a] p-3 rounded-md">
              {selectedTable.playerList.length > 0 ? (
                selectedTable.playerList.map(player => (
                  <div key={player.playerId} className="flex justify-between mb-2">
                    <span className={player.isActive ? 'text-[#4CAF50]' : 'text-white'}>
                      {player.username}
                    </span>
                    <span className="text-[#ffc107]">${player.chipCount.toFixed(2)}</span>
                  </div>
                ))
              ) : (
                <div className="text-[#888] text-center">No player data available</div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Join Modal */}
      {joinModalOpen && selectedTable && (
        <JoinTableModal
          isOpen={joinModalOpen}
          onClose={() => {
            setJoinModalOpen(false)
            setSelectedTable(null)
          }}
          onJoin={(buyIn) => handleJoinTable(selectedTable.tableId, buyIn)}
          tableName={selectedTable.name}
          minBuyIn={selectedTable.minBuyIn || 40}
          maxBuyIn={selectedTable.maxBuyIn || 200}
          smallBlind={selectedTable.stakes.smallBlind}
          bigBlind={selectedTable.stakes.bigBlind}
          maxPlayers={selectedTable.maxPlayers}
          currentPlayers={selectedTable.playerList.map(p => ({
            seat: p.position?.seat || 0,
            username: p.username,
            chipCount: p.chipCount
          }))}
        />
      )}

      {/* Create Table Modal */}
      {createTableOpen && (
        <CreateTableModal
          onClose={() => setCreateTableOpen(false)}
          onCreateTable={handleCreateTable}
        />
      )}
    </div>
  )
}

// Create Table Modal Component
interface CreateTableModalProps {
  onClose: () => void
  onCreateTable: (config: any) => void
}

function CreateTableModal({ onClose, onCreateTable }: CreateTableModalProps) {
  const [config, setConfig] = useState({
    name: '',
    gameType: 'cash',
    gameVariant: 'nlh',
    maxPlayers: 9,
    stakes: { smallBlind: 1, bigBlind: 2 },
    isPrivate: false,
    minBuyIn: 40,
    maxBuyIn: 200,
    speed: 'regular'
  })

  // Update min/max buy-in when blinds change
  useEffect(() => {
    setConfig(prev => ({
      ...prev,
      minBuyIn: prev.stakes.bigBlind * 20,
      maxBuyIn: prev.stakes.bigBlind * 100
    }))
  }, [config.stakes.bigBlind])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (config.name.trim()) {
      onCreateTable(config)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-[#2d2d2d] rounded-lg p-6 w-full max-w-md">
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
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Table Name
            </label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => setConfig(prev => ({...prev, name: e.target.value}))}
              placeholder="Enter table name..."
              className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#3d3d3d] rounded text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#4CAF50]"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Small Blind
              </label>
              <input
                type="number"
                value={config.stakes.smallBlind}
                onChange={(e) => setConfig(prev => ({
                  ...prev, 
                  stakes: {...prev.stakes, smallBlind: Number(e.target.value) || 1}
                }))}
                min="0.01"
                step="0.01"
                className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#3d3d3d] rounded text-white focus:outline-none focus:ring-2 focus:ring-[#4CAF50]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Big Blind
              </label>
              <input
                type="number"
                value={config.stakes.bigBlind}
                onChange={(e) => setConfig(prev => ({
                  ...prev, 
                  stakes: {...prev.stakes, bigBlind: Number(e.target.value) || 2}
                }))}
                min="0.02"
                step="0.01"
                className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#3d3d3d] rounded text-white focus:outline-none focus:ring-2 focus:ring-[#4CAF50]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Min Buy-in
              </label>
              <input
                type="number"
                value={config.minBuyIn}
                readOnly
                className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#3d3d3d] rounded text-gray-400 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">20x Big Blind</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Max Buy-in
              </label>
              <input
                type="number"
                value={config.maxBuyIn}
                readOnly
                className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#3d3d3d] rounded text-gray-400 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">100x Big Blind</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Max Players: {config.maxPlayers}
            </label>
            <input
              type="range"
              value={config.maxPlayers}
              onChange={(e) => setConfig(prev => ({...prev, maxPlayers: Number(e.target.value)}))}
              min="2"
              max="10"
              className="w-full h-2 bg-[#3d3d3d] rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white rounded font-medium transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="flex-1 px-4 py-2 bg-[#4CAF50] hover:bg-[#45a049] text-white rounded font-medium transition-colors"
            >
              Create Table
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}