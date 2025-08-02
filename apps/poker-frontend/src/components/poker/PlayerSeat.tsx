"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { PokerCard } from "@/components/poker/Card"
import { Player } from "@/stores/game-store"
import { Timer, Crown, Coins } from "lucide-react"

interface PlayerSeatProps {
  player?: Player
  position: number
  isCurrentUser?: boolean
  isActive?: boolean
  className?: string
  isSpectating?: boolean
  onSeatClick?: (position: number) => void
  minBuyIn?: number
  maxBuyIn?: number
  isReserved?: boolean
  isMyReservation?: boolean
}

export const PlayerSeat: React.FC<PlayerSeatProps> = ({
  player,
  position,
  isCurrentUser = false,
  isActive = false,
  className,
  isSpectating = false,
  onSeatClick,
  minBuyIn,
  maxBuyIn,
  isReserved = false,
  isMyReservation = false
}) => {
  const [showSeatInfo, setShowSeatInfo] = React.useState(false)
  
  const getPositionName = (pos: number) => {
    const positions = ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'CO', 'BTN-1']
    return positions[pos] || `Seat ${pos + 1}`
  }
  if (!player) {
    // Empty seat
    if (isSpectating && onSeatClick) {
      return (
        <motion.div
          className="relative"
          onMouseEnter={() => setShowSeatInfo(true)}
          onMouseLeave={() => setShowSeatInfo(false)}
        >
          <motion.button
            onClick={() => !isReserved && onSeatClick(position)}
            disabled={isReserved && !isMyReservation}
            className={cn(
              "relative w-24 h-32 flex flex-col items-center justify-center",
              "border-2 rounded-lg transition-all",
              isReserved && !isMyReservation ? [
                "border-orange-500/50 bg-orange-500/10",
                "text-orange-400 cursor-not-allowed"
              ] : isMyReservation ? [
                "border-blue-500 bg-blue-500/20",
                "text-blue-400 cursor-pointer"
              ] : [
                "border-dashed border-green-500/50",
                "text-green-400 hover:border-green-400 hover:bg-green-500/10",
                "cursor-pointer group"
              ],
              className
            )}
            whileHover={!isReserved ? { scale: 1.05 } : {}}
            whileTap={!isReserved ? { scale: 0.95 } : {}}
          >
            {isReserved ? (
              <>
                <div className="text-xs font-semibold">
                  {isMyReservation ? 'Your Seat' : 'Reserved'}
                </div>
                <div className="text-xs opacity-60 mt-1">
                  {isMyReservation ? 'Complete buy-in' : 'Please wait'}
                </div>
              </>
            ) : (
              <>
                <div className="text-xs font-semibold group-hover:text-green-300">Open Seat</div>
                <div className="text-xs opacity-60">{getPositionName(position)}</div>
                <div className="text-xs mt-1 opacity-80">Click to Join</div>
              </>
            )}
          </motion.button>
          
          {/* Seat info tooltip */}
          {showSeatInfo && !isReserved && minBuyIn && maxBuyIn && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 z-10"
            >
              <div className="bg-black/90 backdrop-blur-sm border border-white/20 rounded-lg p-3 whitespace-nowrap">
                <div className="text-xs space-y-1">
                  <div className="font-semibold text-white">Seat #{position + 1}</div>
                  <div className="text-gray-300">Position: {getPositionName(position)}</div>
                  <div className="text-green-400">
                    Buy-in: ${minBuyIn} - ${maxBuyIn}
                  </div>
                </div>
                <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-black/90 rotate-45 border-r border-b border-white/20"></div>
              </div>
            </motion.div>
          )}
        </motion.div>
      )
    }
    
    // Regular empty seat (non-spectating)
    return (
      <div
        className={cn(
          "relative w-24 h-32 flex flex-col items-center justify-center",
          "border-2 border-dashed border-gray-500/30 rounded-lg",
          "text-gray-500 text-sm",
          className
        )}
      >
        <div className="text-xs">Empty Seat</div>
        <div className="text-xs opacity-60">#{position + 1}</div>
      </div>
    )
  }

  const getActionColor = () => {
    switch (player.lastAction) {
      case 'fold': return 'text-red-400'
      case 'call': return 'text-blue-400'
      case 'bet':
      case 'raise': return 'text-yellow-400'
      case 'check': return 'text-green-400'
      case 'all-in': return 'text-purple-400'
      default: return 'text-gray-400'
    }
  }

  const getActionText = () => {
    if (player.isFolded) return 'FOLDED'
    if (player.isAllIn) return 'ALL IN'
    if (player.lastAction) {
      return player.lastAction.toUpperCase().replace('-', ' ')
    }
    return ''
  }

  return (
    <motion.div
      className={cn(
        "relative flex flex-col items-center space-y-2",
        isActive && "ring-2 ring-yellow-400 ring-opacity-75 rounded-lg p-1",
        player.isFolded && "opacity-50",
        className
      )}
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Player Avatar & Info */}
      <div className="relative">
        <div
          className={cn(
            "w-16 h-16 rounded-full border-2 flex items-center justify-center",
            "bg-gradient-to-br from-gray-700 to-gray-800",
            isCurrentUser ? "border-green-400" : "border-gray-600",
            isActive && "border-yellow-400 shadow-lg shadow-yellow-400/25"
          )}
        >
          {/* Avatar placeholder */}
          <div className="text-white text-xl font-bold">
            {player.username.charAt(0).toUpperCase()}
          </div>
        </div>

        {/* Dealer Button */}
        {player.isDealer && (
          <div className="absolute -top-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center text-xs font-bold text-black">
            D
          </div>
        )}

        {/* Blind Indicators */}
        {player.isSmallBlind && (
          <div className="absolute -bottom-1 -left-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
            SB
          </div>
        )}
        {player.isBigBlind && (
          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
            BB
          </div>
        )}

        {/* Timer */}
        {isActive && player.timeRemaining && (
          <motion.div
            className="absolute -top-8 left-1/2 transform -translate-x-1/2"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
          >
            <div className="flex items-center space-x-1 bg-yellow-500 text-black px-2 py-1 rounded text-xs font-bold">
              <Timer className="w-3 h-3" />
              <span>{player.timeRemaining}s</span>
            </div>
          </motion.div>
        )}
      </div>

      {/* Player Name */}
      <div className="text-white text-sm font-medium text-center min-w-0">
        <div className="truncate max-w-20">{player.username}</div>
      </div>

      {/* Chip Count */}
      <div className="flex items-center space-x-1 bg-black/40 px-2 py-1 rounded text-xs">
        <Coins className="w-3 h-3 text-yellow-400" />
        <span className="text-yellow-400 font-bold">
          ${player.chipCount.toLocaleString()}
        </span>
      </div>

      {/* Current Bet */}
      {player.currentBet > 0 && (
        <motion.div
          className="bg-green-600 text-white px-2 py-1 rounded text-xs font-bold"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
        >
          ${player.currentBet}
        </motion.div>
      )}

      {/* Last Action */}
      {getActionText() && (
        <div className={cn("text-xs font-bold", getActionColor())}>
          {getActionText()}
        </div>
      )}

      {/* Hole Cards */}
      <div className="flex space-x-1">
        {player.holeCards ? (
          player.holeCards.map((card, index) => (
            <PokerCard
              key={index}
              card={card}
              size="sm"
              isHidden={!isCurrentUser}
              className="transform hover:scale-110 transition-transform"
            />
          ))
        ) : (
          // Hidden cards for other players or waiting state
          <>
            <PokerCard size="sm" isHidden className="opacity-60" />
            <PokerCard size="sm" isHidden className="opacity-60" />
          </>
        )}
      </div>
    </motion.div>
  )
}
