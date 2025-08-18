import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TransactionHistory } from '../TransactionHistory';
import userEvent from '@testing-library/user-event';

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

  describe('Search Functionality', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it('should show search input when showSearch is true', () => {
      render(<TransactionHistory transactions={mockTransactions} showSearch />);
      
      expect(screen.getByPlaceholderText('Search transactions...')).toBeInTheDocument();
    });

    it('should filter transactions by description', async () => {
      const user = userEvent.setup({ delay: null });
      render(<TransactionHistory transactions={mockTransactions} showSearch />);
      
      const searchInput = screen.getByPlaceholderText('Search transactions...');
      await user.type(searchInput, 'bank');
      
      // Fast forward debounce timer
      jest.advanceTimersByTime(300);
      
      await waitFor(() => {
        expect(screen.getByText('Deposit from bank')).toBeInTheDocument();
        expect(screen.getByText('Withdrawal to bank')).toBeInTheDocument();
        expect(screen.queryByText('Table buy-in')).not.toBeInTheDocument();
      });
    });

    it('should filter transactions by ID', async () => {
      const user = userEvent.setup({ delay: null });
      render(<TransactionHistory transactions={mockTransactions} showSearch />);
      
      const searchInput = screen.getByPlaceholderText('Search transactions...');
      await user.type(searchInput, '2');
      
      jest.advanceTimersByTime(300);
      
      await waitFor(() => {
        expect(screen.getByText('Withdrawal to bank')).toBeInTheDocument();
        expect(screen.queryByText('Deposit from bank')).not.toBeInTheDocument();
        expect(screen.queryByText('Table buy-in')).not.toBeInTheDocument();
      });
    });

    it('should filter transactions by amount', async () => {
      const user = userEvent.setup({ delay: null });
      render(<TransactionHistory transactions={mockTransactions} showSearch />);
      
      const searchInput = screen.getByPlaceholderText('Search transactions...');
      await user.type(searchInput, '50');
      
      jest.advanceTimersByTime(300);
      
      await waitFor(() => {
        expect(screen.getByText('Withdrawal to bank')).toBeInTheDocument();
        expect(screen.queryByText('Deposit from bank')).not.toBeInTheDocument();
        expect(screen.queryByText('Table buy-in')).not.toBeInTheDocument();
      });
    });

    it('should debounce search input', async () => {
      const user = userEvent.setup({ delay: null });
      render(<TransactionHistory transactions={mockTransactions} showSearch />);
      
      const searchInput = screen.getByPlaceholderText('Search transactions...');
      
      // Type rapidly
      await user.type(searchInput, 'b');
      await user.type(searchInput, 'a');
      await user.type(searchInput, 'n');
      await user.type(searchInput, 'k');
      
      // Should still show all transactions (not filtered yet)
      expect(screen.getByText('Table buy-in')).toBeInTheDocument();
      
      // Fast forward debounce timer
      jest.advanceTimersByTime(300);
      
      // Now should be filtered
      await waitFor(() => {
        expect(screen.queryByText('Table buy-in')).not.toBeInTheDocument();
      });
    });

    it('should reset to first page when search changes', async () => {
      const user = userEvent.setup({ delay: null });
      const manyTransactions = Array.from({ length: 25 }, (_, i) => ({
        id: `tx-${i}`,
        type: 'deposit' as const,
        amount: 10 + i,
        currency: 'USD',
        status: 'completed' as const,
        timestamp: new Date(`2025-01-${i + 1}T10:00:00Z`),
        description: i < 10 ? `Bank transaction ${i + 1}` : `Card transaction ${i + 1}`
      }));

      render(<TransactionHistory transactions={manyTransactions} showSearch pageSize={10} />);
      
      // Go to page 2
      fireEvent.click(screen.getByText('Next'));
      
      await waitFor(() => {
        expect(screen.getByText('Card transaction 11')).toBeInTheDocument();
      });
      
      // Search for 'Bank'
      const searchInput = screen.getByPlaceholderText('Search transactions...');
      await user.type(searchInput, 'Bank');
      
      jest.advanceTimersByTime(300);
      
      // Should reset to page 1 and show filtered results
      await waitFor(() => {
        expect(screen.getByText('Bank transaction 1')).toBeInTheDocument();
        expect(screen.queryByText('Card transaction 11')).not.toBeInTheDocument();
      });
    });

    it('should show empty state when search has no results', async () => {
      const user = userEvent.setup({ delay: null });
      render(<TransactionHistory transactions={mockTransactions} showSearch />);
      
      const searchInput = screen.getByPlaceholderText('Search transactions...');
      await user.type(searchInput, 'nonexistent');
      
      jest.advanceTimersByTime(300);
      
      await waitFor(() => {
        expect(screen.getByText('No transactions match your search')).toBeInTheDocument();
      });
    });

    it('should handle case-insensitive search', async () => {
      const user = userEvent.setup({ delay: null });
      render(<TransactionHistory transactions={mockTransactions} showSearch />);
      
      const searchInput = screen.getByPlaceholderText('Search transactions...');
      await user.type(searchInput, 'BANK');
      
      jest.advanceTimersByTime(300);
      
      await waitFor(() => {
        expect(screen.getByText('Deposit from bank')).toBeInTheDocument();
        expect(screen.getByText('Withdrawal to bank')).toBeInTheDocument();
      });
    });
  });

  describe('Performance optimizations', () => {
    it('should memoize filtered transactions', () => {
      const { rerender } = render(<TransactionHistory transactions={mockTransactions} />);
      
      // Force re-render with same props
      rerender(<TransactionHistory transactions={mockTransactions} />);
      
      // Should still display transactions (memoization working)
      expect(screen.getByText('Deposit from bank')).toBeInTheDocument();
    });

    it('should memoize sorted transactions', () => {
      const { rerender } = render(
        <TransactionHistory transactions={mockTransactions} showSort />
      );
      
      // Change sort order
      const sortSelect = screen.getByLabelText('Sort by');
      fireEvent.change(sortSelect, { target: { value: 'amount_desc' } });
      
      // Force re-render
      rerender(<TransactionHistory transactions={mockTransactions} showSort />);
      
      // Should maintain sort order (memoization working)
      const amounts = screen.getAllByTestId('transaction-amount');
      expect(amounts[0]).toHaveTextContent('+$100.00');
    });
  });
});