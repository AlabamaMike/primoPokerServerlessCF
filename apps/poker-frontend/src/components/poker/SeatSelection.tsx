'use client'

import React, { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'

interface SeatSelectionProps {
  tableId: string
  onSeatSelection: (seatNumber: number, buyInAmount: number) => void
  onCancel: () => void
}

interface Seat {
  number: number
  isOccupied: boolean
  playerId?: string
  playerName?: string
  chipCount?: number
  isActive?: boolean
}

interface BuyInOptions {
  minBuyIn: number
  maxBuyIn: number
  recommendedBuyIn: number
  smallBlind: number
  bigBlind: number
}

export default function SeatSelection({ tableId, onSeatSelection, onCancel }: SeatSelectionProps) {
  const { user } = useAuthStore()
  const [seats, setSeats] = useState<Seat[]>([])
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null)
  const [buyInAmount, setBuyInAmount] = useState<number>(0)
  const [buyInOptions, setBuyInOptions] = useState<BuyInOptions>({
    minBuyIn: 100,
    maxBuyIn: 1000,
    recommendedBuyIn: 500,
    smallBlind: 1,
    bigBlind: 2
  })
  const [playerBalance, setPlayerBalance] = useState<number>(10000) // Demo balance
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Initialize seats (9-max table)
  useEffect(() => {
    const initializeSeats = () => {
      const seatData: Seat[] = Array.from({ length: 9 }, (_, i) => ({
        number: i + 1,
        isOccupied: Math.random() < 0.3, // 30% chance of being occupied for demo
        playerId: Math.random() < 0.3 ? `player-${i}` : undefined,
        playerName: Math.random() < 0.3 ? `Player${i + 1}` : undefined,
        chipCount: Math.random() < 0.3 ? Math.floor(Math.random() * 2000) + 200 : undefined,
        isActive: Math.random() < 0.8
      }))

      setSeats(seatData)
      
      // Set recommended buy-in as default
      setBuyInAmount(buyInOptions.recommendedBuyIn)
      setLoading(false)
    }

    // Simulate API call delay
    setTimeout(initializeSeats, 500)
  }, [tableId, buyInOptions.recommendedBuyIn])

  const handleSeatClick = (seatNumber: number) => {
    const seat = seats.find(s => s.number === seatNumber)
    if (seat && !seat.isOccupied) {
      setSelectedSeat(seatNumber)
    }
  }

  const handleBuyInChange = (amount: number) => {
    setBuyInAmount(Math.max(buyInOptions.minBuyIn, Math.min(buyInOptions.maxBuyIn, amount)))
  }

  const handleJoinTable = () => {
    if (selectedSeat && buyInAmount >= buyInOptions.minBuyIn && buyInAmount <= playerBalance) {
      onSeatSelection(selectedSeat, buyInAmount)
    }
  }

  const canJoin = selectedSeat !== null && 
                 buyInAmount >= buyInOptions.minBuyIn && 
                 buyInAmount <= buyInOptions.maxBuyIn &&
                 buyInAmount <= playerBalance

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-white">Loading table information...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">Join Table - Select Your Seat</h2>
            <button 
              onClick={onCancel}
              className="text-gray-400 hover:text-white text-2xl"
            >
              ×
            </button>
          </div>
          <div className="mt-2 text-gray-300">
            Stakes: ${buyInOptions.smallBlind}/${buyInOptions.bigBlind} • Your Balance: ${playerBalance.toLocaleString()}
          </div>
        </div>

        <div className="p-6">
          {/* Poker Table Visual */}
          <div className="relative mb-8">
            <div className="mx-auto" style={{ width: '500px', height: '300px' }}>
              {/* Table */}
              <div className="absolute inset-0 bg-green-700 rounded-full border-8 border-amber-600 shadow-lg flex items-center justify-center">
                <div className="text-white text-center">
                  <div className="font-bold text-lg">Table {tableId}</div>
                  <div className="text-sm opacity-75">${buyInOptions.smallBlind}/${buyInOptions.bigBlind}</div>
                </div>
              </div>

              {/* Seats positioned around the table */}
              {seats.map((seat) => {
                const angle = ((seat.number - 1) * 40) - 90 // Distribute seats around the table
                const radian = (angle * Math.PI) / 180
                const x = 250 + 180 * Math.cos(radian) - 50 // Center + radius - half width
                const y = 150 + 100 * Math.sin(radian) - 25 // Center + radius - half height

                return (
                  <div
                    key={seat.number}
                    className={`absolute w-20 h-12 rounded-lg border-2 cursor-pointer transition-all ${
                      seat.isOccupied
                        ? 'bg-red-600 border-red-500 cursor-not-allowed'
                        : selectedSeat === seat.number
                        ? 'bg-green-600 border-green-400 shadow-lg scale-110'
                        : 'bg-gray-600 border-gray-500 hover:bg-gray-500 hover:border-gray-400'
                    }`}
                    style={{ left: `${x}px`, top: `${y}px` }}
                    onClick={() => handleSeatClick(seat.number)}
                  >
                    <div className="text-center text-white text-xs p-1">
                      <div className="font-bold">Seat {seat.number}</div>
                      {seat.isOccupied ? (
                        <div className="text-xs opacity-75">
                          {seat.playerName || 'Occupied'}
                        </div>
                      ) : (
                        <div className="text-xs opacity-75">Empty</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Buy-in Section */}
          {selectedSeat && (
            <div className="bg-gray-700 rounded-lg p-6 mb-6">
              <h3 className="text-white font-semibold mb-4">
                Buy-in for Seat {selectedSeat}
              </h3>
              
              {/* Buy-in Amount Slider */}
              <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-300 mb-2">
                  <span>Min: ${buyInOptions.minBuyIn}</span>
                  <span className="font-semibold text-white">${buyInAmount}</span>
                  <span>Max: ${buyInOptions.maxBuyIn}</span>
                </div>
                
                <input
                  type="range"
                  min={buyInOptions.minBuyIn}
                  max={Math.min(buyInOptions.maxBuyIn, playerBalance)}
                  value={buyInAmount}
                  onChange={(e) => handleBuyInChange(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                />
                
                <div className="flex justify-between mt-2">
                  <button
                    onClick={() => handleBuyInChange(buyInOptions.minBuyIn)}
                    className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded"
                  >
                    Min
                  </button>
                  <button
                    onClick={() => handleBuyInChange(buyInOptions.recommendedBuyIn)}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded"
                  >
                    Recommended
                  </button>
                  <button
                    onClick={() => handleBuyInChange(Math.min(buyInOptions.maxBuyIn, playerBalance))}
                    className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded"
                  >
                    Max
                  </button>
                </div>
              </div>

              {/* Custom Amount Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Or enter custom amount:
                </label>
                <div className="flex items-center">
                  <span className="text-white mr-2">$</span>
                  <input
                    type="number"
                    value={buyInAmount}
                    onChange={(e) => handleBuyInChange(parseInt(e.target.value) || 0)}
                    min={buyInOptions.minBuyIn}
                    max={Math.min(buyInOptions.maxBuyIn, playerBalance)}
                    className="flex-1 px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              {/* Buy-in Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-300">Big Blinds:</div>
                  <div className="text-white font-semibold">
                    {Math.floor(buyInAmount / buyInOptions.bigBlind)} BB
                  </div>
                </div>
                <div>
                  <div className="text-gray-300">Remaining Balance:</div>
                  <div className="text-white font-semibold">
                    ${(playerBalance - buyInAmount).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Validation Messages */}
              {buyInAmount < buyInOptions.minBuyIn && (
                <div className="mt-3 text-red-400 text-sm">
                  Minimum buy-in is ${buyInOptions.minBuyIn}
                </div>
              )}
              {buyInAmount > playerBalance && (
                <div className="mt-3 text-red-400 text-sm">
                  Insufficient balance. You have ${playerBalance}
                </div>
              )}
              {buyInAmount > buyInOptions.maxBuyIn && (
                <div className="mt-3 text-red-400 text-sm">
                  Maximum buy-in is ${buyInOptions.maxBuyIn}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              onClick={onCancel}
              className="flex-1 px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleJoinTable}
              disabled={!canJoin}
              className={`flex-2 px-8 py-3 rounded-lg font-medium transition-colors ${
                canJoin
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-500 text-gray-300 cursor-not-allowed'
              }`}
            >
              {selectedSeat ? `Join Seat ${selectedSeat} - $${buyInAmount}` : 'Select a Seat'}
            </button>
          </div>

          {/* Instructions */}
          <div className="mt-4 text-center text-gray-400 text-sm">
            Click on an empty seat to select it, then choose your buy-in amount
          </div>
        </div>
      </div>
    </div>
  )
}