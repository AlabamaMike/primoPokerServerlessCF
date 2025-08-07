import React, { useState } from 'react';
import { clsx } from 'clsx';

interface Table {
  id: string;
  name: string;
  minBuyIn: number;
  maxBuyIn: number;
  blinds: {
    small: number;
    big: number;
  };
  stats?: {
    averagePot: number;
    playersPerFlop: number;
    handsPerHour: number;
  };
}

interface BuyInData {
  tableId: string;
  amount: number;
  seatPreference?: number;
  autoTopUp?: {
    enabled: boolean;
    threshold: number;
    topUpTo: number;
  };
}

interface BuyInFlowProps {
  table: Table;
  walletBalance: number;
  onBuyIn: (data: BuyInData) => void;
  onCancel: () => void;
  availableSeats?: number[];
  isLoading?: boolean;
  showAutoTopUp?: boolean;
  error?: string;
}

export const BuyInFlow: React.FC<BuyInFlowProps> = ({
  table,
  walletBalance,
  onBuyIn,
  onCancel,
  availableSeats,
  isLoading = false,
  showAutoTopUp = false,
  error
}) => {
  const [buyInAmount, setBuyInAmount] = useState<number>(0);
  const [seatPreference, setSeatPreference] = useState<number | undefined>();
  const [validationError, setValidationError] = useState<string>('');
  const [autoTopUpEnabled, setAutoTopUpEnabled] = useState<boolean>(false);
  const [topUpThreshold, setTopUpThreshold] = useState<number>(table.minBuyIn / 2);

  const bigBlindValue = table.blinds.big;
  const suggestedAmounts = [
    { label: `Min ($${table.minBuyIn})`, value: table.minBuyIn },
    { label: `50 BBs ($${50 * bigBlindValue})`, value: 50 * bigBlindValue },
    { label: `100 BBs ($${100 * bigBlindValue})`, value: 100 * bigBlindValue },
    { label: `Max ($${table.maxBuyIn})`, value: table.maxBuyIn }
  ].filter(item => item.value >= table.minBuyIn && item.value <= table.maxBuyIn);

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9.]/g, '');
    const numValue = parseFloat(value) || 0;
    setBuyInAmount(numValue);
    setValidationError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (buyInAmount < table.minBuyIn) {
      setValidationError(`Minimum buy-in is ${formatCurrency(table.minBuyIn)}`);
      return;
    }
    
    if (buyInAmount > table.maxBuyIn) {
      setValidationError(`Maximum buy-in is ${formatCurrency(table.maxBuyIn)}`);
      return;
    }
    
    if (buyInAmount > walletBalance) {
      setValidationError(`Insufficient balance. Available: ${formatCurrency(walletBalance)}`);
      return;
    }
    
    const buyInData: BuyInData = {
      tableId: table.id,
      amount: buyInAmount,
      ...(seatPreference !== undefined && { seatPreference }),
      ...(showAutoTopUp && autoTopUpEnabled && {
        autoTopUp: {
          enabled: true,
          threshold: topUpThreshold,
          topUpTo: buyInAmount
        }
      })
    };
    
    onBuyIn(buyInData);
  };

  return (
    <div className="buy-in-flow bg-white rounded-lg shadow-lg p-6 max-w-md">
      <h2 className="text-2xl font-bold mb-4">Buy-in to {table.name}</h2>
      
      <div className="mb-6 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Blinds:</span>
          <span className="font-medium">${table.blinds.small}/${table.blinds.big}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Min buy-in:</span>
          <span className="font-medium">{formatCurrency(table.minBuyIn)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Max buy-in:</span>
          <span className="font-medium">{formatCurrency(table.maxBuyIn)}</span>
        </div>
        <div className="flex justify-between pt-2 border-t">
          <span className="text-gray-600">Wallet Balance:</span>
          <span className="font-medium">{formatCurrency(walletBalance)}</span>
        </div>
      </div>

      {table.stats && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold mb-2">Table Statistics</h3>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="text-center">
              <div className="text-gray-600">Avg Pot</div>
              <div className="font-medium">{formatCurrency(table.stats.averagePot)}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-600">Players/Flop</div>
              <div className="font-medium">{table.stats.playersPerFlop}%</div>
            </div>
            <div className="text-center">
              <div className="text-gray-600">Hands/Hour</div>
              <div className="font-medium">{table.stats.handsPerHour}</div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="buy-in-amount" className="block text-sm font-medium mb-2">
            Buy-in Amount
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
              $
            </span>
            <input
              id="buy-in-amount"
              type="number"
              step="0.01"
              value={buyInAmount || ''}
              onChange={handleAmountChange}
              className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="mb-4">
          <div className="flex gap-2 flex-wrap">
            {suggestedAmounts.map((suggested) => (
              <button
                key={suggested.value}
                type="button"
                onClick={() => {
                  setBuyInAmount(suggested.value);
                  setValidationError('');
                }}
                className={clsx(
                  'px-3 py-1 rounded-lg border text-sm',
                  buyInAmount === suggested.value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                )}
                disabled={isLoading || suggested.value > walletBalance}
              >
                {suggested.label}
              </button>
            ))}
          </div>
        </div>

        {availableSeats && availableSeats.length > 0 && (
          <div className="mb-4">
            <label htmlFor="seat-preference" className="block text-sm font-medium mb-2">
              Select Seat (Optional)
            </label>
            <select
              id="seat-preference"
              value={seatPreference || ''}
              onChange={(e) => setSeatPreference(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            >
              <option value="">Any available seat</option>
              {availableSeats.map((seat) => (
                <option key={seat} value={seat}>
                  Seat {seat}
                </option>
              ))}
            </select>
            <label className="sr-only">Preferred Seat</label>
          </div>
        )}

        {showAutoTopUp && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={autoTopUpEnabled}
                onChange={(e) => setAutoTopUpEnabled(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                disabled={isLoading}
              />
              <span className="text-sm font-medium">Enable Auto Top-up</span>
            </label>
            
            {autoTopUpEnabled && (
              <div className="mt-3">
                <label htmlFor="top-up-threshold" className="block text-sm text-gray-600 mb-1">
                  Top-up when balance falls below
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                    $
                  </span>
                  <input
                    id="top-up-threshold"
                    type="number"
                    step="0.01"
                    value={topUpThreshold || ''}
                    onChange={(e) => setTopUpThreshold(parseFloat(e.target.value) || 0)}
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isLoading}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {(validationError || error) && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {validationError || error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={clsx(
              'flex-1 px-4 py-2 rounded-lg font-medium',
              isLoading
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            )}
            disabled={isLoading}
          >
            {isLoading ? 'Joining table...' : 'Join Table'}
          </button>
        </div>
      </form>
    </div>
  );
};