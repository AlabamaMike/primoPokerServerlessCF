import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WalletBalance } from '../WalletBalance';

describe('WalletBalance', () => {
  it('should render with zero balance', () => {
    render(<WalletBalance balance={0} />);
    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });

  it('should format currency correctly', () => {
    render(<WalletBalance balance={1234.56} />);
    expect(screen.getByText('$1,234.56')).toBeInTheDocument();
  });

  it('should handle large amounts', () => {
    render(<WalletBalance balance={1000000.99} />);
    expect(screen.getByText('$1,000,000.99')).toBeInTheDocument();
  });

  it('should show loading state', () => {
    render(<WalletBalance balance={0} isLoading />);
    expect(screen.getByTestId('wallet-balance-loading')).toBeInTheDocument();
  });

  it('should show error state', () => {
    render(<WalletBalance balance={0} error="Failed to load balance" />);
    expect(screen.getByText('Failed to load balance')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(<WalletBalance balance={100} className="custom-class" />);
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('should show currency symbol based on locale', () => {
    render(<WalletBalance balance={100} currency="EUR" />);
    expect(screen.getByText('€100.00')).toBeInTheDocument();
  });

  it('should handle real-time updates', () => {
    const { rerender } = render(<WalletBalance balance={100} />);
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    
    rerender(<WalletBalance balance={150.50} />);
    expect(screen.getByText('$150.50')).toBeInTheDocument();
  });

  it('should show wallet label', () => {
    render(<WalletBalance balance={100} showLabel />);
    expect(screen.getByText('Wallet Balance')).toBeInTheDocument();
  });

  describe('Screen Reader Announcements', () => {
    beforeEach(() => {
      // Clean up any existing announcer elements
      document.querySelectorAll('[role="status"]').forEach(el => el.remove());
    });

    afterEach(() => {
      // Clean up after tests
      document.querySelectorAll('[role="status"]').forEach(el => el.remove());
    });

    it('should announce balance increases to screen readers', async () => {
      const { rerender } = render(<WalletBalance balance={100} />);
      
      // Update balance to trigger announcement
      rerender(<WalletBalance balance={150} />);
      
      await waitFor(() => {
        const announcer = document.querySelector('[role="status"]');
        expect(announcer).toBeInTheDocument();
        expect(announcer).toHaveTextContent('Wallet balance increased by $50.00. New balance is $150.00');
      });
    });

    it('should announce balance decreases to screen readers', async () => {
      const { rerender } = render(<WalletBalance balance={100} />);
      
      // Update balance to trigger announcement
      rerender(<WalletBalance balance={75} />);
      
      await waitFor(() => {
        const announcer = document.querySelector('[role="status"]');
        expect(announcer).toBeInTheDocument();
        expect(announcer).toHaveTextContent('Wallet balance decreased by $25.00. New balance is $75.00');
      });
    });

    it('should not announce when balance unchanged', async () => {
      const { rerender } = render(<WalletBalance balance={100} />);
      
      // Rerender with same balance
      rerender(<WalletBalance balance={100} />);
      
      // Should not create announcer element
      const announcer = document.querySelector('[role="status"]');
      expect(announcer).not.toBeInTheDocument();
    });

    it('should not announce during loading state', async () => {
      const { rerender } = render(<WalletBalance balance={100} />);
      
      // Update balance while loading
      rerender(<WalletBalance balance={150} isLoading />);
      
      // Should not create announcer element
      const announcer = document.querySelector('[role="status"]');
      expect(announcer).not.toBeInTheDocument();
    });

    it('should not announce during error state', async () => {
      const { rerender } = render(<WalletBalance balance={100} />);
      
      // Update balance with error
      rerender(<WalletBalance balance={150} error="Network error" />);
      
      // Should not create announcer element
      const announcer = document.querySelector('[role="status"]');
      expect(announcer).not.toBeInTheDocument();
    });

    it('should have correct ARIA attributes', () => {
      render(<WalletBalance balance={123.45} />);
      
      const balanceElement = screen.getByText('$123.45');
      expect(balanceElement).toHaveAttribute('aria-label', 'Wallet balance: $123.45');
      expect(balanceElement).toHaveAttribute('role', 'text');
    });
  });
});