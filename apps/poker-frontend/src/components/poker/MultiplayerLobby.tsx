"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { useGameStore } from "@/stores/game-store"
import { useAuthStore } from "@/stores/auth-store"
import { 
  Users, 
  Wifi, 
  WifiOff, 
  Play, 
  Plus, 
  Settings,
  Clock,
  TrendingUp 
} from "lucide-react"
import { cn } from "@/lib/utils"

interface MultiplayerLobbyProps {
  className?: string
  onJoinTable?: (tableId: string) => void
}

// Mock table data for development
const mockTables = [
  {
    id: 'table-1',
    name: 'High Stakes',
    players: 6,
    maxPlayers: 9,
    blinds: { small: 25, big: 50 },
    pot: 1250,
    gamePhase: 'flop',
    averageStack: 2500,
    isPrivate: false
  },
  {
    id: 'table-2', 
    name: 'Beginner Friendly',
    players: 3,
    maxPlayers: 6,
    blinds: { small: 5, big: 10 },
    pot: 120,
    gamePhase: 'pre-flop',
    averageStack: 500,
    isPrivate: false
  },
  {
    id: 'table-3',
    name: 'Tournament Final',
    players: 8,
    maxPlayers: 9,
    blinds: { small: 100, big: 200 },
    pot: 5400,
    gamePhase: 'turn',
    averageStack: 8200,
    isPrivate: false
  }
]

export const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({ 
  className, 
  onJoinTable 
}) => {
  const { 
    isConnected, 
    connectionStatus, 
    connectToTable, 
    createMultiplayerTable,
    isMultiplayer 
  } = useGameStore()
  
  const { user, isAuthenticated } = useAuthStore()
  const [selectedTable, setSelectedTable] = React.useState<string | null>(null)
  const [isCreating, setIsCreating] = React.useState(false)
  const [newTableBlinds, setNewTableBlinds] = React.useState({ small: 25, big: 50 })

  const handleJoinTable = async (tableId: string) => {
    if (!isAuthenticated) {
      alert('Please log in to join a multiplayer table')
      return
    }

    try {
      setSelectedTable(tableId)
      await connectToTable(tableId)
      onJoinTable?.(tableId)
    } catch (error) {
      console.error('Failed to join table:', error)
      alert('Failed to join table. Please try again.')
    }
  }

  const handleCreateTable = async () => {
    if (!isAuthenticated) {
      alert('Please log in to create a table')
      return
    }

    try {
      setIsCreating(true)
      await createMultiplayerTable(newTableBlinds)
      // Table creation success would be handled by WebSocket events
    } catch (error) {
      console.error('Failed to create table:', error)
      alert('Failed to create table. Please try again.')
    } finally {
      setIsCreating(false)
    }
  }

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-green-400'
      case 'connecting': return 'text-yellow-400'
      case 'error': return 'text-red-400'
      default: return 'text-gray-400'
    }
  }

  const getConnectionStatusIcon = () => {
    return isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="bg-black/40 backdrop-blur-sm rounded-lg p-6 border border-white/10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Multiplayer Lobby</h2>
            <p className="text-white/70">Join a table or create your own</p>
          </div>
          
          <div className="flex items-center space-x-2">
            <div className={cn("flex items-center space-x-2", getConnectionStatusColor())}>
              {getConnectionStatusIcon()}
              <span className="text-sm font-medium capitalize">
                {connectionStatus}
              </span>
            </div>
          </div>
        </div>

        {/* Create Table */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <label className="text-white text-sm">Blinds:</label>
            <select 
              value={`${newTableBlinds.small}/${newTableBlinds.big}`}
              onChange={(e) => {
                const [small, big] = e.target.value.split('/').map(Number)
                setNewTableBlinds({ small, big })
              }}
              className="bg-black/20 border border-white/20 rounded px-2 py-1 text-white text-sm"
            >
              <option value="5/10">$5/$10</option>
              <option value="25/50">$25/$50</option>
              <option value="100/200">$100/$200</option>
              <option value="500/1000">$500/$1000</option>
            </select>
          </div>
          
          <Button
            onClick={handleCreateTable}
            disabled={isCreating || !isAuthenticated}
            variant="default"
            size="sm"
            className="bg-green-600 hover:bg-green-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            {isCreating ? 'Creating...' : 'Create Table'}
          </Button>
        </div>
      </div>

      {/* Available Tables */}
      <div className="space-y-4">
        <h3 className="text-white text-lg font-semibold">Available Tables</h3>
        
        <div className="grid gap-4">
          {mockTables.map((table) => (
            <motion.div
              key={table.id}
              className="bg-black/40 backdrop-blur-sm rounded-lg p-4 border border-white/10 hover:border-white/20 transition-colors"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h4 className="text-white font-semibold">{table.name}</h4>
                    <div className="flex items-center space-x-1 text-white/60 text-sm">
                      <Users className="w-3 h-3" />
                      <span>{table.players}/{table.maxPlayers}</span>
                    </div>
                    <div className="text-white/60 text-sm">
                      ${table.blinds.small}/${table.blinds.big}
                    </div>
                    <div className={cn(
                      "px-2 py-1 rounded text-xs font-medium",
                      table.gamePhase === 'pre-flop' ? 'bg-blue-500/20 text-blue-400' :
                      table.gamePhase === 'flop' ? 'bg-green-500/20 text-green-400' :
                      table.gamePhase === 'turn' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-red-500/20 text-red-400'
                    )}>
                      {table.gamePhase.replace('-', ' ')}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4 text-sm text-white/70">
                    <div className="flex items-center space-x-1">
                      <TrendingUp className="w-3 h-3" />
                      <span>Pot: ${table.pot.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>Avg Stack: ${table.averageStack.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-white hover:bg-white/10"
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                  
                  <Button
                    onClick={() => handleJoinTable(table.id)}
                    disabled={selectedTable === table.id || table.players >= table.maxPlayers}
                    variant={table.players >= table.maxPlayers ? "ghost" : "default"}
                    size="sm"
                    className={table.players >= table.maxPlayers ? 
                      "text-white/50" : 
                      "bg-blue-600 hover:bg-blue-700"
                    }
                  >
                    <Play className="w-4 h-4 mr-2" />
                    {selectedTable === table.id ? 'Joining...' : 
                     table.players >= table.maxPlayers ? 'Full' : 'Join'}
                  </Button>
                </div>
              </div>

              {/* Player indicators */}
              <div className="flex items-center space-x-1 mt-3">
                {Array(table.maxPlayers).fill(0).map((_, index) => (
                  <div
                    key={index}
                    className={cn(
                      "w-2 h-2 rounded-full",
                      index < table.players ? 'bg-green-400' : 'bg-white/20'
                    )}
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Connection Info */}
      {isMultiplayer && (
        <div className="bg-black/40 backdrop-blur-sm rounded-lg p-4 border border-white/10">
          <div className="text-center text-white">
            <div className="text-lg font-semibold mb-2">Connected to Multiplayer</div>
            <div className="text-white/70 text-sm">
              You can now participate in real-time poker games with other players
            </div>
          </div>
        </div>
      )}

      {/* Authentication Notice */}
      {!isAuthenticated && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
          <div className="text-yellow-400 text-center">
            <div className="font-semibold mb-1">Login Required</div>
            <div className="text-sm">
              Please log in to join multiplayer tables and play with other users
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
