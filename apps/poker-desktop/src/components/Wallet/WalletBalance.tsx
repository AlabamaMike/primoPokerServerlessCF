import React, { useEffect, useRef, useCallback } from 'react';
import { clsx } from 'clsx';
import { formatCurrency } from '../../utils/currency';

interface WalletBalanceProps {
  balance: number;
  isLoading?: boolean;
  error?: string;
  className?: string;
  currency?: string;
  showLabel?: boolean;
}

export const WalletBalance: React.FC<WalletBalanceProps> = ({
  balance,
  isLoading = false,
  error,
  className,
  currency = 'USD',
  showLabel = false
}) => {
  const previousBalanceRef = useRef<number>(balance);
  const announcerRef = useRef<HTMLDivElement | null>(null);
  
  const announceBalance = useCallback((newBalance: number, currentCurrency: string) => {
    if (!announcerRef.current) {
      announcerRef.current = document.createElement('div');
      announcerRef.current.setAttribute('role', 'status');
      announcerRef.current.setAttribute('aria-live', 'polite');
      announcerRef.current.setAttribute('aria-atomic', 'true');
      announcerRef.current.className = 'sr-only';
      document.body.appendChild(announcerRef.current);
    }
    
    const difference = newBalance - previousBalanceRef.current;
    const changeType = difference > 0 ? 'increased' : 'decreased';
    const announcement = `Wallet balance ${changeType} by ${formatCurrency(Math.abs(difference), currentCurrency)}. New balance is ${formatCurrency(newBalance, currentCurrency)}`;
    
    announcerRef.current.textContent = announcement;
  }, []);
  
  // Announce balance changes to screen readers
  useEffect(() => {
    if (previousBalanceRef.current !== balance && !isLoading && !error) {
      announceBalance(balance, currency);
      previousBalanceRef.current = balance;
    }
  }, [balance, currency, isLoading, error, announceBalance]);
  
  // Cleanup announcer element only on unmount
  useEffect(() => {
    return () => {
      if (announcerRef.current && document.body.contains(announcerRef.current)) {
        document.body.removeChild(announcerRef.current);
        announcerRef.current = null;
      }
    };
  }, []);
  if (isLoading) {
    return (
      <div className={clsx('wallet-balance', className)}>
        <div data-testid="wallet-balance-loading" className="animate-pulse">
          <div className="h-6 bg-gray-300 rounded w-24"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={clsx('wallet-balance wallet-balance--error', className)}>
        <span className="text-red-500">{error}</span>
      </div>
    );
  }

  return (
    <div className={clsx('wallet-balance', className)}>
      {showLabel && (
        <span className="wallet-balance__label text-sm text-gray-600 mr-2">
          Wallet Balance
        </span>
      )}
      <span 
        className="wallet-balance__amount text-lg font-semibold"
        aria-label={`Wallet balance: ${formatCurrency(balance, currency)}`}
        role="text"
      >
        {formatCurrency(balance, currency)}
      </span>
    </div>
  );
};