'use client'

import React, { useState } from 'react'
import { useBankrollStore } from '@/stores/bankroll-store'
import { DollarSign, AlertCircle } from 'lucide-react'

interface DepositModalProps {
  isOpen: boolean
  onClose: () => void
}

export function DepositModal({ isOpen, onClose }: DepositModalProps) {
  const [amount, setAmount] = useState(1000)
  const [isProcessing, setIsProcessing] = useState(false)
  const { addChips } = useBankrollStore()
  
  const handleDeposit = async () => {
    if (amount <= 0) return
    
    setIsProcessing(true)
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 500))
    
    addChips(amount, 'Added chips to bankroll')
    setIsProcessing(false)
    onClose()
  }
  
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#2d2d2d] rounded-lg p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold text-white mb-2">Add Chips to Bankroll</h2>
        <p className="text-gray-400 mb-6 text-sm">
          This is a demo. In production, this would connect to a payment processor.
        </p>
        
        {/* Warning Message */}
        <div className="bg-orange-900/20 border border-orange-800 rounded-lg p-3 mb-6">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-orange-400 mt-0.5" />
            <div className="text-sm text-orange-300">
              <p>This is play money only. No real money is involved.</p>
            </div>
          </div>
        </div>
        
        {/* Quick Amount Buttons */}
        <div className="grid grid-cols-4 gap-2 mb-6">
          {[100, 500, 1000, 5000].map(value => (
            <button
              key={value}
              onClick={() => setAmount(value)}
              className={`p-3 rounded-lg font-semibold transition-colors ${
                amount === value 
                  ? 'bg-[#4CAF50] text-white' 
                  : 'bg-[#3d3d3d] text-gray-300 hover:bg-[#4d4d4d]'
              }`}
            >
              ${value}
            </button>
          ))}
        </div>
        
        {/* Custom Amount Input */}
        <div className="mb-6">
          <label className="block text-gray-400 text-sm mb-2">
            Custom Amount
          </label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
              className="w-full pl-10 pr-4 py-3 bg-[#1a1a1a] border border-[#3d3d3d] rounded-lg text-white focus:border-[#4CAF50] focus:outline-none"
              min="1"
              max="100000"
            />
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="flex-1 px-4 py-3 bg-[#3d3d3d] hover:bg-[#4d4d4d] disabled:bg-[#2d2d2d] text-white rounded-lg transition-colors disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleDeposit}
            disabled={isProcessing || amount <= 0}
            className="flex-1 px-4 py-3 bg-[#4CAF50] hover:bg-[#45a049] disabled:bg-[#2d2d2d] text-white rounded-lg font-semibold transition-colors disabled:cursor-not-allowed"
          >
            {isProcessing ? 'Processing...' : `Add $${amount.toLocaleString()}`}
          </button>
        </div>
      </div>
    </div>
  )
}