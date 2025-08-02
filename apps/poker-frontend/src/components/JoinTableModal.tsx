import React, { useState, useEffect } from 'react'

interface PlayerInfo {
  seat: number
  username: string
  chipCount: number
}

interface JoinTableModalProps {
  isOpen: boolean
  onClose: () => void
  onJoin: (buyIn: number, seat?: number) => void
  tableName: string
  minBuyIn: number
  maxBuyIn: number
  smallBlind: number
  bigBlind: number
  maxPlayers?: number
  currentPlayers?: PlayerInfo[]
}

export const JoinTableModal: React.FC<JoinTableModalProps> = ({
  isOpen,
  onClose,
  onJoin,
  tableName,
  minBuyIn,
  maxBuyIn,
  smallBlind,
  bigBlind,
  maxPlayers = 9,
  currentPlayers = []
}) => {
  const [buyIn, setBuyIn] = useState(Math.min(maxBuyIn, minBuyIn * 5))
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null)

  // Find available seats
  const occupiedSeats = new Set(currentPlayers.map(p => p.seat))
  const availableSeats = Array.from({ length: maxPlayers }, (_, i) => i)
    .filter(seat => !occupiedSeats.has(seat))

  // Auto-select first available seat
  useEffect(() => {
    if (availableSeats.length > 0 && selectedSeat === null) {
      setSelectedSeat(availableSeats[0])
    }
  }, [availableSeats, selectedSeat])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedSeat !== null) {
      onJoin(buyIn, selectedSeat)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold text-white mb-4">Join Table</h2>
        
        <div className="mb-4">
          <p className="text-gray-300">Table: <span className="font-semibold text-white">{tableName}</span></p>
          <p className="text-gray-300">Blinds: <span className="text-white">${smallBlind}/${bigBlind}</span></p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="buyIn" className="block text-sm font-medium text-gray-300 mb-2">
              Buy-in Amount
            </label>
            <input
              type="number"
              id="buyIn"
              min={minBuyIn}
              max={maxBuyIn}
              step={1}
              value={buyIn}
              onChange={(e) => setBuyIn(Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              required
            />
            <p className="text-sm text-gray-400 mt-1">
              Min: ${minBuyIn} - Max: ${maxBuyIn}
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Select Seat ({availableSeats.length} available)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: maxPlayers }, (_, i) => i).map(seat => {
                const isOccupied = occupiedSeats.has(seat)
                const player = currentPlayers.find(p => p.seat === seat)
                const isSelected = selectedSeat === seat
                
                return (
                  <button
                    key={seat}
                    type="button"
                    disabled={isOccupied}
                    onClick={() => !isOccupied && setSelectedSeat(seat)}
                    className={`
                      p-2 rounded text-sm font-medium transition-all
                      ${isOccupied 
                        ? 'bg-red-900/50 text-red-300 cursor-not-allowed' 
                        : isSelected
                          ? 'bg-green-600 text-white ring-2 ring-green-400'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }
                    `}
                  >
                    <div>Seat {seat + 1}</div>
                    {player && (
                      <div className="text-xs text-gray-400 truncate">
                        {player.username}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={selectedSeat === null}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {selectedSeat !== null 
                ? `Join Table - Seat ${selectedSeat + 1} (${buyIn})`
                : 'Select a seat'
              }
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}