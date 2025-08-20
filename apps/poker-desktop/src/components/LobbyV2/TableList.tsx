import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { FixedSizeList as List } from 'react-window';
import { useLobbyStore } from '../../stores/lobby-store';
import TableListHeader from './TableListHeader';
import TableListRow from './TableListRow';
import { useContainerSize } from '../../hooks/common';
import { LoadingSpinner, ErrorMessage, EmptyState, ErrorBoundary } from '../shared';
import { createSortedTablesSelector, type SortColumn, type SortDirection } from '../../selectors/table-selectors';

interface TableListProps {
  apiUrl: string;
  selectedTableId: string | null;
  onTableSelect: (tableId: string) => void;
}

const ITEM_HEIGHT = 56; // Height of each table row

// Create the sorted tables selector instance
const sortedTablesSelector = createSortedTablesSelector();

const TableList: React.FC<TableListProps> = ({ 
  apiUrl, 
  selectedTableId, 
  onTableSelect 
}) => {
  const { tables, isLoadingTables, tablesError, toggleFavorite, favoriteTableIds, favoriteTables } = useLobbyStore();
  const [sortColumn, setSortColumn] = useState<SortColumn>('stakes');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const { containerRef, width, height } = useContainerSize();

  const handleSort = useCallback((column: SortColumn) => {
    if (column === sortColumn) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn]);

  const sortedTables = useMemo(() => {
    return sortedTablesSelector(tables, favoriteTables, sortColumn, sortDirection);
  }, [tables, favoriteTables, sortColumn, sortDirection]);

  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const table = sortedTables[index];
    const isFavorite = favoriteTableIds?.has(table.id) || false;
    
    return (
      <div style={style}>
        <TableListRow
          key={table.id}
          table={table}
          isSelected={selectedTableId === table.id}
          onSelect={() => onTableSelect(table.id)}
          apiUrl={apiUrl}
          isFavorite={isFavorite}
          onToggleFavorite={() => toggleFavorite?.(table.id)}
        />
      </div>
    );
  }, [sortedTables, selectedTableId, onTableSelect, apiUrl, favoriteTableIds, toggleFavorite]);

  if (isLoadingTables) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner size="lg" label="Loading tables..." />
      </div>
    );
  }
  
  if (tablesError) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <ErrorMessage error={tablesError} />
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
      
      <div className="flex-1 bg-slate-900/50" ref={containerRef}>
        {sortedTables.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <EmptyState
              title="No tables found"
              description="No tables match your current filters. Try adjusting your preferences."
              icon={
                <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              }
            />
          </div>
        ) : (
          height > 0 && width > 0 && sortedTables.length > 0 && (
            <List
              height={height}
              itemCount={sortedTables.length}
              itemSize={ITEM_HEIGHT}
              width={width}
              className="scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900"
              data-testid="virtual-list"
              overscanCount={3}
            >
              {Row}
            </List>
          )
        )}
      </div>
    </div>
  );
};

export default TableList;