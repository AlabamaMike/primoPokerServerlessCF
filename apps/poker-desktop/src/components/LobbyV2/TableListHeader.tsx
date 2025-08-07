import React from 'react';

interface TableListHeaderProps {
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  onSort: (column: any) => void;
}

const TableListHeader: React.FC<TableListHeaderProps> = ({ 
  sortColumn, 
  sortDirection, 
  onSort 
}) => {
  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return null;
    return (
      <span 
        data-testid={`sort-indicator-${column}`}
        className={`inline-block transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`}
      >
        ↑
      </span>
    );
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur border-b border-slate-700/50">
      <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
        <div 
          className="col-span-3 flex items-center space-x-1 cursor-pointer hover:text-purple-400 transition-colors"
          onClick={() => onSort('name')}
        >
          <span>Table Name</span>
          {getSortIcon('name')}
        </div>
        <div className="col-span-2">Game</div>
        <div 
          className="col-span-1 cursor-pointer hover:text-purple-400 transition-colors"
          onClick={() => onSort('stakes')}
        >
          <span>Stakes</span>
          {getSortIcon('stakes')}
        </div>
        <div 
          className="col-span-1 cursor-pointer hover:text-purple-400 transition-colors"
          onClick={() => onSort('players')}
        >
          <span>Players</span>
          {getSortIcon('players')}
        </div>
        <div 
          className="col-span-1 text-right cursor-pointer hover:text-purple-400 transition-colors"
          onClick={() => onSort('avgPot')}
        >
          <span>Avg Pot</span>
          {getSortIcon('avgPot')}
        </div>
        <div 
          className="col-span-1 text-right cursor-pointer hover:text-purple-400 transition-colors"
          onClick={() => onSort('speed')}
        >
          <span>Speed</span>
          {getSortIcon('speed')}
        </div>
        <div 
          className="col-span-1 text-center cursor-pointer hover:text-purple-400 transition-colors"
          onClick={() => onSort('waitlist')}
        >
          <span>Wait</span>
          {getSortIcon('waitlist')}
        </div>
        <div className="col-span-2"></div>
      </div>
    </div>
  );
};

export default TableListHeader;