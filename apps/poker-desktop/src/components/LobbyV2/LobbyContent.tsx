import React from 'react';
import FilterPanel from './FilterPanel';
import TableList from './TableList';
import TablePreview from './TablePreview';
import { useLobbyStore } from '../../stores/lobby-store';
import { ErrorBoundary } from '../shared';

interface LobbyContentProps {
  apiUrl: string;
  onJoinTable?: (tableId: string) => void;
}

const LobbyContent: React.FC<LobbyContentProps> = ({ apiUrl, onJoinTable }) => {
  const { 
    filters, 
    setFilters, 
    selectedTableId, 
    selectedTable,
    selectTable 
  } = useLobbyStore();

  return (
    <div className="flex-1 flex overflow-hidden">
      <ErrorBoundary>
        <FilterPanel />
      </ErrorBoundary>
      
      <ErrorBoundary>
        <TableList 
          apiUrl={apiUrl}
          selectedTableId={selectedTableId}
          onTableSelect={selectTable}
        />
      </ErrorBoundary>
      
      <ErrorBoundary>
        <TablePreview 
          table={selectedTable}
          onJoinTable={onJoinTable}
        />
      </ErrorBoundary>
    </div>
  );
};

export default LobbyContent;