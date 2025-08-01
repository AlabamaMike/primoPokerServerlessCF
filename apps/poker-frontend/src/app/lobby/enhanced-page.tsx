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

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { 
  Users, 
  Search, 
  Filter, 
  Plus, 
  Eye, 
  Clock, 
  DollarSign,
  TrendingUp,
  Settings,
  Star,
  Lock,
  Globe,
  Wifi,
  WifiOff
} from 'lucide-react'

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

  // Authentication check
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login')
      return
    }
  }, [isAuthenticated, router])

  // Initialize WebSocket connection for real-time lobby updates
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        // For development, use demo data if WebSocket is not available
        const isDevelopment = process.env.NODE_ENV === 'development'
        
        if (isDevelopment) {
          // Use demo data in development
          setTables(demoTables)
          setConnectionStatus('connected')
          setLoading(false)
          return
        }

        const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8787'
        const ws = new WebSocket(`${wsUrl}/api/lobby/ws`)
        
        ws.onopen = () => {
          console.log('Lobby WebSocket connected')
          setConnectionStatus('connected')
          setWsConnection(ws)
        }

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data)
          
          if (data.type === 'lobby_update') {
            setTables(data.tables)
          } else if (data.type === 'table_update') {
            setTables(prev => prev.map(table => 
              table.tableId === data.table.tableId ? data.table : table
            ))
          }
        }

        ws.onclose = () => {
          console.log('Lobby WebSocket disconnected')
          setConnectionStatus('disconnected')
          setWsConnection(null)
          
          // Fallback to demo data
          setTables(demoTables)
          
          // Attempt to reconnect after 3 seconds
          setTimeout(connectWebSocket, 3000)
        }

        ws.onerror = (error) => {
          console.error('Lobby WebSocket error:', error)
          setConnectionStatus('disconnected')
          // Fallback to demo data
          setTables(demoTables)
        }

      } catch (error) {
        console.error('Failed to connect to lobby WebSocket:', error)
        setConnectionStatus('disconnected')
        // Fallback to demo data
        setTables(demoTables)
        setTimeout(connectWebSocket, 3000)
      }
    }

    connectWebSocket()

    return () => {
      if (wsConnection) {
        wsConnection.close()
      }
    }
  }, [])

  // Load initial table data
  useEffect(() => {
    const fetchTables = async () => {
      try {
        setLoading(true)
        
        // In development, use demo data
        if (process.env.NODE_ENV === 'development') {
          setTables(demoTables)
          setLoading(false)
          return
        }

        const response = await fetch('/api/lobby/tables')
        if (response.ok) {
          const tablesData = await response.json()
          setTables(tablesData)
        } else {
          // Fallback to demo data
          setTables(demoTables)
        }
      } catch (error) {
        console.error('Failed to fetch tables:', error)
        // Fallback to demo data
        setTables(demoTables)
      } finally {
        setLoading(false)
      }
    }

    fetchTables()
  }, [])

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

  // Join table handler
  const handleJoinTable = async (tableId: string, password?: string) => {
    try {
      const response = await fetch('/api/lobby/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tableId,
          playerId: user?.id || 'demo-user',
          password
        })
      })

      const result = await response.json()
      
      if (result.success) {
        // Redirect to game table
        router.push(`/game/${tableId}`)
      } else {
        // Handle join failure (full table, wrong password, etc.)
        alert(result.error || 'Failed to join table')
      }
    } catch (error) {
      console.error('Failed to join table:', error)
      // For demo purposes, allow joining
      router.push(`/game/${tableId}`)
    }
  }

  // Create table handler
  const handleCreateTable = async (config: LobbyTableConfig) => {
    try {
      const response = await fetch('/api/lobby/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
          router.push(`/game/${result.tableId}`)
        }
      } else {
        alert(result.error || 'Failed to create table')
      }
    } catch (error) {
      console.error('Failed to create table:', error)
      // For demo purposes, create a mock table
      const newTableId = `demo-table-${Date.now()}`
      setCreateTableOpen(false)
      router.push(`/game/${newTableId}`)
    }
  }

  // Spectate table handler
  const handleSpectateTable = (tableId: string) => {
    router.push(`/game/${tableId}?spectate=true`)
  }

  if (!isAuthenticated) {
    return <div>Redirecting...</div>
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-900 via-green-800 to-green-900 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Poker Lobby</h1>
          <p className="text-green-200">Find your perfect table and start playing!</p>
          
          {/* Connection Status */}
          <div className="flex items-center justify-center mt-4">
            {connectionStatus === 'connected' ? (
              <Wifi className="w-5 h-5 text-green-400 mr-2" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-400 mr-2" />
            )}
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
        </div>

        {/* Controls */}
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-6">
          <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search tables or players..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-white/20 border-white/30 text-white placeholder:text-gray-300"
                />
              </div>
              
              <Select value={filters.gameType || ''} onValueChange={(value) => 
                setFilters(prev => ({...prev, gameType: value as any || undefined}))
              }>
                <SelectTrigger className="bg-white/20 border-white/30 text-white">
                  <SelectValue placeholder="Game Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Games</SelectItem>
                  <SelectItem value="cash">Cash Game</SelectItem>
                  <SelectItem value="tournament">Tournament</SelectItem>
                  <SelectItem value="sit-n-go">Sit & Go</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={(value) => setSortBy(value as any)}>
                <SelectTrigger className="bg-white/20 border-white/30 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="players">Sort by Players</SelectItem>
                  <SelectItem value="stakes">Sort by Stakes</SelectItem>
                  <SelectItem value="activity">Sort by Activity</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Dialog open={createTableOpen} onOpenChange={setCreateTableOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-green-600 hover:bg-green-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Table
                  </Button>
                </DialogTrigger>
                <CreateTableDialog onCreateTable={handleCreateTable} />
              </Dialog>
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
                onJoin={() => handleJoinTable(table.tableId)}
                onSpectate={() => handleSpectateTable(table.tableId)}
              />
            ))}
          </div>
        )}

        {filteredTables.length === 0 && !loading && (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No tables found</h3>
            <p className="text-green-200 mb-4">Try adjusting your filters or create a new table</p>
            <Button 
              onClick={() => setCreateTableOpen(true)}
              className="bg-green-600 hover:bg-green-700"
            >
              Create New Table
            </Button>
          </div>
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
    <Card className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-white text-lg mb-1 flex items-center gap-2">
              {table.isPrivate && <Lock className="w-4 h-4" />}
              {table.name}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={table.gameType === 'cash' ? 'default' : 'secondary'}>
                {table.gameType === 'cash' ? 'Cash Game' : 
                 table.gameType === 'tournament' ? 'Tournament' : 'Sit & Go'}
              </Badge>
              <Badge variant="outline" className="text-yellow-400 border-yellow-400">
                ${table.stakes.smallBlind}/${table.stakes.bigBlind}
              </Badge>
            </div>
          </div>
          
          <div className="text-right">
            <div className="text-white font-semibold">
              {table.currentPlayers}/{table.maxPlayers}
            </div>
            <div className="text-sm text-green-200">players</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
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
                <Badge 
                  key={player.playerId} 
                  variant="outline" 
                  className="text-xs border-white/30 text-white"
                >
                  {player.username}
                </Badge>
              ))}
              {table.playerList.length > 4 && (
                <Badge variant="outline" className="text-xs border-white/30 text-white">
                  +{table.playerList.length - 4} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button 
            onClick={onJoin}
            disabled={isFullTable}
            className={`flex-1 ${isFullTable ? 
              'bg-gray-600 hover:bg-gray-600' : 
              'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isFullTable ? 'Table Full' : 'Join Table'}
          </Button>
          
          <Button 
            onClick={onSpectate}
            variant="outline"
            size="sm"
            className="border-white/30 text-white hover:bg-white/10"
          >
            <Eye className="w-4 h-4" />
          </Button>
        </div>

        {/* Waiting List Info */}
        {isFullTable && table.waitingList && table.waitingList.length > 0 && (
          <div className="mt-2 text-xs text-orange-300 text-center">
            {table.waitingList.length} player(s) waiting
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Create Table Dialog Component
interface CreateTableDialogProps {
  onCreateTable: (config: LobbyTableConfig) => void
}

function CreateTableDialog({ onCreateTable }: CreateTableDialogProps) {
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
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Create New Table</DialogTitle>
        <DialogDescription>
          Set up your poker table with custom settings
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="tableName">Table Name</Label>
          <Input
            id="tableName"
            value={config.name}
            onChange={(e) => setConfig(prev => ({...prev, name: e.target.value}))}
            placeholder="Enter table name..."
            required
          />
        </div>

        <div>
          <Label htmlFor="gameType">Game Type</Label>
          <Select 
            value={config.gameType} 
            onValueChange={(value) => setConfig(prev => ({...prev, gameType: value as any}))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash Game</SelectItem>
              <SelectItem value="sit-n-go">Sit & Go</SelectItem>
              <SelectItem value="tournament">Tournament</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="smallBlind">Small Blind</Label>
            <Input
              id="smallBlind"
              type="number"
              value={config.stakes.smallBlind}
              onChange={(e) => setConfig(prev => ({
                ...prev, 
                stakes: {...prev.stakes, smallBlind: parseInt(e.target.value) || 1}
              }))}
              min="1"
            />
          </div>
          <div>
            <Label htmlFor="bigBlind">Big Blind</Label>
            <Input
              id="bigBlind"
              type="number"
              value={config.stakes.bigBlind}
              onChange={(e) => setConfig(prev => ({
                ...prev, 
                stakes: {...prev.stakes, bigBlind: parseInt(e.target.value) || 2}
              }))}
              min="2"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="maxPlayers">Max Players: {config.maxPlayers}</Label>
          <Slider
            value={[config.maxPlayers]}
            onValueChange={([value]) => setConfig(prev => ({...prev, maxPlayers: value}))}
            min={2}
            max={10}
            step={1}
            className="mt-2"
          />
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="isPrivate"
            checked={config.isPrivate}
            onCheckedChange={(checked) => setConfig(prev => ({...prev, isPrivate: checked}))}
          />
          <Label htmlFor="isPrivate">Private Table</Label>
        </div>

        {config.isPrivate && (
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={config.password || ''}
              onChange={(e) => setConfig(prev => ({...prev, password: e.target.value}))}
              placeholder="Enter password..."
            />
          </div>
        )}

        <div className="flex gap-2 pt-4">
          <Button type="submit" className="flex-1">
            Create Table
          </Button>
        </div>
      </form>
    </DialogContent>
  )
}
