import React, { useState } from 'react';
import { useLobbyStore } from '../../stores/lobby-store';
import LobbyService from '../../services/lobby-service';

interface QuickSeatButtonProps {
  apiUrl: string;
  onSeatFound: (tableId: string) => void;
  onCancel: () => void;
}

type ButtonState = 'idle' | 'searching' | 'success' | 'error';

const QuickSeatButton: React.FC<QuickSeatButtonProps> = ({ 
  apiUrl, 
  onSeatFound, 
  onCancel 
}) => {
  const { filters } = useLobbyStore();
  const [state, setState] = useState<ButtonState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleQuickSeat = async () => {
    setState('searching');
    setErrorMessage('');

    try {
      const service = new LobbyService(apiUrl);
      const result = await service.quickSeat(filters);
      
      if (result.success && result.tableId) {
        setState('success');
        onSeatFound(result.tableId);
        
        // Reset state after success message
        setTimeout(() => {
          setState('idle');
        }, 2000);
      } else {
        setState('error');
        setErrorMessage(result.message || 'No seats available');
        
        // Reset state after error message
        setTimeout(() => {
          setState('idle');
          setErrorMessage('');
        }, 2500);
      }
    } catch (error) {
      setState('error');
      setErrorMessage('Failed to find seat');
      
      setTimeout(() => {
        setState('idle');
        setErrorMessage('');
      }, 2500);
    }
  };

  const handleCancel = () => {
    setState('idle');
    onCancel();
  };

  const getButtonContent = () => {
    switch (state) {
      case 'searching':
        return (
          <>
            <span data-testid="loading-spinner" className="animate-spin">⚡</span>
            <span>Finding seat...</span>
          </>
        );
      case 'success':
        return (
          <>
            <span>✓</span>
            <span>Seat found!</span>
          </>
        );
      case 'error':
        return (
          <>
            <span>✗</span>
            <span>{errorMessage}</span>
          </>
        );
      default:
        return (
          <>
            <span>⚡</span>
            <span>Quick Seat</span>
          </>
        );
    }
  };

  const getButtonClassName = () => {
    const baseClasses = "flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all transform";
    
    switch (state) {
      case 'searching':
        return `${baseClasses} bg-purple-600/50 text-purple-200 cursor-wait`;
      case 'success':
        return `${baseClasses} bg-emerald-600 text-white`;
      case 'error':
        return `${baseClasses} bg-red-600 text-white`;
      default:
        return `${baseClasses} bg-gradient-to-r from-purple-600 to-amber-600 text-white hover:from-purple-500 hover:to-amber-500 hover:scale-105 shadow-lg shadow-purple-500/20`;
    }
  };

  if (state === 'searching') {
    return (
      <div className="flex items-center space-x-2">
        <button
          className={getButtonClassName()}
          disabled
          aria-busy="true"
          aria-label="Searching for available seat"
        >
          {getButtonContent()}
        </button>
        <button
          onClick={handleCancel}
          className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleQuickSeat}
      className={getButtonClassName()}
      disabled={state !== 'idle'}
      aria-label="Find a seat quickly based on your preferences"
      aria-busy={state === 'searching'}
    >
      {getButtonContent()}
    </button>
  );
};

export default QuickSeatButton;