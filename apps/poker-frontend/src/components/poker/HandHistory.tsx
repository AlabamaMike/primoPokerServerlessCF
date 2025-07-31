/**
 * HandHistory Component
 * Displays recent hands with results and key actions
 */

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, HandResult } from '@/lib/hand-evaluator';

interface HandHistoryEntry {
  id: string;
  handNumber: number;
  timestamp: Date;
  pot: number;
  winner: {
    name: string;
    handResult: HandResult;
    winnings: number;
  };
  communityCards: Card[];
  playerCount: number;
  keyActions: string[];
}

interface HandHistoryProps {
  hands: HandHistoryEntry[];
  isVisible: boolean;
  onClose: () => void;
}

export default function HandHistory({ hands, isVisible, onClose }: HandHistoryProps) {
  const [selectedHand, setSelectedHand] = useState<HandHistoryEntry | null>(null);

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden border border-amber-500/30"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-700">
            <h2 className="text-2xl font-bold text-amber-400">
              📜 Hand History
            </h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white text-xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-700 transition-all"
            >
              ×
            </button>
          </div>

          <div className="flex h-[calc(80vh-100px)]">
            {/* Hand List */}
            <div className="w-1/2 p-4 overflow-y-auto border-r border-slate-700">
              <div className="space-y-2">
                {hands.length === 0 ? (
                  <div className="text-center text-slate-400 py-8">
                    <p>No hands played yet</p>
                    <p className="text-sm">Start playing to see hand history!</p>
                  </div>
                ) : (
                  hands.map((hand) => (
                    <motion.button
                      key={hand.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedHand(hand)}
                      className={`w-full p-3 rounded-lg border text-left transition-all ${
                        selectedHand?.id === hand.id
                          ? 'bg-amber-900/30 border-amber-400/50 shadow-lg'
                          : 'bg-slate-800/50 border-slate-600/50 hover:bg-slate-700/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-amber-300">
                          Hand #{hand.handNumber}
                        </span>
                        <span className="text-green-400 font-bold">
                          ${hand.pot}
                        </span>
                      </div>
                      
                      <div className="text-sm text-slate-300 mb-1">
                        Winner: <span className="font-medium">{hand.winner.name}</span>
                      </div>
                      
                      <div className="text-xs text-slate-400">
                        {hand.winner.handResult.handName} • {hand.playerCount} players
                      </div>
                      
                      <div className="text-xs text-slate-500 mt-1">
                        {hand.timestamp.toLocaleTimeString()}
                      </div>
                    </motion.button>
                  ))
                )}
              </div>
            </div>

            {/* Hand Details */}
            <div className="w-1/2 p-4 overflow-y-auto">
              {selectedHand ? (
                <motion.div
                  key={selectedHand.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-4"
                >
                  {/* Hand Summary */}
                  <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600/50">
                    <h3 className="font-bold text-amber-300 mb-3">
                      Hand #{selectedHand.handNumber} Summary
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-slate-400">Pot Size:</span>
                        <span className="text-green-400 font-bold ml-2">${selectedHand.pot}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Players:</span>
                        <span className="text-slate-300 ml-2">{selectedHand.playerCount}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Time:</span>
                        <span className="text-slate-300 ml-2">
                          {selectedHand.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Date:</span>
                        <span className="text-slate-300 ml-2">
                          {selectedHand.timestamp.toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Community Cards */}
                  <div className="bg-green-800/30 rounded-lg p-4 border border-green-600/30">
                    <h4 className="font-bold text-green-300 mb-3">Community Cards</h4>
                    <div className="flex gap-2">
                      {selectedHand.communityCards.map((card, index) => (
                        <PlayingCard key={index} card={card} size="sm" />
                      ))}
                    </div>
                  </div>

                  {/* Winner Information */}
                  <div className="bg-amber-900/30 rounded-lg p-4 border border-amber-400/30">
                    <h4 className="font-bold text-amber-300 mb-3 flex items-center gap-2">
                      👑 Winner
                    </h4>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-200">
                          {selectedHand.winner.name}
                        </span>
                        <span className="text-green-400 font-bold">
                          +${selectedHand.winner.winnings}
                        </span>
                      </div>
                      
                      <div className="text-amber-200">
                        <span className="font-bold">{selectedHand.winner.handResult.handName}</span>
                      </div>
                      
                      <div className="text-sm text-amber-300">
                        {selectedHand.winner.handResult.handDescription}
                      </div>

                      {/* Winning Cards */}
                      <div className="mt-3">
                        <p className="text-amber-200 text-sm mb-2">Best 5-Card Hand:</p>
                        <div className="flex gap-1">
                          {selectedHand.winner.handResult.cards.map((card, index) => (
                            <PlayingCard key={index} card={card} size="xs" />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Key Actions */}
                  <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600/50">
                    <h4 className="font-bold text-slate-300 mb-3">Key Actions</h4>
                    <div className="space-y-1">
                      {selectedHand.keyActions.map((action, index) => (
                        <div key={index} className="text-sm text-slate-400 flex items-center gap-2">
                          <span className="w-1 h-1 bg-slate-500 rounded-full"></span>
                          {action}
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">
                  <div className="text-center">
                    <div className="text-4xl mb-2">📋</div>
                    <p>Select a hand to view details</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Reuse PlayingCard component from ShowdownDisplay
interface PlayingCardProps {
  card: Card;
  size: 'xs' | 'sm' | 'md' | 'lg';
}

function PlayingCard({ card, size }: PlayingCardProps) {
  const sizeClasses = {
    xs: 'w-6 h-9 text-xs',
    sm: 'w-10 h-14 text-sm',
    md: 'w-14 h-20 text-base',
    lg: 'w-18 h-24 text-lg'
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
      bg-white rounded border border-gray-300 shadow-sm
      flex flex-col items-center justify-between p-1
      ${isRed ? 'text-red-600' : 'text-black'}
      font-bold relative
    `}>
      {/* Top-left rank and suit */}
      <div className="self-start text-left leading-none">
        <div>{card.rank}</div>
        <div className="text-center">{suitSymbols[card.suit]}</div>
      </div>
      
      {/* Center suit symbol */}
      <div className={`text-center ${
        size === 'xs' ? 'text-sm' : 
        size === 'sm' ? 'text-lg' : 
        size === 'md' ? 'text-xl' : 'text-2xl'
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
