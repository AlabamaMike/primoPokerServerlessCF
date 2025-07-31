/**
 * ShowdownDisplay Component
 * Shows hand results, winners, and pot distribution at the end of each hand
 */

'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/lib/hand-evaluator';
import { HandResult } from '@/lib/hand-evaluator';

interface ShowdownPlayer {
  id: string;
  name: string;
  holeCards: Card[];
  handResult: HandResult;
  isWinner: boolean;
  winnings: number;
  position: number;
}

interface ShowdownDisplayProps {
  players: ShowdownPlayer[];
  communityCards: Card[];
  totalPot: number;
  isVisible: boolean;
  onComplete: () => void;
}

export default function ShowdownDisplay({
  players,
  communityCards,
  totalPot,
  isVisible,
  onComplete
}: ShowdownDisplayProps) {
  if (!isVisible) return null;

  const winners = players.filter(p => p.isWinner);
  const activePlayers = players.filter(p => p.holeCards.length > 0);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 max-w-4xl w-full mx-4 border border-amber-500/30"
        >
          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold text-amber-400 mb-2">
              🏆 Showdown Results
            </h2>
            <p className="text-slate-300">
              Total Pot: <span className="text-green-400 font-bold">${totalPot}</span>
            </p>
          </div>

          {/* Community Cards */}
          <div className="flex justify-center mb-8">
            <div className="bg-green-800/50 rounded-xl p-4 border border-green-600/30">
              <p className="text-green-300 text-sm font-medium mb-3 text-center">Community Cards</p>
              <div className="flex gap-2">
                {communityCards.map((card, index) => (
                  <motion.div
                    key={index}
                    initial={{ rotateY: 180 }}
                    animate={{ rotateY: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <PlayingCard card={card} size="md" />
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Player Results */}
          <div className="space-y-4 mb-6">
            {activePlayers.map((player, index) => (
              <motion.div
                key={player.id}
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.3 + (index * 0.1) }}
                className={`p-4 rounded-xl border-2 transition-all ${
                  player.isWinner
                    ? 'bg-gradient-to-r from-amber-900/50 to-yellow-900/50 border-amber-400/50 shadow-lg shadow-amber-400/20'
                    : 'bg-slate-800/50 border-slate-600/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  {/* Player Info & Cards */}
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`font-bold ${player.isWinner ? 'text-amber-300' : 'text-slate-300'}`}>
                          {player.name}
                        </span>
                        {player.isWinner && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.5 + index * 0.1 }}
                            className="text-amber-400 text-xl"
                          >
                            👑
                          </motion.span>
                        )}
                      </div>
                      
                      {/* Hole Cards */}
                      <div className="flex gap-1 mb-2">
                        {player.holeCards.map((card, cardIndex) => (
                          <motion.div
                            key={cardIndex}
                            initial={{ rotateY: 180 }}
                            animate={{ rotateY: 0 }}
                            transition={{ delay: 0.4 + (index * 0.1) + (cardIndex * 0.05) }}
                          >
                            <PlayingCard card={card} size="sm" />
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Hand Details */}
                  <div className="text-right">
                    <div className={`font-bold text-lg mb-1 ${
                      player.isWinner ? 'text-amber-300' : 'text-slate-300'
                    }`}>
                      {player.handResult.handName}
                    </div>
                    <div className={`text-sm mb-2 ${
                      player.isWinner ? 'text-amber-200' : 'text-slate-400'
                    }`}>
                      {player.handResult.handDescription}
                    </div>
                    {player.winnings > 0 && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.6 + index * 0.1 }}
                        className="text-green-400 font-bold text-lg"
                      >
                        +${player.winnings}
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* Best 5-Card Hand Highlight */}
                {player.isWinner && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 + index * 0.1 }}
                    className="mt-3 pt-3 border-t border-amber-400/30"
                  >
                    <p className="text-amber-200 text-sm mb-2">Winning Hand:</p>
                    <div className="flex gap-1">
                      {player.handResult.cards.map((card, cardIndex) => (
                        <PlayingCard key={cardIndex} card={card} size="xs" />
                      ))}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>

          {/* Winner Summary */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0 }}
            className="text-center p-4 bg-gradient-to-r from-amber-900/30 to-yellow-900/30 rounded-xl border border-amber-400/30"
          >
            {winners.length === 1 ? (
              <p className="text-amber-300 text-lg">
                🎉 <span className="font-bold">{winners[0].name}</span> wins with{' '}
                <span className="font-bold">{winners[0].handResult.handName}</span>!
              </p>
            ) : (
              <p className="text-amber-300 text-lg">
                🤝 Split pot between {winners.map(w => w.name).join(' and ')}
              </p>
            )}
          </motion.div>

          {/* Continue Button */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="flex justify-center mt-6"
          >
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onComplete}
              className="px-8 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white font-bold rounded-xl border border-green-500/50 shadow-lg shadow-green-500/20 transition-all"
            >
              Continue to Next Hand
            </motion.button>
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Playing Card Component for Showdown Display
interface PlayingCardProps {
  card: Card;
  size: 'xs' | 'sm' | 'md' | 'lg';
}

function PlayingCard({ card, size }: PlayingCardProps) {
  const sizeClasses = {
    xs: 'w-8 h-12 text-xs',
    sm: 'w-12 h-16 text-sm',
    md: 'w-16 h-24 text-base',
    lg: 'w-20 h-28 text-lg'
  };

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  
  const suitSymbols = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠'
  };

  return (
    <div className={`
      ${sizeClasses[size]}
      bg-white rounded-lg border border-gray-300 shadow-md
      flex flex-col items-center justify-between p-1
      ${isRed ? 'text-red-600' : 'text-black'}
      font-bold relative overflow-hidden
    `}>
      {/* Top-left rank and suit */}
      <div className="self-start text-left leading-none">
        <div>{card.rank}</div>
        <div className="text-center">{suitSymbols[card.suit]}</div>
      </div>
      
      {/* Center suit symbol */}
      <div className={`text-center ${
        size === 'xs' ? 'text-base' : 
        size === 'sm' ? 'text-xl' : 
        size === 'md' ? 'text-2xl' : 'text-3xl'
      }`}>
        {suitSymbols[card.suit]}
      </div>
      
      {/* Bottom-right rank and suit (rotated) */}
      <div className="self-end text-right leading-none transform rotate-180">
        <div>{card.rank}</div>
        <div className="text-center">{suitSymbols[card.suit]}</div>
      </div>
    </div>
  );
}
