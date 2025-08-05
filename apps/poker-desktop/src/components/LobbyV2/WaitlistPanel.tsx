import React, { useState, useEffect } from 'react';
import { useLobbyStore } from '../../stores/lobby-store';

interface WaitlistEntry {
  tableId: string;
  tableName: string;
  position: number;
  estimatedWait: number; // in minutes
  joinedAt: Date;
}

interface WaitlistPanelProps {
  apiUrl: string;
  onJoinTable: (tableId: string) => void;
}

const WaitlistPanel: React.FC<WaitlistPanelProps> = ({ apiUrl, onJoinTable }) => {
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const { tables } = useLobbyStore();

  // Mock waitlist data for demonstration
  useEffect(() => {
    // In real implementation, this would come from API/WebSocket
    const mockEntries: WaitlistEntry[] = [
      {
        tableId: 'table-456',
        tableName: 'Sakura Lounge',
        position: 3,
        estimatedWait: 5,
        joinedAt: new Date(Date.now() - 2 * 60000) // 2 minutes ago
      },
      {
        tableId: 'table-888',
        tableName: 'Lucky Eights',
        position: 8,
        estimatedWait: 15,
        joinedAt: new Date(Date.now() - 30000) // 30 seconds ago
      }
    ];
    
    if (waitlistEntries.length === 0 && tables.length > 0) {
      // Only set mock data if we have tables and no entries yet
      const validEntries = mockEntries.filter(entry => 
        tables.some(table => table.id === entry.tableId && table.waitlist > 0)
      );
      if (validEntries.length > 0) {
        setWaitlistEntries(validEntries);
      }
    }
  }, [tables, waitlistEntries.length]);

  const leaveWaitlist = (tableId: string) => {
    setWaitlistEntries(prev => prev.filter(entry => entry.tableId !== tableId));
    // In real implementation, would call API to leave waitlist
  };

  const getTimeWaiting = (joinedAt: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - joinedAt.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    return diffMins;
  };

  if (waitlistEntries.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-20 right-4 z-40">
      {/* Collapsed View */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-amber-600 hover:bg-amber-500 text-white rounded-lg px-4 py-2 shadow-lg flex items-center space-x-2 transition-all transform hover:scale-105"
        >
          <span className="animate-pulse">⏳</span>
          <span className="font-semibold">Waitlist ({waitlistEntries.length})</span>
        </button>
      )}

      {/* Expanded View */}
      {isOpen && (
        <div className="bg-slate-800 rounded-lg shadow-2xl border border-amber-500/30 w-80 overflow-hidden">
          <div className="bg-gradient-to-r from-amber-600 to-amber-500 px-4 py-3 flex items-center justify-between">
            <h3 className="font-semibold text-white flex items-center space-x-2">
              <span>⏳</span>
              <span>Your Waitlists</span>
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/80 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
            {waitlistEntries.map((entry) => (
              <div
                key={entry.tableId}
                className="bg-slate-900/50 rounded-lg p-3 border border-slate-700"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-semibold text-white">{entry.tableName}</h4>
                    <div className="text-sm text-slate-400">
                      Position: <span className="text-amber-400 font-medium">#{entry.position}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => leaveWaitlist(entry.tableId)}
                    className="text-slate-400 hover:text-red-400 transition-colors"
                    title="Leave waitlist"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Est. wait:</span>
                    <span className="text-white">{entry.estimatedWait} min</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Waiting:</span>
                    <span className="text-white">{getTimeWaiting(entry.joinedAt)} min</span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-2">
                  <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300"
                      style={{ 
                        width: `${Math.min(100, (getTimeWaiting(entry.joinedAt) / entry.estimatedWait) * 100)}%` 
                      }}
                    />
                  </div>
                </div>

                {/* Ready notification */}
                {entry.position === 1 && (
                  <div className="mt-2 p-2 bg-emerald-500/20 border border-emerald-500/30 rounded text-xs text-emerald-400 flex items-center justify-between">
                    <span>🎉 Your turn is next!</span>
                    <button
                      onClick={() => onJoinTable(entry.tableId)}
                      className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium transition-colors"
                    >
                      Join Now
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="p-3 bg-slate-900/50 border-t border-slate-700 text-xs text-slate-400 text-center">
            Positions update in real-time
          </div>
        </div>
      )}
    </div>
  );
};

export default WaitlistPanel;