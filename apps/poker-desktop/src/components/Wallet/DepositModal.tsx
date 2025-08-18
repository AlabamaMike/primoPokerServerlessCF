import React, { useState, useEffect, useRef, useCallback } from 'react';
import { clsx } from 'clsx';
import { formatCurrency } from '../../utils/currency';

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
  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number>(-1);
  
  // Refs for focus management
  const modalRef = useRef<HTMLDivElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const firstPresetRef = useRef<HTMLButtonElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      // Reset form when modal closes
      setAmount(0);
      setPaymentMethod(paymentMethods[0]);
      setValidationError('');
      setSelectedPresetIndex(-1);
    } else {
      // Focus on amount input when modal opens
      setTimeout(() => {
        amountInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, paymentMethods]);
  
  // Trap focus within modal
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
      
      // Handle arrow key navigation for preset amounts
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const activeElement = document.activeElement;
        const presetButtons = modalRef.current?.querySelectorAll('[data-preset-button]');
        
        if (presetButtons && activeElement?.hasAttribute('data-preset-button')) {
          e.preventDefault();
          const currentIndex = Array.from(presetButtons).indexOf(activeElement as Element);
          let nextIndex = currentIndex;
          
          if (e.key === 'ArrowLeft') {
            nextIndex = currentIndex > 0 ? currentIndex - 1 : presetButtons.length - 1;
          } else {
            nextIndex = currentIndex < presetButtons.length - 1 ? currentIndex + 1 : 0;
          }
          
          (presetButtons[nextIndex] as HTMLElement).focus();
        }
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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
      
      <div ref={modalRef} className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6" role="dialog" aria-modal="true" aria-labelledby="deposit-modal-title">
        {/* Skip Links for Keyboard Navigation */}
        <button 
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-blue-600 text-white px-4 py-2 rounded-lg z-10"
          onClick={() => amountInputRef.current?.focus()}
        >
          Skip to amount input
        </button>
        <button 
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:right-4 bg-blue-600 text-white px-4 py-2 rounded-lg z-10"
          onClick={() => submitButtonRef.current?.focus()}
        >
          Skip to submit button
        </button>
        
        <h2 id="deposit-modal-title" className="text-2xl font-bold mb-6">Make a Deposit</h2>
        
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
                ref={amountInputRef}
                id="deposit-amount"
                type="number"
                step="0.01"
                value={amount || ''}
                onChange={handleAmountChange}
                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
                disabled={isProcessing}
                aria-describedby={validationError ? 'deposit-error' : undefined}
              />
            </div>
          </div>

          {presetAmounts.length > 0 && (
            <div className="mb-6">
              <div className="flex gap-2 flex-wrap">
                {presetAmounts.map((preset, index) => (
                  <button
                    key={preset}
                    ref={index === 0 ? firstPresetRef : undefined}
                    type="button"
                    data-preset-button
                    onClick={() => {
                      setAmount(preset);
                      setValidationError('');
                      setSelectedPresetIndex(index);
                      // Announce to screen readers
                      const announcement = `Selected ${formatCurrency(preset)} deposit amount`;
                      const announcer = document.createElement('div');
                      announcer.setAttribute('role', 'status');
                      announcer.setAttribute('aria-live', 'polite');
                      announcer.className = 'sr-only';
                      announcer.textContent = announcement;
                      document.body.appendChild(announcer);
                      setTimeout(() => document.body.removeChild(announcer), 1000);
                    }}
                    onFocus={() => setSelectedPresetIndex(index)}
                    className={clsx(
                      'px-4 py-2 rounded-lg border transition-all',
                      amount === preset
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
                      selectedPresetIndex === index && 'ring-2 ring-blue-500 ring-offset-2'
                    )}
                    disabled={isProcessing}
                    aria-label={`Select ${formatCurrency(preset)} deposit amount`}
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
            <div id="deposit-error" role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
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
              ref={submitButtonRef}
              type="submit"
              className={clsx(
                'flex-1 px-4 py-2 rounded-lg font-medium transition-colors',
                isProcessing
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
              )}
              disabled={isProcessing}
              aria-busy={isProcessing}
            >
              {isProcessing ? 'Processing...' : 'Deposit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};