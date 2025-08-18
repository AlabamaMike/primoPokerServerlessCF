import React, { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { formatCurrency } from '../../utils/currency';

interface WithdrawData {
  amount: number;
  currency: string;
  withdrawalMethod: string;
  twoFactorCode?: string;
}

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWithdraw: (data: WithdrawData) => void;
  availableBalance: number;
  minWithdrawal?: number;
  maxWithdrawal?: number;
  isProcessing?: boolean;
  error?: string;
  withdrawalMethods?: string[];
  requireConfirmation?: boolean;
  require2FA?: boolean;
  dailyLimit?: number;
  dailyWithdrawn?: number;
  estimatedArrival?: Record<string, string>;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({
  isOpen,
  onClose,
  onWithdraw,
  availableBalance,
  minWithdrawal = 1,
  maxWithdrawal = 10000,
  isProcessing = false,
  error,
  withdrawalMethods = ['bank', 'paypal'],
  requireConfirmation = false,
  require2FA = false,
  dailyLimit,
  dailyWithdrawn = 0,
  estimatedArrival = {
    bank: '3-5 business days',
    paypal: '1-2 business days',
    crypto: '30-60 minutes'
  }
}) => {
  const [amount, setAmount] = useState<number>(0);
  const [withdrawalMethod, setWithdrawalMethod] = useState<string>(withdrawalMethods[0]);
  const [validationError, setValidationError] = useState<string>('');
  const [step, setStep] = useState<'amount' | 'confirm' | '2fa'>('amount');
  const [twoFactorCode, setTwoFactorCode] = useState<string>('');
  
  // Refs for focus management
  const modalRef = useRef<HTMLDivElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const twoFactorInputRef = useRef<HTMLInputElement>(null);

  const dailyRemaining = dailyLimit ? dailyLimit - dailyWithdrawn : Infinity;

  useEffect(() => {
    if (!isOpen) {
      // Reset form when modal closes
      setAmount(0);
      setWithdrawalMethod(withdrawalMethods[0]);
      setValidationError('');
      setStep('amount');
      setTwoFactorCode('');
    }
  }, [isOpen, withdrawalMethods]);

  if (!isOpen) return null;

  const getWithdrawalMethodLabel = (method: string): string => {
    switch (method) {
      case 'bank':
        return 'Bank Transfer';
      case 'paypal':
        return 'PayPal';
      case 'crypto':
        return 'Cryptocurrency';
      default:
        return method;
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9.]/g, '');
    const numValue = parseFloat(value) || 0;
    setAmount(numValue);
    setValidationError('');
  };

  const handleContinue = () => {
    if (amount < minWithdrawal) {
      setValidationError(`Minimum withdrawal is ${formatCurrency(minWithdrawal)}`);
      return;
    }
    
    if (amount > availableBalance) {
      setValidationError(`Insufficient balance. Available: ${formatCurrency(availableBalance)}`);
      return;
    }
    
    if (amount > maxWithdrawal) {
      setValidationError(`Maximum withdrawal is ${formatCurrency(maxWithdrawal)}`);
      return;
    }
    
    if (dailyLimit && amount > dailyRemaining) {
      setValidationError(`Exceeds daily limit. Remaining: ${formatCurrency(dailyRemaining)}`);
      return;
    }
    
    if (requireConfirmation) {
      setStep('confirm');
    } else if (require2FA) {
      setStep('2fa');
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    onWithdraw({
      amount,
      currency: 'USD',
      withdrawalMethod,
      ...(require2FA && { twoFactorCode })
    });
  };

  const renderAmountStep = () => (
    <>
      <div className="mb-4">
        <label htmlFor="withdrawal-amount" className="block text-sm font-medium mb-2">
          Withdrawal Amount
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
            $
          </span>
          <input
            id="withdrawal-amount"
            type="number"
            step="0.01"
            value={amount || ''}
            onChange={handleAmountChange}
            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="0.00"
            disabled={isProcessing}
          />
        </div>
        <p className="mt-1 text-sm text-gray-600">
          Available: {formatCurrency(availableBalance)}
        </p>
      </div>

      {withdrawalMethods.length > 1 && (
        <div className="mb-4">
          <label htmlFor="withdrawal-method" className="block text-sm font-medium mb-2">
            Withdrawal Method
          </label>
          <select
            id="withdrawal-method"
            value={withdrawalMethod}
            onChange={(e) => setWithdrawalMethod(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isProcessing}
          >
            {withdrawalMethods.map((method) => (
              <option key={method} value={method}>
                {getWithdrawalMethodLabel(method)}
              </option>
            ))}
          </select>
          {estimatedArrival[withdrawalMethod] && (
            <p className="mt-1 text-sm text-gray-600">
              Estimated arrival: {estimatedArrival[withdrawalMethod]}
            </p>
          )}
        </div>
      )}

      <div className="mb-4 space-y-1 text-sm text-gray-600">
        <p>Min: {formatCurrency(minWithdrawal)} | Max: {formatCurrency(maxWithdrawal)}</p>
        {dailyLimit && (
          <p>Daily limit: {formatCurrency(dailyRemaining)} remaining</p>
        )}
      </div>

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
          type="button"
          onClick={handleContinue}
          className={clsx(
            'flex-1 px-4 py-2 rounded-lg font-medium',
            isProcessing
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          )}
          disabled={isProcessing}
        >
          {requireConfirmation || require2FA ? 'Continue' : 'Confirm Withdrawal'}
        </button>
      </div>
    </>
  );

  const renderConfirmStep = () => (
    <>
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Confirm Withdrawal</h3>
        <p className="text-gray-600">
          You are about to withdraw {formatCurrency(amount)}
        </p>
        <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Amount:</span>
            <span className="font-medium">{formatCurrency(amount)}</span>
          </div>
          <div className="flex justify-between">
            <span>Method:</span>
            <span className="font-medium">{getWithdrawalMethodLabel(withdrawalMethod)}</span>
          </div>
          {estimatedArrival[withdrawalMethod] && (
            <div className="flex justify-between">
              <span>Estimated arrival:</span>
              <span className="font-medium">{estimatedArrival[withdrawalMethod]}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setStep('amount')}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          disabled={isProcessing}
        >
          Back
        </button>
        <button
          type="button"
          onClick={require2FA ? () => setStep('2fa') : handleSubmit}
          className={clsx(
            'flex-1 px-4 py-2 rounded-lg font-medium',
            isProcessing
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          )}
          disabled={isProcessing}
        >
          Confirm
        </button>
      </div>
    </>
  );

  const render2FAStep = () => (
    <>
      <div className="mb-6">
        <label htmlFor="2fa-code" className="block text-sm font-medium mb-2">
          Enter 2FA Code
        </label>
        <input
          id="2fa-code"
          type="text"
          value={twoFactorCode}
          onChange={(e) => setTwoFactorCode(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="123456"
          maxLength={6}
          disabled={isProcessing}
        />
        <p className="mt-1 text-sm text-gray-600">
          Enter the 6-digit code from your authenticator app
        </p>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setStep(requireConfirmation ? 'confirm' : 'amount')}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          disabled={isProcessing}
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className={clsx(
            'flex-1 px-4 py-2 rounded-lg font-medium',
            isProcessing
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          )}
          disabled={isProcessing || twoFactorCode.length !== 6}
        >
          Confirm Withdrawal
        </button>
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        data-testid="modal-backdrop"
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      
      <div ref={modalRef} className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6" role="dialog" aria-modal="true" aria-labelledby="withdraw-modal-title">
        {/* Skip Links for Keyboard Navigation */}
        <button 
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-blue-600 text-white px-4 py-2 rounded-lg z-10"
          onClick={() => {
            if (step === '2fa' && twoFactorInputRef.current) {
              twoFactorInputRef.current.focus();
            } else if (amountInputRef.current) {
              amountInputRef.current.focus();
            }
          }}
        >
          Skip to input field
        </button>
        
        <h2 id="withdraw-modal-title" className="text-2xl font-bold mb-6">
          {isProcessing ? 'Processing withdrawal...' : 'Withdraw Funds'}
        </h2>
        
        {(validationError || error) && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {validationError || error}
          </div>
        )}

        {step === 'amount' && renderAmountStep()}
        {step === 'confirm' && renderConfirmStep()}
        {step === '2fa' && render2FAStep()}
      </div>
    </div>
  );
};