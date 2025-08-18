import React from 'react';
import { ErrorBoundary, withErrorBoundary } from '../ErrorBoundary';
import { logger } from '../../utils/logger';

interface WalletErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

const WalletErrorFallback: React.FC<WalletErrorFallbackProps> = ({ error, resetError }) => {
  const isNetworkError = error.message.toLowerCase().includes('network') || 
                        error.message.toLowerCase().includes('fetch');
  const isBalanceError = error.message.toLowerCase().includes('balance') ||
                        error.message.toLowerCase().includes('insufficient');
  
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
      <svg
        className="mx-auto h-12 w-12 text-red-500 mb-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {isNetworkError ? 'Connection Error' : 
         isBalanceError ? 'Transaction Error' : 
         'Wallet Error'}
      </h3>
      
      <p className="text-gray-600 mb-4">
        {isNetworkError ? 
          'Unable to connect to the wallet service. Please check your connection and try again.' :
         isBalanceError ? 
          'There was an issue processing your transaction. Please verify your balance and try again.' :
          'An unexpected error occurred with your wallet. Please try again.'}
      </p>
      
      {process.env.NODE_ENV === 'development' && (
        <details className="text-left mb-4">
          <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
            Error details
          </summary>
          <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
            {error.toString()}
          </pre>
        </details>
      )}
      
      <div className="flex gap-3 justify-center">
        <button
          onClick={resetError}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          aria-label="Retry the failed operation"
        >
          Try Again
        </button>
        
        {isNetworkError && (
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
            aria-label="Refresh the page"
          >
            Refresh Page
          </button>
        )}
      </div>
    </div>
  );
};

export const WalletErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const handleError = (error: Error, errorInfo: React.ErrorInfo) => {
    logger.error('Wallet component error:', {
      error: error.toString(),
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString()
    });
    
    // Here you could send error telemetry to a monitoring service
    // Example: sendErrorToMonitoring(error, errorInfo);
  };
  
  return (
    <ErrorBoundary
      fallback={(error, errorInfo) => (
        <WalletErrorFallback 
          error={error} 
          resetError={() => window.location.reload()} 
        />
      )}
      onError={handleError}
    >
      {children}
    </ErrorBoundary>
  );
};

export const withWalletErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>
) => {
  return withErrorBoundary(
    Component,
    (error, errorInfo) => (
      <WalletErrorFallback 
        error={error} 
        resetError={() => window.location.reload()} 
      />
    ),
    (error, errorInfo) => {
      logger.error('Wallet component error:', {
        error: error.toString(),
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString()
      });
    }
  );
};