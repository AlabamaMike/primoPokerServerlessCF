"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { PokerTable } from "@/components/poker/PokerTable"
import { MultiplayerLobby } from "@/components/poker/MultiplayerLobby"
import { Button } from "@/components/ui/button"
import { useGameStore } from "@/stores/game-store"
import { Play, RotateCcw, Users, TrendingUp, Wifi, WifiOff, Monitor } from "lucide-react"

export default function TableDemoPage() {
  const {
    gamePhase,
    isGameActive,
    isMultiplayer,
    isConnected,
    connectionStatus,
    players,
    pot,
    startNewGame,
    dealCommunityCards,
    nextPhase,
    disconnectFromTable
  } = useGameStore()

  const [demoMode, setDemoMode] = React.useState<'single' | 'multiplayer'>('single')
  const [currentTableId, setCurrentTableId] = React.useState<string | null>(null)

  const handleStartDemo = () => {
    startNewGame()
  }

  const handleNextPhase = () => {
    switch (gamePhase) {
      case 'pre-flop':
        dealCommunityCards('flop')
        nextPhase()
        break
      case 'flop':
        dealCommunityCards('turn')
        nextPhase()
        break
      case 'turn':
        dealCommunityCards('river')
        nextPhase()
        break
      default:
        break
    }
  }

  const handleJoinTable = (tableId: string) => {
    setCurrentTableId(tableId)
    setDemoMode('multiplayer')
  }

  const handleSwitchToSinglePlayer = () => {
    if (isMultiplayer && isConnected) {
      disconnectFromTable()
    }
    setDemoMode('single')
    setCurrentTableId(null)
    startNewGame()
  }

  const activePlayers = players.filter(p => !p.isFolded)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <div className="bg-black/20 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">
                🃏 Primo Poker - {demoMode === 'multiplayer' ? 'Multiplayer' : 'Single Player'} Demo
              </h1>
              <p className="text-white/70 text-sm mt-1">
                {demoMode === 'multiplayer' 
                  ? 'Real-time multiplayer poker with live opponents'
                  : 'Interactive single-player poker simulation'
                }
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Mode Switcher */}
              <div className="flex bg-black/40 rounded-lg p-1">
                <Button
                  onClick={() => setDemoMode('single')}
                  variant={demoMode === 'single' ? 'default' : 'ghost'}
                  size="sm"
                  className={demoMode === 'single' ? 'bg-blue-600' : 'text-white'}
                >
                  <Monitor className="w-4 h-4 mr-2" />
                  Single Player
                </Button>
                <Button
                  onClick={() => setDemoMode('multiplayer')}
                  variant={demoMode === 'multiplayer' ? 'default' : 'ghost'}
                  size="sm"
                  className={demoMode === 'multiplayer' ? 'bg-green-600' : 'text-white'}
                >
                  <Users className="w-4 h-4 mr-2" />
                  Multiplayer
                </Button>
              </div>

              {/* Connection Status */}
              {demoMode === 'multiplayer' && (
                <div className="flex items-center space-x-2 bg-black/40 rounded-lg px-3 py-2">
                  {isConnected ? <Wifi className="w-4 h-4 text-green-400" /> : <WifiOff className="w-4 h-4 text-red-400" />}
                  <span className={`text-sm ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                    {connectionStatus}
                  </span>
                </div>
              )}

              {/* Game Stats */}
              <div className="bg-black/40 rounded-lg px-3 py-2 text-white text-sm">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-1">
                    <Users className="w-4 h-4" />
                    <span>{activePlayers.length} Active</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <TrendingUp className="w-4 h-4" />
                    <span>${pot.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Demo Controls */}
              {demoMode === 'single' && (
                <div className="flex space-x-2">
                  <Button
                    onClick={handleStartDemo}
                    variant="default"
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    {isGameActive ? 'New Hand' : 'Start Demo'}
                  </Button>
                  
                  {isGameActive && gamePhase !== 'showdown' && (
                    <Button
                      onClick={handleNextPhase}
                      variant="outline"
                      size="sm"
                    >
                      Next Phase
                    </Button>
                  )}
                </div>
              )}

              {demoMode === 'multiplayer' && isConnected && (
                <Button
                  onClick={handleSwitchToSinglePlayer}
                  variant="outline"
                  size="sm"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Exit Multiplayer
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Poker Table or Multiplayer Lobby */}
          <div className="lg:col-span-3">
            {demoMode === 'single' || (demoMode === 'multiplayer' && isConnected && currentTableId) ? (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5 }}
              >
                <PokerTable className="mb-6" />
              </motion.div>
            ) : (
              <MultiplayerLobby onJoinTable={handleJoinTable} />
            )}

            {/* Game Status - Only show when at a table */}
            {(demoMode === 'single' || (demoMode === 'multiplayer' && isConnected && currentTableId)) && (
              <div className="bg-black/40 backdrop-blur-sm rounded-lg p-4 border border-white/10">
                <h3 className="text-white font-semibold mb-3">Game Status</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-white/70">Phase</div>
                    <div className="text-white font-semibold capitalize">
                      {gamePhase.replace('-', ' ')}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-white/70">Active Players</div>
                    <div className="text-white font-semibold">
                      {activePlayers.length}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-white/70">Total Pot</div>
                    <div className="text-green-400 font-semibold">
                      ${pot.toLocaleString()}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-white/70">Mode</div>
                    <div className="text-white font-semibold">
                      {isMultiplayer ? 'Live Multiplayer' : 'Single Player'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar - Player List & Controls */}
          <div className="space-y-6">
            
            {/* Player Overview - Only show when at a table */}
            {(demoMode === 'single' || (demoMode === 'multiplayer' && isConnected && currentTableId)) && (
              <div className="bg-black/40 backdrop-blur-sm rounded-lg p-4 border border-white/10">
                <h3 className="text-white font-semibold mb-3">Players</h3>
                <div className="space-y-2">
                  {players.map((player) => (
                    <motion.div
                      key={player.id}
                      className={`flex items-center justify-between p-2 rounded-lg border ${
                        player.isFolded 
                          ? 'bg-red-500/10 border-red-500/20' 
                          : 'bg-green-500/10 border-green-500/20'
                      }`}
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: parseInt(player.id) * 0.1 }}
                    >
                      <div className="flex items-center space-x-2">
                        <div className="w-6 h-6 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-white text-xs font-bold">
                          {player.position + 1}
                        </div>
                        <div>
                          <div className="text-white text-sm font-medium">
                            {player.name}
                          </div>
                          <div className="text-white/60 text-xs">
                            Seat {player.position + 1}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-yellow-400 text-sm font-semibold">
                          ${player.chips.toLocaleString()}
                        </div>
                        <div className="text-white/60 text-xs">
                          {player.isFolded ? 'Folded' : player.lastAction || 'Waiting'}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Demo Information */}
            <div className="bg-black/40 backdrop-blur-sm rounded-lg p-4 border border-white/10">
              <h3 className="text-white font-semibold mb-3">
                {demoMode === 'multiplayer' ? 'Multiplayer Features' : 'Demo Features'}
              </h3>
              <div className="text-white/80 text-sm space-y-2">
                {demoMode === 'multiplayer' ? (
                  <>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span>Real-time WebSocket connection</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span>Live player actions</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span>Synchronized game state</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span>Table lobbies</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                      <span>Auto-reconnection</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                      <span>Turn timers</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span>Interactive player seats</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span>Animated card dealing</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span>Real-time game state</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span>Professional UI/UX</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                      <span>Betting actions (simulated)</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                      <span>Phase progression</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-black/40 backdrop-blur-sm rounded-lg p-4 border border-white/10">
              <h3 className="text-white font-semibold mb-3">Quick Actions</h3>
              <div className="space-y-2">
                {demoMode === 'single' ? (
                  <>
                    <Button
                      onClick={handleStartDemo}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reset Demo
                    </Button>
                    {isGameActive && (
                      <Button
                        onClick={handleNextPhase}
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        disabled={gamePhase === 'showdown'}
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Advance Phase
                      </Button>
                    )}
                  </>
                ) : (
                  <Button
                    onClick={handleSwitchToSinglePlayer}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                  >
                    <Monitor className="w-4 h-4 mr-2" />
                    Switch to Single Player
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
