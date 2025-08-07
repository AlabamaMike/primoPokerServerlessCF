import React, { useState, useMemo } from 'react';
import { clsx } from 'clsx';

export interface Transaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'buy_in' | 'cash_out';
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  timestamp: Date;
  description: string;
  tableId?: string;
}

interface TransactionHistoryProps {
  transactions: Transaction[];
  isLoading?: boolean;
  pageSize?: number;
  showFilters?: boolean;
  showSort?: boolean;
  onRefresh?: () => void;
}

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  transactions,
  isLoading = false,
  pageSize = 10,
  showFilters = false,
  showSort = false,
  onRefresh
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [filterType, setFilterType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('date_desc');
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  const formatAmount = (amount: number, type: string): string => {
    const sign = type === 'deposit' ? '+' : '-';
    return `${sign}$${amount.toFixed(2)}`;
  };

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const getStatusClass = (status: string): string => {
    switch (status) {
      case 'completed':
        return 'text-green-600';
      case 'pending':
        return 'text-yellow-600';
      case 'failed':
        return 'text-red-600';
      default:
        return '';
    }
  };

  const filteredTransactions = useMemo(() => {
    let filtered = [...transactions];
    
    if (filterType !== 'all') {
      filtered = filtered.filter(tx => tx.type === filterType);
    }
    
    // Sort transactions
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date_desc':
          return b.timestamp.getTime() - a.timestamp.getTime();
        case 'date_asc':
          return a.timestamp.getTime() - b.timestamp.getTime();
        case 'amount_desc':
          return b.amount - a.amount;
        case 'amount_asc':
          return a.amount - b.amount;
        default:
          return 0;
      }
    });
    
    return filtered;
  }, [transactions, filterType, sortBy]);

  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredTransactions.slice(startIndex, startIndex + pageSize);
  }, [filteredTransactions, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredTransactions.length / pageSize);

  if (isLoading) {
    return (
      <div data-testid="transaction-history-loading" className="animate-pulse">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 bg-gray-200 rounded mb-2"></div>
        ))}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No transactions yet
      </div>
    );
  }

  return (
    <div className="transaction-history">
      <div className="mb-4 flex justify-between items-center">
        <h3 className="text-lg font-semibold">Transaction History</h3>
        {onRefresh && (
          <button
            onClick={onRefresh}
            aria-label="Refresh"
            className="p-2 hover:bg-gray-100 rounded"
          >
            🔄
          </button>
        )}
      </div>

      {(showFilters || showSort) && (
        <div className="mb-4 flex gap-4">
          {showFilters && (
            <div>
              <label htmlFor="filter-type" className="block text-sm font-medium mb-1">
                Filter by type
              </label>
              <select
                id="filter-type"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="border rounded px-3 py-1"
              >
                <option value="all">All</option>
                <option value="deposit">Deposits</option>
                <option value="withdrawal">Withdrawals</option>
                <option value="buy_in">Buy-ins</option>
                <option value="cash_out">Cash-outs</option>
              </select>
            </div>
          )}
          
          {showSort && (
            <div>
              <label htmlFor="sort-by" className="block text-sm font-medium mb-1">
                Sort by
              </label>
              <select
                id="sort-by"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="border rounded px-3 py-1"
              >
                <option value="date_desc">Date (Newest)</option>
                <option value="date_asc">Date (Oldest)</option>
                <option value="amount_desc">Amount (Highest)</option>
                <option value="amount_asc">Amount (Lowest)</option>
              </select>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {paginatedTransactions.map((transaction) => (
          <div
            key={transaction.id}
            onClick={() => setSelectedTransaction(transaction)}
            className="border rounded p-4 hover:bg-gray-50 cursor-pointer"
          >
            <div className="flex justify-between items-center">
              <div>
                <div className="font-medium">{transaction.description}</div>
                <div className="text-sm text-gray-600">
                  {formatDate(transaction.timestamp)}
                </div>
              </div>
              <div className="text-right">
                <div 
                  data-testid="transaction-amount"
                  className={clsx(
                    'font-semibold',
                    transaction.type === 'deposit' ? 'text-green-600' : 'text-red-600'
                  )}
                >
                  {formatAmount(transaction.amount, transaction.type)}
                </div>
                <div className={clsx('text-sm capitalize', getStatusClass(transaction.status))}>
                  {transaction.status === 'completed' ? 'Completed' : 
                   transaction.status === 'pending' ? 'Pending' : 'Failed'}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex justify-between items-center">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 border rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 border rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {selectedTransaction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h4 className="text-lg font-semibold mb-4">Transaction Details</h4>
            <div className="space-y-2">
              <div>
                <span className="font-medium">Transaction ID:</span> {selectedTransaction.id}
              </div>
              <div>
                <span className="font-medium">Type:</span> {selectedTransaction.type}
              </div>
              <div>
                <span className="font-medium">Amount:</span> {formatAmount(selectedTransaction.amount, selectedTransaction.type)}
              </div>
              <div>
                <span className="font-medium">Status:</span> {selectedTransaction.status}
              </div>
              <div>
                <span className="font-medium">Date:</span> {formatDate(selectedTransaction.timestamp)}
              </div>
            </div>
            <button
              onClick={() => setSelectedTransaction(null)}
              className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};