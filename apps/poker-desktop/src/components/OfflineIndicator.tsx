import React from 'react';
import { useConnectionState } from '../hooks/useConnectionState';

interface OfflineIndicatorProps {
  checkConnectionFn?: () => Promise<boolean>;
  showQueueSize?: boolean;
  position?: 'top' | 'bottom';
  className?: string;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  checkConnectionFn,
  showQueueSize = true,
  position = 'top',
  className = ''
}) => {
  const { isOnline, isConnected, queueSize, reconnectAttempts, checkConnection } = useConnectionState(
    checkConnectionFn,
    {
      checkInterval: 10000, // Check every 10 seconds when offline
    }
  );

  // Don't show if both online and connected
  if (isOnline && isConnected) {
    return null;
  }

  const isOffline = !isOnline;
  const isDisconnected = isOnline && !isConnected;

  return (
    <div
      className={`fixed left-0 right-0 ${position === 'top' ? 'top-0' : 'bottom-0'} 
        ${isOffline ? 'bg-gray-800' : 'bg-yellow-600'} 
        text-white px-4 py-2 z-40 transition-all duration-300 ${className}`}
    >
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {/* Status Icon */}
          {isOffline ? (
            <svg className="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
            </svg>
          ) : (
            <div className="relative">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full animate-ping"></div>
            </div>
          )}

          {/* Status Text */}
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {isOffline ? 'No Internet Connection' : 'Server Connection Lost'}
            </span>
            {reconnectAttempts > 0 && (
              <span className="text-xs opacity-75">
                Reconnecting... (Attempt {reconnectAttempts})
              </span>
            )}
          </div>

          {/* Queue Size */}
          {showQueueSize && queueSize > 0 && (
            <div className="flex items-center space-x-1 ml-4 px-2 py-1 bg-black/20 rounded">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs">
                {queueSize} action{queueSize !== 1 ? 's' : ''} pending
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-3">
          {isDisconnected && (
            <button
              onClick={() => checkConnection()}
              className="text-xs px-3 py-1 bg-white/20 hover:bg-white/30 rounded transition-colors"
            >
              Retry Now
            </button>
          )}
          
          <span className="text-xs opacity-75">
            {isOffline 
              ? 'Your actions will be saved and synced when reconnected'
              : 'Attempting to reconnect to server...'
            }
          </span>
        </div>
      </div>
    </div>
  );
};

// Minimal offline badge for compact UI areas
export const OfflineBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { isOnline } = useConnectionState();

  if (isOnline) return null;

  return (
    <div className={`inline-flex items-center px-2 py-1 bg-gray-700 text-white text-xs rounded ${className}`}>
      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
          d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21" />
      </svg>
      Offline
    </div>
  );
};