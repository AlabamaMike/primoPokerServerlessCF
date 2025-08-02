import React, { useState } from 'react'

interface JoinTableModalProps {
  isOpen: boolean
  onClose: () => void
  onJoin: (buyIn: number) => void
  tableName: string
  minBuyIn: number
  maxBuyIn: number
  smallBlind: number
  bigBlind: number
}

export const JoinTableModal: React.FC<JoinTableModalProps> = ({
  isOpen,
  onClose,
  onJoin,
  tableName,
  minBuyIn,
  maxBuyIn,
  smallBlind,
  bigBlind
}) => {
  const [buyIn, setBuyIn] = useState(Math.min(maxBuyIn, minBuyIn * 5))

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onJoin(buyIn)
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

          <div className="flex gap-3">
            <button
              type="submit"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              Join Table (${buyIn})
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