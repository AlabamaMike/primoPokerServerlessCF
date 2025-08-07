import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';

interface DepositData {
  amount: number;
  currency: string;
  paymentMethod: string;
}

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeposit: (data: DepositData) => void;
  minDeposit?: number;
  maxDeposit?: number;
  isProcessing?: boolean;
  presetAmounts?: number[];
  error?: string;
  paymentMethods?: string[];
}

export const DepositModal: React.FC<DepositModalProps> = ({
  isOpen,
  onClose,
  onDeposit,
  minDeposit = 1,
  maxDeposit = 10000,
  isProcessing = false,
  presetAmounts = [25, 50, 100, 250],
  error,
  paymentMethods = ['card', 'bank']
}) => {
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>(paymentMethods[0]);
  const [validationError, setValidationError] = useState<string>('');

  useEffect(() => {
    if (!isOpen) {
      // Reset form when modal closes
      setAmount(0);
      setPaymentMethod(paymentMethods[0]);
      setValidationError('');
    }
  }, [isOpen, paymentMethods]);

  if (!isOpen) return null;

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9.]/g, '');
    const numValue = parseFloat(value) || 0;
    setAmount(numValue);
    setValidationError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (amount < minDeposit) {
      setValidationError(`Minimum deposit is ${formatCurrency(minDeposit)}`);
      return;
    }
    
    if (amount > maxDeposit) {
      setValidationError(`Maximum deposit is ${formatCurrency(maxDeposit)}`);
      return;
    }
    
    onDeposit({
      amount,
      currency: 'USD',
      paymentMethod
    });
  };

  const getPaymentMethodLabel = (method: string): string => {
    switch (method) {
      case 'card':
        return 'Credit/Debit Card';
      case 'bank':
        return 'Bank Transfer';
      case 'crypto':
        return 'Cryptocurrency';
      default:
        return method;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        data-testid="modal-backdrop"
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h2 className="text-2xl font-bold mb-6">Make a Deposit</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="deposit-amount" className="block text-sm font-medium mb-2">
              Deposit Amount
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                $
              </span>
              <input
                id="deposit-amount"
                type="number"
                step="0.01"
                value={amount || ''}
                onChange={handleAmountChange}
                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
                disabled={isProcessing}
              />
            </div>
          </div>

          {presetAmounts.length > 0 && (
            <div className="mb-6">
              <div className="flex gap-2 flex-wrap">
                {presetAmounts.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setAmount(preset);
                      setValidationError('');
                    }}
                    className={clsx(
                      'px-4 py-2 rounded-lg border',
                      amount === preset
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    )}
                    disabled={isProcessing}
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            </div>
          )}

          {paymentMethods.length > 1 && (
            <div className="mb-6">
              <label htmlFor="payment-method" className="block text-sm font-medium mb-2">
                Payment Method
              </label>
              <select
                id="payment-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isProcessing}
              >
                {paymentMethods.map((method) => (
                  <option key={method} value={method}>
                    {getPaymentMethodLabel(method)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(validationError || error) && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {validationError || error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              disabled={isProcessing}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={clsx(
                'flex-1 px-4 py-2 rounded-lg font-medium',
                isProcessing
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              )}
              disabled={isProcessing}
            >
              {isProcessing ? 'Processing...' : 'Deposit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};