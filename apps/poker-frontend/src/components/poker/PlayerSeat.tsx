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
}

export const PlayerSeat: React.FC<PlayerSeatProps> = ({
  player,
  position,
  isCurrentUser = false,
  isActive = false,
  className
}) => {
  if (!player) {
    // Empty seat
    return (
      <div
        className={cn(
          "relative w-24 h-32 flex flex-col items-center justify-center",
          "border-2 border-dashed border-gray-500/30 rounded-lg",
          "text-gray-500 text-sm hover:border-gray-400/50 transition-colors",
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
