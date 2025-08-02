'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useGameStore } from '@/stores/game-store'
import { useGameWebSocket } from '@/hooks/useWebSocket'
import { Button } from '@/components/ui/button'
import { PokerTable } from '@/components/poker/PokerTable'
import HandHistory from '@/components/poker/HandHistory'
import SeatSelection from '@/components/poker/SeatSelection'
import { Wifi, WifiOff, Users, Settings, History } from 'lucide-react'

interface MultiplayerGameClientProps {
  tableId: string
}

export default function MultiplayerGameClient({ tableId }: MultiplayerGameClientProps) {
  const router = useRouter()
  
  const { user, isAuthenticated } = useAuthStore()
  const gameStore = useGameStore()
  const { isConnected, error, sendPlayerAction, sendChatMessage, joinTable } = useGameWebSocket(tableId)
  
  const [showHistory, setShowHistory] = useState(false)
  const [showSeatSelection, setShowSeatSelection] = useState(false)
  const [chatMessages, setChatMessages] = useState<any[]>([])
  const [playerSeat, setPlayerSeat] = useState<number | null>(null)
  const [playerChips, setPlayerChips] = useState<number>(0)
  const [hasLoggedAuth, setHasLoggedAuth] = useState(false)

  useEffect(() => {
    if (!isAuthenticated && !hasLoggedAuth) {
      console.log('User not authenticated - allowing demo mode for game table')
      setHasLoggedAuth(true)
      // For testing purposes, allow demo mode
      // In production, you might want to redirect to login
      // router.push('/auth/login')
      // return
    }

    if (!tableId) {
      router.push('/lobby')
      return
    }

    // Set connection status in game store
    gameStore.setConnectionStatus(isConnected ? 'connected' : 'disconnected')
    
    if (!isConnected) {
      console.log('Not connected to game server')
    }

    // Check if player is already seated at this table
    // For now, show seat selection if not seated
    if (!playerSeat) {
      setShowSeatSelection(true)
    }

  }, [isAuthenticated, tableId, isConnected, playerSeat])

  const handlePlayerAction = (action: string, amount?: number) => {
    if (isConnected) {
      console.log(`Player action: ${action}, amount: ${amount}`)
      sendPlayerAction(action, amount)
    } else {
      // Demo mode fallback
      if (user) {
        gameStore.addAction({
          playerId: user.id,
          action,
          amount,
          timestamp: Date.now()
        })
      }
    }
  }

  const handleChatMessage = (message: string) => {
    if (isConnected) {
      sendChatMessage(message)
    }
    
    // Add to local chat for demo
    const newMessage = {
      playerId: user?.id || 'demo-user',
      username: user?.username || 'Demo Player',
      message,
      timestamp: Date.now()
    }
    setChatMessages(prev => [...prev, newMessage])
  }

  const handleSeatSelection = async (seatNumber: number, buyInAmount: number) => {
    try {
      console.log(`Attempting to join seat ${seatNumber} with $${buyInAmount}`)
      console.log('WebSocket status:', { isConnected, joinTable: !!joinTable, error })
      console.log('User status:', { user: !!user, isAuthenticated })
      
      if (isConnected && joinTable) {
        console.log('Sending join table message via WebSocket...')
        // Send join table message via WebSocket
        joinTable(seatNumber, buyInAmount)
        
        // Update local state immediately for UI responsiveness
        setPlayerSeat(seatNumber)
        setPlayerChips(buyInAmount)
        setShowSeatSelection(false)
        
        console.log('Local state updated, adding player to game store...')
        
        // Update game store with player seated
        if (user) {
          gameStore.addPlayer({
            id: user.id,
            username: user.username,
            chipCount: buyInAmount,
            position: seatNumber - 1, // Convert to 0-based position
            isActive: true,
            cards: [],
            hasActed: false,
            status: 'active'
          })
          console.log('Player added to game store successfully')
        } else {
          console.warn('No user found when adding to game store')
        }
      } else {
        console.error('Cannot join table:', {
          isConnected,
          hasJoinTableFunction: !!joinTable,
          error,
          reason: !isConnected ? 'WebSocket not connected' : 'joinTable function missing'
        })
        
        // For now, let's allow demo mode fallback
        console.log('Falling back to demo mode...')
        setPlayerSeat(seatNumber)
        setPlayerChips(buyInAmount)
        setShowSeatSelection(false)
        
        if (user) {
          gameStore.addPlayer({
            id: user.id,
            username: user.username,
            chipCount: buyInAmount,
            position: seatNumber - 1,
            isActive: true,
            cards: [],
            hasActed: false,
            status: 'active'
          })
        }
      }
    } catch (error) {
      console.error('Failed to join table:', error)
      // Handle error - show message to user
    }
  }

  const handleCancelSeatSelection = () => {
    setShowSeatSelection(false)
    router.push('/lobby')
  }

  const handleLeaveTable = () => {
    // TODO: Call API to leave table and cash out chips
    router.push('/lobby')
  }

  // Allow demo mode for testing
  // if (!isAuthenticated) {
  //   return <div>Redirecting to login...</div>
  // }

  return (
    <div className="min-h-screen bg-green-900 text-white p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Table {tableId}</h1>
        
        <div className="flex items-center gap-4">
          {/* Connection Status */}
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <Wifi className="h-5 w-5 text-green-400" />
                <span className="text-sm text-green-400">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="h-5 w-5 text-red-400" />
                <span className="text-sm text-red-400">
                  {error ? 'Connection Error' : 'Demo Mode'}
                </span>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
            className="bg-green-800 border-green-600 hover:bg-green-700"
          >
            <History className="h-4 w-4 mr-2" />
            History
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleLeaveTable}
            className="bg-red-800 border-red-600 hover:bg-red-700"
          >
            Leave Table
          </Button>
        </div>
      </div>

      {/* Game Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Game Area */}
        <div className="lg:col-span-3">
          <PokerTable
            tableId={tableId}
            currentUserId={user?.id || 'demo-user'}
            onPlayerAction={handlePlayerAction}
            onChatMessage={handleChatMessage}
            isConnected={isConnected}
          />
        </div>

        {/* Side Panel */}
        <div className="lg:col-span-1 space-y-4">
          {/* Player Info */}
          <div className="bg-green-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-2">
              <Users className="inline h-5 w-5 mr-2" />
              Player Stats
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Username:</span>
                <span className="font-medium">{user?.username || 'Demo Player'}</span>
              </div>
              <div className="flex justify-between">
                <span>Chips:</span>
                <span className="font-medium text-yellow-400">
                  ${playerChips > 0 ? playerChips.toLocaleString() : 'Not seated'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Position:</span>
                <span className="font-medium">
                  {playerSeat ? `Seat ${playerSeat}` : 'Not seated'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Status:</span>
                <span className={`font-medium ${isConnected ? 'text-green-400' : 'text-yellow-400'}`}>
                  {isConnected ? 'Live' : 'Demo'}
                </span>
              </div>
            </div>
          </div>

          {/* Game Controls */}
          <div className="bg-green-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-2">
              <Settings className="inline h-5 w-5 mr-2" />
              Game Settings
            </h3>
            <div className="space-y-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full bg-green-700 border-green-600 hover:bg-green-600"
                onClick={() => console.log('Sit out next hand')}
              >
                Sit Out Next Hand
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full bg-green-700 border-green-600 hover:bg-green-600"
                onClick={() => console.log('Auto-fold enabled')}
              >
                Auto-Fold
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full bg-green-700 border-green-600 hover:bg-green-600"
                onClick={() => console.log('Show options')}
              >
                Table Options
              </Button>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="bg-green-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-2">Table Chat</h3>
            <div className="space-y-2 h-40 overflow-y-auto">
              {chatMessages.length === 0 ? (
                <p className="text-sm text-gray-400">No messages yet...</p>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div key={idx} className="text-sm">
                    <span className="font-medium text-blue-300">{msg.username}:</span>
                    <span className="ml-2">{msg.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hand History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-green-800 rounded-lg p-6 max-w-4xl max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Hand History</h2>
              <Button
                variant="outline"
                onClick={() => setShowHistory(false)}
                className="bg-red-700 border-red-600 hover:bg-red-600"
              >
                Close
              </Button>
            </div>
            <HandHistory tableId={tableId} />
          </div>
        </div>
      )}

      {/* Seat Selection Modal */}
      {showSeatSelection && (
        <SeatSelection
          tableId={tableId}
          onSeatSelection={handleSeatSelection}
          onCancel={handleCancelSeatSelection}
        />
      )}

      {/* Error Display */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-600 text-white p-4 rounded-lg shadow-lg">
          <p className="font-medium">Connection Error</p>
          <p className="text-sm opacity-90">{error}</p>
        </div>
      )}

      {/* Demo Mode Notice */}
      {!isConnected && !error && (
        <div className="fixed bottom-4 left-4 bg-yellow-600 text-white p-4 rounded-lg shadow-lg">
          <p className="font-medium">Demo Mode Active</p>
          <p className="text-sm opacity-90">Playing offline with demo data</p>
        </div>
      )}
    </div>
  )
}
