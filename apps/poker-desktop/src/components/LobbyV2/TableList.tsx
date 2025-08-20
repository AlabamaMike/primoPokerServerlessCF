import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { FixedSizeList as List } from 'react-window';
import { useLobbyStore } from '../../stores/lobby-store';
import TableListHeader from './TableListHeader';
import TableListRow from './TableListRow';
import { useContainerSize } from '../../hooks/common';
import { LoadingSpinner, ErrorMessage, EmptyState } from '../shared';

interface TableListProps {
  apiUrl: string;
  selectedTableId: string | null;
  onTableSelect: (tableId: string) => void;
}

type SortColumn = 'name' | 'stakes' | 'players' | 'avgPot' | 'speed' | 'waitlist';
type SortDirection = 'asc' | 'desc';

const ITEM_HEIGHT = 56; // Height of each table row

const TableList: React.FC<TableListProps> = ({ 
  apiUrl, 
  selectedTableId, 
  onTableSelect 
}) => {
  const { tables, isLoadingTables, tablesError, toggleFavorite, favoriteTableIds } = useLobbyStore();
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
    const sorted = [...tables].sort((a, b) => {
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

    // Sort favorites to top if enabled
    return sorted.sort((a, b) => {
      const aIsFavorite = favoriteTableIds?.has(a.id) || false;
      const bIsFavorite = favoriteTableIds?.has(b.id) || false;
      
      if (aIsFavorite && !bIsFavorite) return -1;
      if (!aIsFavorite && bIsFavorite) return 1;
      return 0;
    });
  }, [tables, sortColumn, sortDirection, favoriteTableIds]);

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