import React from 'react';
import FilterSidebar from './FilterSidebar';
import TableList from './TableList';
import TablePreview from './TablePreview';
import { useLobbyStore } from '../../stores/lobby-store';

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
      <FilterSidebar 
        filters={filters}
        onFiltersChange={setFilters}
      />
      
      <TableList 
        apiUrl={apiUrl}
        selectedTableId={selectedTableId}
        onTableSelect={selectTable}
      />
      
      <TablePreview 
        table={selectedTable}
        onJoinTable={onJoinTable}
      />
    </div>
  );
};

export default LobbyContent;