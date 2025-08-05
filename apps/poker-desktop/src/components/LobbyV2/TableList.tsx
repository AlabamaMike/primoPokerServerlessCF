import React, { useState } from 'react';
import { useLobbyStore } from '../../stores/lobby-store';
import TableListHeader from './TableListHeader';
import TableListRow from './TableListRow';

interface TableListProps {
  apiUrl: string;
  selectedTableId: string | null;
  onTableSelect: (tableId: string) => void;
}

type SortColumn = 'name' | 'stakes' | 'players' | 'avgPot' | 'speed' | 'waitlist';
type SortDirection = 'asc' | 'desc';

const TableList: React.FC<TableListProps> = ({ 
  apiUrl, 
  selectedTableId, 
  onTableSelect 
}) => {
  const { tables, isLoadingTables, tablesError, joinTable, joinWaitlist } = useLobbyStore();
  const [sortColumn, setSortColumn] = useState<SortColumn>('stakes');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');


  const handleSort = (column: SortColumn) => {
    if (column === sortColumn) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedTables = [...tables].sort((a, b) => {
    let compareValue = 0;
    
    switch (sortColumn) {
      case 'name':
        compareValue = a.name.localeCompare(b.name);
        break;
      case 'stakes':
        compareValue = a.stakes.big - b.stakes.big;
        break;
      case 'players':
        compareValue = a.players - b.players;
        break;
      case 'avgPot':
        compareValue = a.avgPot - b.avgPot;
        break;
      case 'speed':
        compareValue = (a.handsPerHour || 0) - (b.handsPerHour || 0);
        break;
      case 'waitlist':
        compareValue = a.waitlist - b.waitlist;
        break;
    }
    
    return sortDirection === 'asc' ? compareValue : -compareValue;
  });

  if (isLoadingTables) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-slate-400">Loading tables...</div>
      </div>
    );
  }
  
  if (tablesError) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-red-400">{tablesError}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <TableListHeader 
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={handleSort}
      />
      
      <div className="flex-1 overflow-y-auto bg-slate-900/50">
        {sortedTables.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            No tables match your filters
          </div>
        ) : (
          sortedTables.map(table => (
            <TableListRow
              key={table.id}
              table={table}
              isSelected={selectedTableId === table.id}
              onSelect={() => onTableSelect(table.id)}
              apiUrl={apiUrl}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default TableList;