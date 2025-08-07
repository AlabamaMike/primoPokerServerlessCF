import React from 'react';
import { render, screen } from '@testing-library/react';
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
});