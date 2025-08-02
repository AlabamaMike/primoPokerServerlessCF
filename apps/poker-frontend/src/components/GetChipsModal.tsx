'use client'

import React, { useState } from 'react'

interface GetChipsModalProps {
  isOpen: boolean
  onClose: () => void
  onGetChips: (amount: number) => void
  seatNumber: number
  minBuyIn: number
  maxBuyIn: number
  playerBalance?: number
}

export function GetChipsModal({
  isOpen,
  onClose,
  onGetChips,
  seatNumber,
  minBuyIn,
  maxBuyIn,
  playerBalance = 10000 // Default demo balance
}: GetChipsModalProps) {
  const [buyInAmount, setBuyInAmount] = useState(minBuyIn)
  const [isLoading, setIsLoading] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async () => {
    setIsLoading(true)
    try {
      await onGetChips(buyInAmount)
    } catch (error) {
      console.error('Failed to get chips:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAmountChange = (amount: number) => {
    setBuyInAmount(Math.max(minBuyIn, Math.min(maxBuyIn, Math.min(playerBalance, amount))))
  }

  const canProceed = buyInAmount >= minBuyIn && buyInAmount <= maxBuyIn && buyInAmount <= playerBalance

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#2d2d2d] rounded-lg max-w-md w-full border border-[#3d3d3d]">
        {/* Header */}
        <div className="p-6 border-b border-[#3d3d3d]">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Get Chips - Seat {seatNumber + 1}</h2>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl"
            >
              ×
            </button>
          </div>
          <p className="text-gray-300 text-sm mt-2">
            Add chips from your bankroll to join the table
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Player Balance */}
          <div className="mb-6 p-4 bg-[#1a1a1a] rounded-lg border border-[#3d3d3d]">
            <div className="text-sm text-gray-400">Your Bankroll</div>
            <div className="text-2xl font-bold text-[#4CAF50]">
              ${playerBalance.toLocaleString()}
            </div>
          </div>

          {/* Buy-in Amount */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Buy-in Amount
            </label>
            
            {/* Amount Input */}
            <div className="flex items-center mb-4">
              <span className="text-white mr-2 text-lg">$</span>
              <input
                type="number"
                value={buyInAmount}
                onChange={(e) => handleAmountChange(parseInt(e.target.value) || 0)}
                min={minBuyIn}
                max={Math.min(maxBuyIn, playerBalance)}
                className="flex-1 px-3 py-2 bg-[#1a1a1a] border border-[#3d3d3d] rounded text-white focus:outline-none focus:ring-2 focus:ring-[#4CAF50] focus:border-transparent"
              />
            </div>

            {/* Quick Amount Buttons */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <button
                onClick={() => handleAmountChange(minBuyIn)}
                className="px-3 py-2 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white text-sm rounded transition-colors"
              >
                Min (${minBuyIn})
              </button>
              <button
                onClick={() => handleAmountChange(Math.min(minBuyIn * 2, maxBuyIn, playerBalance))}
                className="px-3 py-2 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white text-sm rounded transition-colors"
              >
                ${Math.min(minBuyIn * 2, maxBuyIn, playerBalance)}
              </button>
              <button
                onClick={() => handleAmountChange(Math.min(maxBuyIn, playerBalance))}
                className="px-3 py-2 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white text-sm rounded transition-colors"
              >
                Max (${Math.min(maxBuyIn, playerBalance)})
              </button>
            </div>

            {/* Range Slider */}
            <input
              type="range"
              min={minBuyIn}
              max={Math.min(maxBuyIn, playerBalance)}
              value={buyInAmount}
              onChange={(e) => handleAmountChange(parseInt(e.target.value))}
              className="w-full h-2 bg-[#3d3d3d] rounded-lg appearance-none cursor-pointer"
            />
            
            {/* Range Labels */}
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>${minBuyIn}</span>
              <span>${Math.min(maxBuyIn, playerBalance)}</span>
            </div>
          </div>

          {/* Buy-in Info */}
          <div className="mb-6 p-4 bg-[#1a1a1a] rounded-lg border border-[#3d3d3d]">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-gray-400">Remaining Balance</div>
                <div className="text-white font-semibold">
                  ${(playerBalance - buyInAmount).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-gray-400">Table Stakes</div>
                <div className="text-white font-semibold">
                  ${minBuyIn} - ${maxBuyIn}
                </div>
              </div>
            </div>
          </div>

          {/* Validation Messages */}
          {buyInAmount < minBuyIn && (
            <div className="mb-4 text-red-400 text-sm">
              Minimum buy-in is ${minBuyIn}
            </div>
          )}
          {buyInAmount > playerBalance && (
            <div className="mb-4 text-red-400 text-sm">
              Insufficient balance. You have ${playerBalance}
            </div>
          )}
          {buyInAmount > maxBuyIn && (
            <div className="mb-4 text-red-400 text-sm">
              Maximum buy-in is ${maxBuyIn}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canProceed || isLoading}
              className={`flex-2 px-6 py-3 rounded font-medium transition-colors ${
                canProceed && !isLoading
                  ? 'bg-[#4CAF50] hover:bg-[#45a049] text-white'
                  : 'bg-gray-500 text-gray-300 cursor-not-allowed'
              }`}
            >
              {isLoading ? 'Getting Chips...' : `Get $${buyInAmount} Chips`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}