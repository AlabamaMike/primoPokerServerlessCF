import React, { useState, useEffect, useRef } from 'react';
import { Table } from './types';
import { useLobbyWebSocket } from '../../hooks/useLobbyWebSocket';

interface TablePreviewCardProps {
  table: Table | null;
}

interface StatValue {
  value: number;
  trend: 'up' | 'down' | 'stable';
}

const TablePreviewCard: React.FC<TablePreviewCardProps> = ({ table }) => {
  const { isConnected } = useLobbyWebSocket({ url: '', enabled: false });
  
  // Track previous values for trend indicators
  const prevValuesRef = useRef<{
    players?: number;
    avgPot?: number;
    handsPerHour?: number;
    waitlist?: number;
  }>({});

  const [animatingStats, setAnimatingStats] = useState<Set<string>>(new Set());
  
  useEffect(() => {
    if (!table) return;
    
    const prevValues = prevValuesRef.current;
    const newAnimatingStats = new Set<string>();
    
    // Check for changes and trigger animations
    if (prevValues.players !== undefined && prevValues.players !== table.players) {
      newAnimatingStats.add('players');
    }
    if (prevValues.avgPot !== undefined && prevValues.avgPot !== table.avgPot) {
      newAnimatingStats.add('avgPot');
    }
    if (prevValues.handsPerHour !== undefined && prevValues.handsPerHour !== table.handsPerHour) {
      newAnimatingStats.add('handsPerHour');
    }
    if (prevValues.waitlist !== undefined && prevValues.waitlist !== table.waitlist) {
      newAnimatingStats.add('waitlist');
    }
    
    setAnimatingStats(newAnimatingStats);
    
    // Clear animations after delay
    const timer = setTimeout(() => {
      setAnimatingStats(new Set());
    }, 1000);
    
    // Update previous values
    prevValuesRef.current = {
      players: table.players,
      avgPot: table.avgPot,
      handsPerHour: table.handsPerHour,
      waitlist: table.waitlist
    };
    
    return () => clearTimeout(timer);
  }, [table?.players, table?.avgPot, table?.handsPerHour, table?.waitlist]);

  const getTrend = (current: number, fieldName: string): 'up' | 'down' | 'stable' => {
    const prev = prevValuesRef.current[fieldName as keyof typeof prevValuesRef.current];
    if (prev === undefined || prev === current) return 'stable';
    return current > prev ? 'up' : 'down';
  };

  const getGameTypeDisplay = (gameType: string): string => {
    const gameTypes: Record<string, string> = {
      'nlhe': "NL Hold'em",
      'plo': 'PLO',
      'plo5': 'PLO5',
      'shortdeck': 'Short Deck',
      'mixed': 'Mixed'
    };
    return gameTypes[gameType] || gameType;
  };

  const getSpeedDisplay = (speed: string): string => {
    return `${speed.charAt(0).toUpperCase() + speed.slice(1)} Speed`;
  };

  const renderSeats = () => {
    if (!table) return null;
    
    return (
      <div className="relative w-48 h-48 mx-auto">
        {Array.from({ length: table.maxPlayers }).map((_, index) => {
          const angle = (index * 360) / table.maxPlayers;
          const isOccupied = index < table.players;
          const x = 50 + 40 * Math.cos((angle - 90) * Math.PI / 180);
          const y = 50 + 40 * Math.sin((angle - 90) * Math.PI / 180);
          
          return (
            <div
              key={index}
              data-testid={`seat-${index}`}
              className={`absolute w-8 h-8 rounded-full border-2 transition-all ${
                isOccupied 
                  ? 'bg-emerald-500/20 border-emerald-500' 
                  : 'bg-slate-700/50 border-slate-600'
              }`}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: 'translate(-50%, -50%)'
              }}
              data-seat-occupied={isOccupied ? 'occupied' : 'empty'}
            >
              {isOccupied && (
                <div 
                  className="w-full h-full rounded-full bg-emerald-500/50"
                  data-testid="seat-occupied"
                />
              )}
              {!isOccupied && (
                <div 
                  className="w-full h-full rounded-full"
                  data-testid="seat-empty"
                />
              )}
            </div>
          );
        })}
        {/* Table center */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-24 h-24 rounded-full bg-slate-800/50 border-2 border-slate-700 flex items-center justify-center">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-400">{table.players}</div>
              <div className="text-xs text-slate-400">/{table.maxPlayers}</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!table) {
    return (
      <div className="w-96 bg-slate-800/50 backdrop-blur border-l border-slate-700/50 p-6">
        <div className="flex items-center justify-center h-full text-slate-400">
          Select a table to view details
        </div>
      </div>
    );
  }

  return (
    <div className="w-96 bg-slate-800/50 backdrop-blur border-l border-slate-700/50 p-6 overflow-y-auto">
      {/* Header with live indicator */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-purple-400">{table.name}</h2>
        <div className="flex items-center space-x-2">
          <div 
            data-testid="live-indicator"
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-slate-500'}`}
          />
          <span className="text-xs text-slate-400">{isConnected ? 'Live' : 'Offline'}</span>
        </div>
      </div>

      {/* Game info badges */}
      <div className="flex flex-wrap gap-2 mb-6">
        <span className="px-3 py-1 bg-purple-600/20 text-purple-400 rounded-full text-sm">
          {getGameTypeDisplay(table.gameType)}
        </span>
        <span className="px-3 py-1 bg-slate-700/50 text-slate-300 rounded-full text-sm">
          {table.stakes.currency}{table.stakes.small}/{table.stakes.currency}{table.stakes.big}
        </span>
        <span className="px-3 py-1 bg-slate-700/50 text-slate-300 rounded-full text-sm">
          {getSpeedDisplay(table.speed)}
        </span>
      </div>

      {/* Features */}
      {table.features.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {table.features.includes('featured') && (
            <span className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-sm">
              Featured
            </span>
          )}
          {table.rakebackPercent && (
            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm">
              {table.rakebackPercent}% Rakeback
            </span>
          )}
          {table.features.filter(f => f !== 'featured').map(feature => (
            <span key={feature} className="px-3 py-1 bg-slate-700/50 text-slate-300 rounded-full text-sm">
              {feature.charAt(0).toUpperCase() + feature.slice(1)}
            </span>
          ))}
        </div>
      )}

      {/* Seat visualization */}
      <div className="mb-6">
        {renderSeats()}
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900/50 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Players/Flop</div>
          <div className="text-xl font-bold text-slate-50">
            {table.playersPerFlop || 0}%
          </div>
        </div>
        
        <div className="bg-slate-900/50 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Hands/Hour</div>
          <div className="flex items-center space-x-2">
            <div 
              data-testid="hands-per-hour-value"
              className={`text-xl font-bold ${
                animatingStats.has('handsPerHour') ? 'text-emerald-400' : 'text-slate-50'
              } transition-colors`}
            >
              {table.handsPerHour || 0}
            </div>
            {getTrend(table.handsPerHour || 0, 'handsPerHour') === 'up' && (
              <span data-testid="handsPerHour-trend-up" className="text-emerald-400 text-xs">↑</span>
            )}
            {getTrend(table.handsPerHour || 0, 'handsPerHour') === 'down' && (
              <span data-testid="handsPerHour-trend-down" className="text-red-400 text-xs">↓</span>
            )}
          </div>
        </div>
        
        <div className="bg-slate-900/50 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Avg Pot</div>
          <div className="flex items-center space-x-2">
            <div 
              data-testid="avg-pot-value"
              className={`text-xl font-bold ${
                animatingStats.has('avgPot') ? 'text-emerald-400' : 'text-slate-50'
              } transition-colors`}
            >
              {table.stakes.currency}{table.avgPot}
            </div>
            {getTrend(table.avgPot, 'avgPot') === 'up' && (
              <span data-testid="avgPot-trend-up" className="text-emerald-400 text-xs">↑</span>
            )}
            {getTrend(table.avgPot, 'avgPot') === 'down' && (
              <span data-testid="avgPot-trend-down" className="text-red-400 text-xs">↓</span>
            )}
          </div>
        </div>
        
        <div className="bg-slate-900/50 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Waitlist</div>
          <div className="flex items-center space-x-2">
            <div className={`text-xl font-bold ${table.waitlist > 0 ? 'text-amber-400' : 'text-slate-50'}`}>
              {table.waitlist} players
            </div>
            {getTrend(table.waitlist, 'waitlist') === 'up' && (
              <span data-testid="waitlist-trend-up" className="text-amber-400 text-xs">↑</span>
            )}
            {getTrend(table.waitlist, 'waitlist') === 'down' && (
              <span data-testid="waitlist-trend-down" className="text-emerald-400 text-xs">↓</span>
            )}
          </div>
        </div>
      </div>

      {/* Players count with trend */}
      <div className="mt-4 text-center">
        <div className="text-sm text-slate-400">Current Players</div>
        <div className="flex items-center justify-center space-x-2">
          <div className={`text-3xl font-bold ${
            animatingStats.has('players') ? 'text-emerald-400' : 'text-purple-400'
          } transition-colors`}>
            {table.players}/{table.maxPlayers}
          </div>
          {getTrend(table.players, 'players') === 'up' && (
            <span data-testid="players-trend-up" className="text-emerald-400">↑</span>
          )}
          {getTrend(table.players, 'players') === 'down' && (
            <span data-testid="players-trend-down" className="text-red-400">↓</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default TablePreviewCard;