"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Card as CardType, Suit, Rank } from "@primo-poker/shared"

interface PokerCardProps {
  card?: CardType
  isHidden?: boolean
  size?: "sm" | "md" | "lg"
  className?: string
  onClick?: () => void
}

const suitSymbols: Record<Suit, string> = {
  [Suit.HEARTS]: "♥",
  [Suit.DIAMONDS]: "♦", 
  [Suit.CLUBS]: "♣",
  [Suit.SPADES]: "♠"
}

const suitColors: Record<Suit, string> = {
  [Suit.HEARTS]: "text-red-600",
  [Suit.DIAMONDS]: "text-red-600",
  [Suit.CLUBS]: "text-black",
  [Suit.SPADES]: "text-black"
}

const rankSymbols: Record<Rank, string> = {
  [Rank.ACE]: "A",
  [Rank.TWO]: "2",
  [Rank.THREE]: "3", 
  [Rank.FOUR]: "4",
  [Rank.FIVE]: "5",
  [Rank.SIX]: "6",
  [Rank.SEVEN]: "7",
  [Rank.EIGHT]: "8",
  [Rank.NINE]: "9",
  [Rank.TEN]: "10",
  [Rank.JACK]: "J",
  [Rank.QUEEN]: "Q",
  [Rank.KING]: "K"
}

const cardSizes = {
  sm: "w-12 h-16 text-xs",
  md: "w-16 h-24 text-sm", 
  lg: "w-20 h-28 text-base"
}

export const PokerCard: React.FC<PokerCardProps> = ({
  card,
  isHidden = false,
  size = "md",
  className,
  onClick
}) => {
  const [isFlipped, setIsFlipped] = React.useState(isHidden)

  React.useEffect(() => {
    if (!isHidden && isFlipped) {
      // Delay the flip to create a nice animation
      const timer = setTimeout(() => setIsFlipped(false), 100)
      return () => clearTimeout(timer)
    }
  }, [isHidden, isFlipped])

  const handleClick = () => {
    if (onClick) {
      onClick()
    }
  }

  return (
    <motion.div
      className={cn(
        "relative cursor-pointer select-none",
        cardSizes[size],
        className
      )}
      onClick={handleClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      initial={{ rotateY: isHidden ? 180 : 0 }}
      animate={{ rotateY: isFlipped ? 180 : 0 }}
      transition={{ duration: 0.3 }}
      style={{ transformStyle: "preserve-3d" }}
    >
      {/* Card Back */}
      <div 
        className={cn(
          "absolute inset-0 backface-hidden rounded-lg border-2 border-gray-700",
          "bg-gradient-to-br from-blue-800 to-blue-900",
          "flex items-center justify-center"
        )}
        style={{ transform: "rotateY(180deg)" }}
      >
        <div className="w-full h-full bg-blue-800 rounded-md flex items-center justify-center">
          <div className="text-white text-xs opacity-70">🂠</div>
        </div>
      </div>

      {/* Card Front */}
      <div 
        className={cn(
          "absolute inset-0 backface-hidden rounded-lg border-2 border-gray-300",
          "bg-white shadow-lg flex flex-col justify-between p-1"
        )}
      >
        {card && !isFlipped && (
          <>
            {/* Top left rank and suit */}
            <div className={cn(
              "flex flex-col items-center leading-none",
              suitColors[card.suit]
            )}>
              <div className="font-bold">{rankSymbols[card.rank]}</div>
              <div className="text-lg leading-none">{suitSymbols[card.suit]}</div>
            </div>

            {/* Center suit symbol */}
            <div className={cn(
              "flex-1 flex items-center justify-center text-2xl",
              suitColors[card.suit]
            )}>
              {suitSymbols[card.suit]}
            </div>

            {/* Bottom right rank and suit (rotated) */}
            <div 
              className={cn(
                "flex flex-col items-center leading-none transform rotate-180",
                suitColors[card.suit]
              )}
            >
              <div className="font-bold">{rankSymbols[card.rank]}</div>
              <div className="text-lg leading-none">{suitSymbols[card.suit]}</div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  )
}

// Card placeholder component for empty slots
export const CardPlaceholder: React.FC<{
  size?: "sm" | "md" | "lg"
  className?: string
}> = ({ size = "md", className }) => {
  return (
    <div
      className={cn(
        "border-2 border-dashed border-gray-400 rounded-lg",
        "bg-gray-100 flex items-center justify-center",
        cardSizes[size], 
        className
      )}
    >
      <div className="text-gray-400 text-xs">?</div>
    </div>
  )
}
