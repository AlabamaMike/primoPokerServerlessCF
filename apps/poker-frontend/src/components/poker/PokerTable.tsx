"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { PokerCard } from "@/components/poker/Card"
import { PlayerSeat } from "@/components/poker/PlayerSeat"
import { Button } from "@/components/ui/button"
import { useGameStore } from "@/stores/game-store"
import { useAuthStore } from "@/stores/auth-store"
import { Coins, Users, Clock, Eye } from "lucide-react"

interface PokerTableProps {
  className?: string
  tableId?: string
  currentUserId?: string
  onPlayerAction?: (action: string, amount?: number) => void
  onChatMessage?: (message: string) => void
  isConnected?: boolean
  isSpectating?: boolean
  onSeatClick?: (position: number) => void
  minBuyIn?: number
  maxBuyIn?: number
}

// Position coordinates for seats around an oval table (9-max)
const SEAT_POSITIONS = [
  { top: '15%', left: '50%', transform: 'translate(-50%, -50%)' },    // Seat 1 (top center)
  { top: '25%', left: '75%', transform: 'translate(-50%, -50%)' },    // Seat 2 (top right)
  { top: '50%', left: '85%', transform: 'translate(-50%, -50%)' },    // Seat 3 (middle right)
  { top: '75%', left: '75%', transform: 'translate(-50%, -50%)' },    // Seat 4 (bottom right)
  { top: '85%', left: '50%', transform: 'translate(-50%, -50%)' },    // Seat 5 (bottom center)
  { top: '75%', left: '25%', transform: 'translate(-50%, -50%)' },    // Seat 6 (bottom left)
  { top: '50%', left: '15%', transform: 'translate(-50%, -50%)' },    // Seat 7 (middle left)
  { top: '25%', left: '25%', transform: 'translate(-50%, -50%)' },    // Seat 8 (top left)
  { top: '10%', left: '40%', transform: 'translate(-50%, -50%)' },    // Seat 9 (top left center)
]

