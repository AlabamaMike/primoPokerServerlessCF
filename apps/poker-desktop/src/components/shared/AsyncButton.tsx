import React from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { cn } from '../../lib/utils';

export interface AsyncButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  loadingText?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

const variantClasses = {
  primary: 'bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white',
  secondary: 'bg-slate-700 hover:bg-slate-600 text-white',
  danger: 'bg-red-600 hover:bg-red-500 text-white'
};

const sizeClasses = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base'
};

export const AsyncButton: React.FC<AsyncButtonProps> = ({
  children,
  isLoading = false,
  loadingText = 'Loading...',
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled,
  className = '',
  ...props
}) => {
  return (
    <button
      disabled={isLoading || disabled}
      className={cn(
        variantClasses[variant],
        sizeClasses[size],
        'rounded-lg font-medium transition-all transform hover:scale-105',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none',
        'inline-flex items-center justify-center gap-2',
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {isLoading ? (
        <>
          <LoadingSpinner size="sm" />
          <span>{loadingText}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
};