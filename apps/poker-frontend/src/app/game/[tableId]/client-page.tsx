'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useGameStore } from '@/stores/game-store'
import { useGameWebSocket } from '@/hooks/useWebSocket'
import { PokerTable } from '@/components/poker/PokerTable'
import { JoinTableModal } from '@/components/JoinTableModal'
import { GetChipsModal } from '@/components/GetChipsModal'
import { StandUpModal } from '@/components/StandUpModal'
import { WalletDisplay } from '@/components/WalletDisplay'
import { useBankrollStore } from '@/stores/bankroll-store'

interface MultiplayerGameClientProps {
  tableId: string
}

interface TableInfo {
  id: string
  name: string
  config: {
    smallBlind: number
    bigBlind: number
    minBuyIn: number
    maxBuyIn: number
    maxPlayers: number
  }
  players: any[]
  status: string
}

export default function MultiplayerGameClient({ tableId }: MultiplayerGameClientProps) {
  const router = useRouter()
  
  console.log('MultiplayerGameClient rendering for table:', tableId)
  
  const { user, isAuthenticated } = useAuthStore()
  const gameStore = useGameStore()
  const bankrollStore = useBankrollStore()
  const { isConnected, error, sendPlayerAction, sendChatMessage, joinTable, joinAsSpectator, leaveSpectator, standUp } = useGameWebSocket(tableId)
  
  const [showHistory, setShowHistory] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [showGetChipsModal, setShowGetChipsModal] = useState(false)
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null)
  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null)
  const [loadingTable, setLoadingTable] = useState(true)
  const [playerSeat, setPlayerSeat] = useState<number | null>(null)
  const [isSpectating, setIsSpectating] = useState(false)
  const [seatReservations, setSeatReservations] = useState<Map<number, { playerId: string; expiresAt: number }>>(new Map())
  const [showStandUpModal, setShowStandUpModal] = useState(false)
  const [isStandingUp, setIsStandingUp] = useState(false)
  const spectatorCount = gameStore.spectatorCount

  // Fetch table information on mount
  useEffect(() => {
    const fetchTableInfo = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://primo-poker-server.alabamamike.workers.dev'
        console.log('Fetching table info for:', tableId, 'from:', `${apiUrl}/api/tables/${tableId}`)
        
        const response = await fetch(`${apiUrl}/api/tables/${tableId}`)
        
        if (response.ok) {
          const result = await response.json()
          console.log('Table info response:', result)
          
          if (result.success && result.data) {
            setTableInfo(result.data)
            
            // Check if user is already seated
            const existingPlayer = result.data.players?.find((p: any) => 
              p.playerId === user?.id || p.id === user?.id
            )
            if (existingPlayer) {
              setPlayerSeat(existingPlayer.position || existingPlayer.seat)
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch table info:', error)
      } finally {
        setLoadingTable(false)
      }
    }

    if (tableId) {
      fetchTableInfo()
    }
  }, [tableId, user])

  // Set up game state when connected
  useEffect(() => {
    gameStore.setConnectionStatus(isConnected ? 'connected' : 'disconnected')
    
    // If connected and not seated, join as spectator
    if (isConnected && !loadingTable && !playerSeat && tableInfo && !isSpectating) {
      console.log('Joining as spectator...')
      joinAsSpectator()
      setIsSpectating(true)
    }
  }, [isConnected, loadingTable, playerSeat, tableInfo, isSpectating, joinAsSpectator])

  const handlePlayerAction = (action: string, amount?: number) => {
    if (isConnected && playerSeat !== null) {
      console.log(`Player action: ${action}, amount: ${amount}`)
      sendPlayerAction(action, amount)
    }
  }

  const handleChatMessage = (message: string) => {
    if (isConnected) {
      sendChatMessage(message)
    }
  }

  const handleJoinTable = async (buyIn: number, seatPreference?: number) => {
    try {
      console.log(`Attempting to join table with $${buyIn}`)
      
      if (isConnected && joinTable) {
        // Use seat preference if provided, otherwise let server assign
        const seatToJoin = seatPreference || 0
        joinTable(seatToJoin, buyIn)
        
        setShowJoinModal(false)
        // Wait for WebSocket confirmation before updating local state
      } else {
        console.error('Cannot join table: WebSocket not connected')
      }
    } catch (error) {
      console.error('Failed to join table:', error)
    }
  }

  const handleLeaveTable = () => {
    if (isSpectating) {
      leaveSpectator()
    }
    // TODO: Implement leave table for seated players
    router.push('/lobby')
  }

  const handleSeatClick = (position: number) => {
    console.log(`Seat ${position + 1} clicked`)
    setSelectedSeat(position)
    setShowGetChipsModal(true)
  }

  const handleGetChips = async (buyInAmount: number) => {
    if (selectedSeat === null) return
    
    try {
      console.log(`Getting ${buyInAmount} chips for seat ${selectedSeat + 1}`)
      
      if (isConnected && joinTable) {
        // Join the table with the specified buy-in
        joinTable(selectedSeat, buyInAmount)
        
        // Update local state
        setPlayerSeat(selectedSeat)
        setIsSpectating(false)
        setShowGetChipsModal(false)
        setSelectedSeat(null)
      } else {
        console.error('Cannot join table: WebSocket not connected')
      }
    } catch (error) {
      console.error('Failed to get chips and join table:', error)
    }
  }

  const handleStandUp = async () => {
    try {
      setIsStandingUp(true)
      
      // Call the stand up WebSocket method
      standUp()
      
      // Wait a bit for the response
      setTimeout(() => {
        // Update local state
        setPlayerSeat(null)
        setIsSpectating(true)
        setShowStandUpModal(false)
        setIsStandingUp(false)
        
        console.log('Successfully stood up from table')
      }, 500)
    } catch (error) {
      console.error('Failed to stand up:', error)
      setIsStandingUp(false)
    }
  }

  // Loading state
  if (loadingTable) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4CAF50] mx-auto mb-4"></div>
          <p className="text-white">Loading table...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (!tableInfo) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">Table not found</p>
          <button
            onClick={() => router.push('/lobby')}
            className="px-4 py-2 bg-[#4CAF50] hover:bg-[#45a049] text-white rounded transition-colors"
          >
            Back to Lobby
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white">
      {/* Header */}
      <header className="bg-[#2d2d2d] px-5 py-3 border-b-2 border-[#3d3d3d]">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-6">
            <h1 className="text-2xl font-bold text-[#4CAF50]">
              {tableInfo.name || `Table ${tableId}`}
            </h1>
            <div className="flex items-center gap-4 text-sm">
              <div className="text-gray-300">
                Stakes: <span className="text-white font-semibold">
                  ${tableInfo.config.smallBlind}/${tableInfo.config.bigBlind}
                </span>
              </div>
              <div className="text-gray-300">
                Players: <span className="text-white font-semibold">
                  {tableInfo.players?.length || 0}/{tableInfo.config.maxPlayers}
                </span>
              </div>
              {spectatorCount > 0 && (
                <div className="text-gray-300">
                  Spectators: <span className="text-white font-semibold">
                    {spectatorCount}
                  </span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Wallet Display */}
            <WalletDisplay compact showHistory />
            
            {/* Connection Status */}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-400' : 'bg-red-400'
              }`}></div>
              <span className={`text-sm ${
                isConnected ? 'text-green-400' : 'text-red-400'
              }`}>
                {isConnected ? 'Connected' : error || 'Disconnected'}
              </span>
            </div>
            
            {/* Action Buttons */}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="px-3 py-1.5 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white rounded text-sm transition-colors"
            >
              History
            </button>
            <button
              onClick={handleLeaveTable}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors"
            >
              Leave Table
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        <div className="max-w-7xl mx-auto">
          <PokerTable 
            className="mb-6"
            tableId={tableId}
            currentUserId={user?.id || ''}
            onPlayerAction={handlePlayerAction}
            onChatMessage={handleChatMessage}
            isConnected={isConnected}
            isSpectating={isSpectating}
            onSeatClick={handleSeatClick}
            minBuyIn={tableInfo?.config.minBuyIn}
            maxBuyIn={tableInfo?.config.maxBuyIn}
          />
          
          {/* Player Controls */}
          {playerSeat !== null && !isSpectating && (
            <div className="bg-[#2d2d2d] rounded-lg p-4 border border-[#3d3d3d]">
              <div className="flex justify-between items-center">
                <div className="text-gray-400">
                  {gameStore.activePlayerId === user?.id 
                    ? "It's your turn to act" 
                    : "Player controls will appear here when it's your turn"}
                </div>
                <button
                  onClick={() => setShowStandUpModal(true)}
                  disabled={gameStore.activePlayerId === user?.id}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-sm transition-colors"
                  title={gameStore.activePlayerId === user?.id ? "Cannot stand up during your turn" : "Stand up from table"}
                >
                  Stand Up
                </button>
              </div>
            </div>
          )}
          
          {/* Spectator Mode */}
          {isSpectating && (
            <div className="bg-[#2d2d2d] rounded-lg p-4 border border-[#3d3d3d]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">Spectator Mode</h3>
                  <p className="text-gray-400 text-sm">
                    Click on any empty seat to join the game
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-400">
                    {spectatorCount} {spectatorCount === 1 ? 'spectator' : 'spectators'} watching
                  </div>
                  <button
                    onClick={() => {
                      setIsSpectating(false)
                      setShowJoinModal(true)
                    }}
                    className="mt-2 px-4 py-2 bg-[#4CAF50] hover:bg-[#45a049] text-white rounded text-sm transition-colors"
                  >
                    Quick Join
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Join Table Modal */}
      {showJoinModal && tableInfo && (
        <JoinTableModal
          isOpen={showJoinModal}
          onClose={() => {
            setShowJoinModal(false)
            router.push('/lobby')
          }}
          onJoin={handleJoinTable}
          tableName={tableInfo.name}
          minBuyIn={tableInfo.config.minBuyIn}
          maxBuyIn={tableInfo.config.maxBuyIn}
          smallBlind={tableInfo.config.smallBlind}
          bigBlind={tableInfo.config.bigBlind}
          maxPlayers={tableInfo.config.maxPlayers}
          currentPlayers={tableInfo.players?.map(p => ({
            seat: p.position || p.seat || 0,
            username: p.username || p.playerName || 'Unknown',
            chipCount: p.chipCount || 0
          })) || []}
        />
      )}

      {/* Get Chips Modal */}
      {showGetChipsModal && tableInfo && selectedSeat !== null && (
        <GetChipsModal
          isOpen={showGetChipsModal}
          onClose={() => {
            setShowGetChipsModal(false)
            setSelectedSeat(null)
          }}
          onGetChips={handleGetChips}
          seatNumber={selectedSeat}
          minBuyIn={tableInfo.config.minBuyIn}
          maxBuyIn={tableInfo.config.maxBuyIn}
          playerBalance={bankrollStore.balance}
        />
      )}

      {/* Hand History */}
      {showHistory && (
        <div className="fixed right-0 top-0 h-full w-80 bg-[#2d2d2d] border-l border-[#3d3d3d] p-4 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Hand History</h2>
            <button
              onClick={() => setShowHistory(false)}
              className="text-gray-400 hover:text-white"
            >
              ×
            </button>
          </div>
          <div className="text-gray-400 text-sm">
            Hand history will appear here
          </div>
        </div>
      )}

      {/* Stand Up Modal */}
      {showStandUpModal && playerSeat !== null && (
        <StandUpModal
          isOpen={showStandUpModal}
          onClose={() => setShowStandUpModal(false)}
          onConfirm={handleStandUp}
          chipCount={gameStore.players.find(p => p.id === user?.id)?.chips || 0}
          isStandingUp={isStandingUp}
        />
      )}
    </div>
  )
}