export const PokerTable: React.FC<PokerTableProps> = ({ 
  className,
  tableId,
  currentUserId: propUserId,
  onPlayerAction: propOnPlayerAction,
  onChatMessage,
  isConnected: propIsConnected,
  isSpectating = false,
  onSeatClick,
  minBuyIn = 100,
  maxBuyIn = 1000
}) => {
  const {
    players,
    communityCards,
    pot,
    currentBet,
    gamePhase,
    activePlayerId,
    smallBlind,
    bigBlind,
    isMultiplayer,
    isConnected: storeIsConnected,
    currentUserId: storeUserId,
    playerAction,
    multiplayerAction,
    spectatorCount
  } = useGameStore()
  
  const { user } = useAuthStore()
  const currentUserId = propUserId || storeUserId || user?.id || '1' // Use prop if provided
  const isConnected = propIsConnected !== undefined ? propIsConnected : storeIsConnected

  // Create array of 9 seats, some may be empty
  const seats = Array(9).fill(null).map((_, index) => {
    return players.find(p => p.position === index) || null
  })

  const currentUserPlayer = players.find(p => p.id === currentUserId)
  const isUserTurn = activePlayerId === currentUserId
  const canAct = isUserTurn && currentUserPlayer && !currentUserPlayer.hasActed

  const handlePlayerAction = async (action: 'fold' | 'check' | 'call' | 'bet' | 'raise', amount?: number) => {
    if (!canAct) return
    
    try {
      if (propOnPlayerAction) {
        // Use provided action handler (for multiplayer)
        propOnPlayerAction(action, amount)
      } else if (isMultiplayer && isConnected) {
        // Use multiplayer WebSocket action
        await multiplayerAction(action, amount)
      } else {
        // Use local single-player action
        playerAction(currentUserId, action, amount)
      }
    } catch (error) {
      console.error('Failed to perform action:', error)
    }
  }

  const getPhaseDisplay = () => {
    switch (gamePhase) {
      case 'pre-flop': return 'Pre-Flop'
      case 'flop': return 'Flop'
      case 'turn': return 'Turn'
      case 'river': return 'River'
      case 'showdown': return 'Showdown'
      default: return 'Waiting'
    }
  }

  return (
    <div className={cn("relative w-full max-w-6xl mx-auto", className)}>
      {/* Table Background */}
      <div className="relative w-full h-[600px] bg-gradient-to-br from-green-800 to-green-900 rounded-full border-8 border-amber-700 shadow-2xl">
        {/* Table felt texture overlay */}
        <div className="absolute inset-0 rounded-full bg-green-800 opacity-80" 
             style={{ 
               backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)',
               backgroundSize: '20px 20px'
             }}>
        </div>

        {/* Inner table border */}
        <div className="absolute inset-4 rounded-full border-2 border-amber-600/50"></div>

        {/* Player Seats */}
        {seats.map((player, index) => (
          <div
            key={index}
            className="absolute"
            style={SEAT_POSITIONS[index]}
          >
            <PlayerSeat
              player={player || undefined}
              position={index}
              isCurrentUser={player?.id === currentUserId}
              isActive={player?.id === activePlayerId}
              isSpectating={isSpectating}
              onSeatClick={onSeatClick}
              minBuyIn={minBuyIn}
              maxBuyIn={maxBuyIn}
            />
          </div>
        ))}

        {/* Center Area */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-black/20 backdrop-blur-sm rounded-xl p-6 border border-white/20 max-w-md">
            
            {/* Game Phase & Pot */}
            <div className="text-center mb-4">
              <div className="text-white text-lg font-bold mb-1">{getPhaseDisplay()}</div>
              <div className="flex items-center justify-center space-x-2">
                <Coins className="w-5 h-5 text-yellow-400" />
                <span className="text-yellow-400 text-xl font-bold">
                  ${pot.toLocaleString()}
                </span>
              </div>
              <div className="text-white/70 text-sm">Total Pot</div>
            </div>

            {/* Community Cards */}
            <div className="flex justify-center space-x-2 mb-4">
              {Array(5).fill(null).map((_, index) => (
                <motion.div
                  key={index}
                  initial={{ scale: 0, rotateY: 180 }}
                  animate={{ 
                    scale: communityCards[index] ? 1 : 0.8,
                    rotateY: communityCards[index] ? 0 : 180,
                    opacity: communityCards[index] ? 1 : 0.3
                  }}
                  transition={{ delay: index * 0.2 }}
                >
                  <PokerCard
                    card={communityCards[index]}
                    size="md"
                    isHidden={!communityCards[index]}
                    className="shadow-lg"
                  />
                </motion.div>
              ))}
            </div>

            {/* Table Info */}
            <div className="flex justify-between text-white/80 text-xs">
              <div className="flex items-center space-x-1">
                <Users className="w-3 h-3" />
                <span>{players.length}/{9}</span>
              </div>
              <div>Blinds: ${smallBlind}/${bigBlind}</div>
              <div className="flex items-center space-x-1">
                <Clock className="w-3 h-3" />
                <span>Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Controls - Only show for current user when it's their turn */}
      {canAct && (
        <motion.div
          className="absolute bottom-4 left-1/2 transform -translate-x-1/2"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          <div className="bg-black/80 backdrop-blur-sm rounded-lg p-4 border border-white/20">
            <div className="flex space-x-2">
              <Button
                variant="fold"
                size="sm"
                onClick={() => handlePlayerAction('fold')}
              >
                Fold
              </Button>
              
              {currentBet === 0 ? (
                <Button
                  variant="call"
                  size="sm"
                  onClick={() => handlePlayerAction('check')}
                >
                  Check
                </Button>
              ) : (
                <Button
                  variant="call"
                  size="sm"
                  onClick={() => handlePlayerAction('call')}
                >
                  Call ${currentBet}
                </Button>
              )}
              
              <Button
                variant="raise"
                size="sm"
                onClick={() => handlePlayerAction('bet', currentBet * 2)}
              >
                {currentBet === 0 ? 'Bet' : 'Raise'} ${currentBet * 2 || smallBlind * 4}
              </Button>
            </div>
            
            <div className="text-white/70 text-xs text-center mt-2">
              Your turn • {currentUserPlayer?.timeRemaining || 30}s remaining
            </div>
          </div>
        </motion.div>
      )}

      {/* Spectator Count Indicator */}
      {spectatorCount > 0 && (
        <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 text-white">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            <span className="text-sm">
              {spectatorCount} {spectatorCount === 1 ? 'spectator' : 'spectators'}
            </span>
          </div>
        </div>
      )}

      {/* Spectator Mode Indicator */}
      {isSpectating && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600/80 backdrop-blur-sm rounded-lg px-4 py-2 text-white">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            <span className="text-sm font-medium">Spectator Mode</span>
          </div>
          <div className="text-xs mt-1 text-white/80">
            Click an empty seat to join the game
          </div>
        </div>
      )}

      {/* Table Info Panel */}
      <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm rounded-lg p-3 text-white text-sm">
        <div className="font-semibold mb-2">Texas Hold'em</div>
        <div className="space-y-1 text-xs">
          <div>Game: #{gamePhase}</div>
          <div>Current Bet: ${currentBet}</div>
          <div>Players: {players.filter(p => !p.isFolded).length} active</div>
        </div>
      </div>
    </div>
  )
}
