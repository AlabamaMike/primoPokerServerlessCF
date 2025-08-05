import React, { useEffect, useState } from 'react';
import { useLobbyStore } from '../../stores/lobby-store';
import { useLobbyWebSocket } from '../../hooks/useLobbyWebSocket';

interface IntegrationTestProps {
  apiUrl: string;
}

const IntegrationTest: React.FC<IntegrationTestProps> = ({ apiUrl }) => {
  const [testResults, setTestResults] = useState<Record<string, boolean>>({});
  const [isRunning, setIsRunning] = useState(false);
  
  const { 
    tables, 
    stats, 
    isLoadingTables, 
    favoriteTables,
    fetchTables,
    fetchStats,
    toggleFavorite,
    setFilters,
    joinTable,
    joinWaitlist
  } = useLobbyStore();

  const { isConnected } = useLobbyWebSocket({
    url: apiUrl,
    enabled: true
  });

  const runTests = async () => {
    setIsRunning(true);
    const results: Record<string, boolean> = {};

    // Test 1: Fetch tables
    try {
      await fetchTables(apiUrl);
      results.fetchTables = tables.length > 0;
    } catch (error) {
      results.fetchTables = false;
    }

    // Test 2: Fetch stats
    try {
      await fetchStats(apiUrl);
      results.fetchStats = stats.playersOnline > 0;
    } catch (error) {
      results.fetchStats = false;
    }

    // Test 3: WebSocket connection
    results.websocketConnection = isConnected;

    // Test 4: Favorites persistence
    if (tables.length > 0) {
      const firstTableId = tables[0].id;
      toggleFavorite(firstTableId);
      results.favoritesToggle = favoriteTables.includes(firstTableId);
      
      // Check localStorage
      const stored = localStorage.getItem('primo-poker-favorites');
      results.favoritesStorage = stored !== null && JSON.parse(stored).includes(firstTableId);
    }

    // Test 5: Filtering
    const originalCount = tables.length;
    setFilters({ gameType: 'plo', stakes: 'all', speed: 'all', tableSize: 'all', features: [] });
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait for filter to apply
    const filteredCount = useLobbyStore.getState().tables.filter(t => t.gameType === 'plo').length;
    results.filtering = originalCount !== filteredCount || filteredCount === 0;

    // Test 6: Table selection
    if (tables.length > 0) {
      useLobbyStore.getState().selectTable(tables[0].id);
      results.tableSelection = useLobbyStore.getState().selectedTableId === tables[0].id;
    }

    setTestResults(results);
    setIsRunning(false);
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-purple-500/20">
      <h3 className="text-lg font-semibold mb-4 bg-gradient-to-r from-purple-400 to-amber-400 bg-clip-text text-transparent">
        Phase 2 Integration Test
      </h3>
      
      <div className="mb-4">
        <button
          onClick={runTests}
          disabled={isRunning}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {isRunning ? 'Running Tests...' : 'Run Integration Tests'}
        </button>
      </div>

      <div className="space-y-2">
        <TestResult label="API: Fetch Tables" status={testResults.fetchTables} />
        <TestResult label="API: Fetch Stats" status={testResults.fetchStats} />
        <TestResult label="WebSocket: Connection" status={testResults.websocketConnection} />
        <TestResult label="Store: Favorites Toggle" status={testResults.favoritesToggle} />
        <TestResult label="Store: Favorites Persistence" status={testResults.favoritesStorage} />
        <TestResult label="Store: Table Filtering" status={testResults.filtering} />
        <TestResult label="Store: Table Selection" status={testResults.tableSelection} />
      </div>

      <div className="mt-4 pt-4 border-t border-slate-700">
        <div className="text-sm space-y-1">
          <div className="text-slate-400">
            Tables Loaded: <span className="text-white font-medium">{tables.length}</span>
          </div>
          <div className="text-slate-400">
            Players Online: <span className="text-white font-medium">{stats.playersOnline.toLocaleString()}</span>
          </div>
          <div className="text-slate-400">
            Active Tables: <span className="text-white font-medium">{stats.activeTables}</span>
          </div>
          <div className="text-slate-400">
            Total Pot: <span className="text-white font-medium">€{stats.totalPot.toLocaleString()}</span>
          </div>
          <div className="text-slate-400">
            Favorites: <span className="text-white font-medium">{favoriteTables.length}</span>
          </div>
          <div className="text-slate-400">
            WebSocket: <span className={`font-medium ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const TestResult: React.FC<{ label: string; status?: boolean }> = ({ label, status }) => (
  <div className="flex items-center justify-between p-2 bg-slate-900/50 rounded">
    <span className="text-sm text-slate-300">{label}</span>
    <span className={`text-sm font-medium ${
      status === undefined ? 'text-slate-500' : 
      status ? 'text-emerald-400' : 'text-red-400'
    }`}>
      {status === undefined ? '—' : status ? '✓ Pass' : '✗ Fail'}
    </span>
  </div>
);

export default IntegrationTest;