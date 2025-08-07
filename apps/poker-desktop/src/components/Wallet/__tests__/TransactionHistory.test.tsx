import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TransactionHistory } from '../TransactionHistory';

const mockTransactions = [
  {
    id: '1',
    type: 'deposit' as const,
    amount: 100,
    currency: 'USD',
    status: 'completed' as const,
    timestamp: new Date('2025-01-01T10:00:00Z'),
    description: 'Deposit from bank'
  },
  {
    id: '2',
    type: 'withdrawal' as const,
    amount: 50,
    currency: 'USD',
    status: 'pending' as const,
    timestamp: new Date('2025-01-02T15:30:00Z'),
    description: 'Withdrawal to bank'
  },
  {
    id: '3',
    type: 'buy_in' as const,
    amount: 25,
    currency: 'USD',
    status: 'completed' as const,
    timestamp: new Date('2025-01-03T20:00:00Z'),
    description: 'Table buy-in',
    tableId: 'table-123'
  }
];

describe('TransactionHistory', () => {
  it('should render empty state when no transactions', () => {
    render(<TransactionHistory transactions={[]} />);
    expect(screen.getByText('No transactions yet')).toBeInTheDocument();
  });

  it('should display list of transactions', () => {
    render(<TransactionHistory transactions={mockTransactions} />);
    
    expect(screen.getByText('Deposit from bank')).toBeInTheDocument();
    expect(screen.getByText('Withdrawal to bank')).toBeInTheDocument();
    expect(screen.getByText('Table buy-in')).toBeInTheDocument();
  });

  it('should format transaction amounts correctly', () => {
    render(<TransactionHistory transactions={mockTransactions} />);
    
    expect(screen.getByText('+$100.00')).toBeInTheDocument();
    expect(screen.getByText('-$50.00')).toBeInTheDocument();
    expect(screen.getByText('-$25.00')).toBeInTheDocument();
  });

  it('should show transaction status', () => {
    render(<TransactionHistory transactions={mockTransactions} />);
    
    expect(screen.getAllByText('Completed')).toHaveLength(2);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('should show loading state', () => {
    render(<TransactionHistory transactions={[]} isLoading />);
    expect(screen.getByTestId('transaction-history-loading')).toBeInTheDocument();
  });

  it('should handle pagination', async () => {
    const manyTransactions = Array.from({ length: 25 }, (_, i) => ({
      id: `tx-${i}`,
      type: 'deposit' as const,
      amount: 10 + i,
      currency: 'USD',
      status: 'completed' as const,
      timestamp: new Date(`2025-01-${i + 1}T10:00:00Z`),
      description: `Transaction ${i + 1}`
    }));

    render(<TransactionHistory transactions={manyTransactions} pageSize={10} />);
    
    // Should show first 10 transactions
    expect(screen.getByText('Transaction 1')).toBeInTheDocument();
    expect(screen.getByText('Transaction 10')).toBeInTheDocument();
    expect(screen.queryByText('Transaction 11')).not.toBeInTheDocument();
    
    // Click next page
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);
    
    await waitFor(() => {
      expect(screen.getByText('Transaction 11')).toBeInTheDocument();
      expect(screen.queryByText('Transaction 1')).not.toBeInTheDocument();
    });
  });

  it('should filter by transaction type', () => {
    render(<TransactionHistory transactions={mockTransactions} showFilters />);
    
    const filterSelect = screen.getByLabelText('Filter by type');
    fireEvent.change(filterSelect, { target: { value: 'deposit' } });
    
    expect(screen.getByText('Deposit from bank')).toBeInTheDocument();
    expect(screen.queryByText('Withdrawal to bank')).not.toBeInTheDocument();
    expect(screen.queryByText('Table buy-in')).not.toBeInTheDocument();
  });

  it('should sort transactions', () => {
    render(<TransactionHistory transactions={mockTransactions} showSort />);
    
    const sortSelect = screen.getByLabelText('Sort by');
    fireEvent.change(sortSelect, { target: { value: 'amount_desc' } });
    
    const amounts = screen.getAllByTestId('transaction-amount');
    expect(amounts[0]).toHaveTextContent('+$100.00');
    expect(amounts[1]).toHaveTextContent('-$50.00');
    expect(amounts[2]).toHaveTextContent('-$25.00');
  });

  it('should handle refresh action', async () => {
    const onRefresh = jest.fn();
    render(<TransactionHistory transactions={mockTransactions} onRefresh={onRefresh} />);
    
    const refreshButton = screen.getByLabelText('Refresh');
    fireEvent.click(refreshButton);
    
    expect(onRefresh).toHaveBeenCalled();
  });

  it('should display transaction details on click', async () => {
    render(<TransactionHistory transactions={mockTransactions} />);
    
    const firstTransaction = screen.getByText('Deposit from bank');
    fireEvent.click(firstTransaction);
    
    await waitFor(() => {
      expect(screen.getByText('Transaction Details')).toBeInTheDocument();
      expect(screen.getByText('Transaction ID: 1')).toBeInTheDocument();
    });
  });
});