import React from 'react';
import { clsx } from 'clsx';

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
  const formatCurrency = (amount: number, currencyCode: string): string => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return formatter.format(amount);
  };

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
      <span className="wallet-balance__amount text-lg font-semibold">
        {formatCurrency(balance, currency)}
      </span>
    </div>
  );
};