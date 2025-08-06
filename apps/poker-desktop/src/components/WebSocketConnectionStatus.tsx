import React from 'react';

interface WebSocketConnectionStatusProps {
  isConnected: boolean;
  isConnecting: boolean;
  isOnline: boolean;
  error: Error | null;
  reconnectCount?: number;
  className?: string;
}

export function WebSocketConnectionStatus({
  isConnected,
  isConnecting,
  isOnline,
  error,
  reconnectCount = 0,
  className = ''
}: WebSocketConnectionStatusProps) {
  const getStatusColor = () => {
    if (!isOnline) return 'bg-gray-500';
    if (isConnected) return 'bg-green-500';
    if (isConnecting) return 'bg-yellow-500';
    if (error) return 'bg-red-500';
    return 'bg-gray-500';
  };

  const getStatusText = () => {
    if (!isOnline) return 'Offline';
    if (isConnected) return 'Connected';
    if (isConnecting) {
      if (reconnectCount > 0) {
        return `Reconnecting... (${reconnectCount})`;
      }
      return 'Connecting...';
    }
    if (error) return 'Connection Error';
    return 'Disconnected';
  };

  const getStatusIcon = () => {
    if (!isOnline) {
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
          />
        </svg>
      );
    }

    if (isConnected) {
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      );
    }

    if (isConnecting) {
      return (
        <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      );
    }

    if (error) {
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    }

    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    );
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className="flex items-center space-x-1">
        <div className={`w-2 h-2 rounded-full ${getStatusColor()} ${isConnecting ? 'animate-pulse' : ''}`} />
        <span className="text-sm font-medium text-gray-700">{getStatusText()}</span>
      </div>
      <div className="text-gray-500">
        {getStatusIcon()}
      </div>
      {error && (
        <div className="group relative">
          <svg className="w-4 h-4 text-red-500 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="absolute z-10 invisible group-hover:visible bg-gray-900 text-white text-xs rounded py-1 px-2 right-0 top-6 whitespace-nowrap">
            {error.message}
          </div>
        </div>
      )}
    </div>
  );
}

export function WebSocketConnectionBar({
  isConnected,
  isConnecting,
  isOnline,
  error,
  reconnectCount = 0,
  onRetry
}: WebSocketConnectionStatusProps & { onRetry?: () => void }) {
  if (isConnected && isOnline && !error) {
    return null; // Hide bar when everything is working
  }

  const getBarColor = () => {
    if (!isOnline) return 'bg-gray-600';
    if (error) return 'bg-red-600';
    if (isConnecting) return 'bg-yellow-600';
    return 'bg-gray-600';
  };

  const getMessage = () => {
    if (!isOnline) {
      return 'You are currently offline. Some features may be unavailable.';
    }
    if (error) {
      return `Connection error: ${error.message}`;
    }
    if (isConnecting) {
      if (reconnectCount > 0) {
        return `Attempting to reconnect... (Attempt ${reconnectCount})`;
      }
      return 'Connecting to server...';
    }
    return 'Not connected to server';
  };

  return (
    <div className={`${getBarColor()} text-white px-4 py-2`}>
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center space-x-2">
          <WebSocketConnectionStatus
            isConnected={isConnected}
            isConnecting={isConnecting}
            isOnline={isOnline}
            error={error}
            reconnectCount={reconnectCount}
            className="text-white"
          />
          <span className="text-sm">{getMessage()}</span>
        </div>
        {error && onRetry && (
          <button
            onClick={onRetry}
            className="text-sm underline hover:no-underline"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}