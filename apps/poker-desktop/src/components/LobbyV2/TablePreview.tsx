import React from 'react';
import TablePreviewCard from './TablePreviewCard';
import { Table } from './types';

interface TablePreviewProps {
  table: Table | null;
  onJoinTable?: (tableId: string) => void;
}

// Re-export the enhanced TablePreviewCard as TablePreview for compatibility
const TablePreview: React.FC<TablePreviewProps> = ({ table, onJoinTable }) => {
  return <TablePreviewCard table={table} />;
};

export default TablePreview;