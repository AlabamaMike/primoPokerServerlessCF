'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useGameStore } from '@/stores/game-store'
import { useGameWebSocket } from '@/hooks/useWebSocket'
import { Button } from '@/components/ui/button'
import { PokerTable } from '@/components/poker/PokerTable'
import HandHistory from '@/components/poker/HandHistory'
import { Wifi, WifiOff, Users, Settings, History } from 'lucide-react'

export default function MultiplayerGamePage() {
  const params = useParams()
  const router = useRouter()
  const tableId = params?.tableId as string
  
  const { user, isAuthenticated } = useAuthStore()
  const gameStore = useGameStore()
  const { isConnected, error, sendPlayerAction, sendChatMessage } = useGameWebSocket(tableId)
  
  const [showHistory, setShowHistory] = useState(false)
  const [chatMessages, setChatMessages] = useState<any[]>([])

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login')
      return
    }
    
    if (!tableId) {
      router.push('/lobby')
      return
    }

    // Initialize game state for multiplayer
    gameStore.setConnectionStatus(isConnected ? 'connected' : 'disconnected')
    
    if (!isConnected) {
      // Fallback to single-player demo mode
      console.log('WebSocket not connected, falling back to demo mode')
    }
  }, [isAuthenticated, tableId, isConnected, router, gameStore])

  const handlePlayerAction = (action: string, amount?: number) => {
    if (isConnected) {
      // Send action to server via WebSocket
      sendPlayerAction(action, amount)
    } else {
      // Fallback to local game store
      if (user) {
        gameStore.playerAction(user.id, action as any, amount)
      }
    }
  }

  const handleSendChat = (message: string) => {
    if (isConnected) {
      sendChatMessage(message)
    } else {
      // Add to local chat in demo mode
      setChatMessages(prev => [...prev, {
        id: Date.now(),
        username: user?.username || 'You',
        message,
        timestamp: new Date()
      }])
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <h1 className="text-2xl font-bold mb-4">Authentication Required</h1>
          <p>Please log in to join this game.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-900/50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                onClick={() => router.push('/lobby')}
                variant="outline"
                size="sm"
                className="border-slate-600"
              >
                ← Back to Lobby
              </Button>
              
              <div>
                <h1 className="text-lg font-semibold">Table: {tableId}</h1>
                <p className="text-sm text-slate-400">
                  {gameStore.smallBlind}/${gameStore.bigBlind} Blinds
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Connection Status */}
              <div className="flex items-center gap-2 px-3 py-1 rounded bg-slate-800">
                {isConnected ? (
                  <>
                    <Wifi className="w-4 h-4 text-green-400" />
                    <span className="text-sm text-green-400">Live</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4 text-orange-400" />
                    <span className="text-sm text-orange-400">Demo</span>
                  </>
                )}
              </div>
              
              {/* Player Count */}
              <div className="flex items-center gap-2 px-3 py-1 rounded bg-slate-800">
                <Users className="w-4 h-4 text-blue-400" />
                <span className="text-sm text-slate-300">
                  {gameStore.players.filter(p => p.isActive).length}/{gameStore.maxPlayers}
                </span>
              </div>
              
              {/* Actions */}
              <Button
                onClick={() => setShowHistory(!showHistory)}
                variant="outline"
                size="sm"
                className="border-slate-600"
              >
                <History className="w-4 h-4 mr-1" />
                History
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="container mx-auto px-4 py-2">
          <div className="p-3 bg-red-900/50 border border-red-600 rounded text-red-200 text-sm">
            Connection Error: {error} - Running in demo mode
          </div>
        </div>
      )}

      {/* Main Game Area */}
      <div className="flex-1 relative">
        <div className="container mx-auto px-4 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Game Table */}
            <div className="lg:col-span-3">
              <PokerTable />
              
              {/* Game Controls */}
              <div className="mt-6">
                <div className="bg-slate-800 rounded-lg p-4">
                  <h3 className="font-semibold mb-4">Your Actions</h3>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      onClick={() => handlePlayerAction('fold')}
                      variant="outline"
                      className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
                      disabled={!isConnected && gameStore.isMultiplayer}
                    >
                      Fold
                    </Button>
                    <Button
                      onClick={() => handlePlayerAction('check')}
                      variant="outline"
                      className="border-slate-600"
                      disabled={!isConnected && gameStore.isMultiplayer}
                    >
                      Check
                    </Button>
                    <Button
                      onClick={() => handlePlayerAction('call')}
                      variant="outline"
                      className="border-green-600 text-green-400 hover:bg-green-600 hover:text-white"
                      disabled={!isConnected && gameStore.isMultiplayer}
                    >
                      Call ${gameStore.currentBet}
                    </Button>
                    <Button
                      onClick={() => handlePlayerAction('bet', gameStore.currentBet * 2)}
                      className="bg-yellow-600 hover:bg-yellow-700"
                      disabled={!isConnected && gameStore.isMultiplayer}
                    >
                      Bet ${gameStore.currentBet * 2}
                    </Button>
                  </div>
                  {(!isConnected && gameStore.isMultiplayer) && (
                    <p className="text-sm text-slate-400 mt-2">
                      Actions disabled - connection lost
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            {/* Sidebar */}
            <div className="lg:col-span-1 space-y-6">
              {/* Game Info */}
              <div className="bg-slate-800 rounded-lg p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Game Info
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Phase:</span>
                    <span className="capitalize">{gameStore.gamePhase}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Pot:</span>
                    <span className="text-yellow-400 font-semibold">${gameStore.pot}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Current Bet:</span>
                    <span>${gameStore.currentBet}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Hand #:</span>
                    <span>{gameStore.currentHandNumber}</span>
                  </div>
                </div>
              </div>
              
              {/* Chat (placeholder for future implementation) */}
              <div className="bg-slate-800 rounded-lg p-4">
                <h3 className="font-semibold mb-3">Table Chat</h3>
                <div className="h-32 bg-slate-900 rounded p-3 text-sm">
                  {chatMessages.length > 0 ? (
                    <div className="space-y-1">
                      {chatMessages.slice(-5).map((msg) => (
                        <div key={msg.id} className="text-slate-300">
                          <span className="text-blue-400">{msg.username}:</span> {msg.message}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-center">
                      {isConnected ? 'Chat coming soon...' : 'Demo mode - chat disabled'}
                    </p>
                  )}
                </div>
              </div>
              
              {/* Quick Actions */}
              <div className="bg-slate-800 rounded-lg p-4">
                <h3 className="font-semibold mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  <Button
                    onClick={() => gameStore.startNewGame()}
                    size="sm"
                    className="w-full"
                    disabled={isConnected}
                  >
                    New Hand (Demo)
                  </Button>
                  <Button
                    onClick={() => router.push('/demo/table')}
                    variant="outline"
                    size="sm"
                    className="w-full border-slate-600"
                  >
                    Practice Mode
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hand History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-auto">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Hand History</h2>
              <Button
                onClick={() => setShowHistory(false)}
                variant="outline"
                size="sm"
                className="border-slate-600"
              >
                Close
              </Button>
            </div>
            <div className="p-4">
              <h3 className="text-lg font-semibold mb-4">Hand History</h3>
              {gameStore.handHistory.length > 0 ? (
                <div className="space-y-3">
                  {gameStore.handHistory.slice(-10).map((hand) => (
                    <div key={hand.id} className="bg-slate-700 rounded p-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold">Hand #{hand.handNumber}</span>
                        <span className="text-yellow-400">${hand.pot}</span>
                      </div>
                      <div className="text-sm text-slate-300">
                        <p>Winner: {hand.winner.name}</p>
                        <p>Hand: {hand.winner.handResult.handName}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-center">No hands played yet</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
