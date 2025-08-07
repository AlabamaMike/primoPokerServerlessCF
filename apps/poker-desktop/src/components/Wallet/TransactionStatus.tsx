import React from 'react';
import { clsx } from 'clsx';
import './TransactionStatus.css';

type Status = 'pending' | 'processing' | 'completed' | 'failed' | 'canceled';
type Variant = 'default' | 'inline' | 'badge';
type Size = 'small' | 'medium' | 'large';

interface TransactionStatusProps {
  status: Status;
  variant?: Variant;
  size?: Size;
  timestamp?: Date;
  message?: string;
  progress?: number;
  showRetry?: boolean;
  onRetry?: () => void;
}

export const TransactionStatus: React.FC<TransactionStatusProps> = ({
  status,
  variant = 'default',
  size = 'medium',
  timestamp,
  message,
  progress,
  showRetry = false,
  onRetry
}) => {
  const getStatusConfig = (status: Status) => {
    switch (status) {
      case 'completed':
        return {
          label: 'Completed',
          className: 'text-green-600',
          bgClassName: 'bg-green-100',
          icon: '✓'
        };
      case 'pending':
        return {
          label: 'Pending',
          className: 'text-yellow-600',
          bgClassName: 'bg-yellow-100',
          icon: '⏳'
        };
      case 'processing':
        return {
          label: 'Processing',
          className: 'text-blue-600',
          bgClassName: 'bg-blue-100',
          icon: '⟳'
        };
      case 'failed':
        return {
          label: 'Failed',
          className: 'text-red-600',
          bgClassName: 'bg-red-100',
          icon: '✕'
        };
      case 'canceled':
        return {
          label: 'Canceled',
          className: 'text-gray-600',
          bgClassName: 'bg-gray-100',
          icon: '⊘'
        };
    }
  };

  const config = getStatusConfig(status);
  
  const sizeClasses = {
    small: 'text-xs',
    medium: 'text-sm',
    large: 'text-base'
  };

  const variantClasses = {
    default: 'flex flex-col gap-1',
    inline: 'inline-flex items-center gap-2',
    badge: clsx(
      'inline-flex items-center gap-1 px-2 py-1 rounded-full',
      config.bgClassName
    )
  };

  const formatTimestamp = (date: Date): string => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  };

  const renderIcon = () => {
    if (status === 'processing') {
      return (
        <span 
          data-testid="status-spinner" 
          className="animate-spin inline-block"
          style={{ animation: 'spin 1s linear infinite' }}
        >
          {config.icon}
        </span>
      );
    }
    
    return (
      <span data-testid={`status-icon-${status}`}>
        {config.icon}
      </span>
    );
  };

  return (
    <div
      role="status"
      aria-label={`Transaction status: ${config.label}`}
      className={clsx(
        'transaction-status',
        `transaction-status--${variant}`,
        `transaction-status--${size}`,
        variantClasses[variant],
        sizeClasses[size]
      )}
      data-testid="status-transition"
    >
      <div className={clsx('flex items-center gap-1', config.className)}>
        {renderIcon()}
        <span className={clsx('font-medium', variant === 'badge' && 'text-sm')}>
          {config.label}
        </span>
        {progress !== undefined && status === 'processing' && (
          <span className="ml-1">
            {progress}%
          </span>
        )}
      </div>

      {progress !== undefined && status === 'processing' && variant === 'default' && (
        <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}

      {message && variant === 'default' && (
        <p className={clsx('text-gray-600', sizeClasses[size])}>
          {message}
        </p>
      )}

      {timestamp && variant === 'default' && (
        <p className={clsx('text-gray-500', sizeClasses[size])}>
          {formatTimestamp(timestamp)}
        </p>
      )}

      {showRetry && status === 'failed' && onRetry && variant === 'default' && (
        <button
          onClick={onRetry}
          className="text-blue-600 hover:text-blue-700 underline text-sm mt-1"
        >
          Retry
        </button>
      )}
    </div>
  );
};

// Add CSS for spin animation if not already present
