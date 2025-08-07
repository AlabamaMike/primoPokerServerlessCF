import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TransactionStatus } from '../TransactionStatus';

describe('TransactionStatus', () => {
  it('should render completed status', () => {
    render(<TransactionStatus status="completed" />);
    
    const statusElement = screen.getByText('Completed');
    expect(statusElement).toBeInTheDocument();
    expect(statusElement).toHaveClass('text-green-600');
    expect(screen.getByTestId('status-icon-completed')).toBeInTheDocument();
  });

  it('should render pending status', () => {
    render(<TransactionStatus status="pending" />);
    
    const statusElement = screen.getByText('Pending');
    expect(statusElement).toBeInTheDocument();
    expect(statusElement).toHaveClass('text-yellow-600');
    expect(screen.getByTestId('status-icon-pending')).toBeInTheDocument();
  });

  it('should render failed status', () => {
    render(<TransactionStatus status="failed" />);
    
    const statusElement = screen.getByText('Failed');
    expect(statusElement).toBeInTheDocument();
    expect(statusElement).toHaveClass('text-red-600');
    expect(screen.getByTestId('status-icon-failed')).toBeInTheDocument();
  });

  it('should render processing status', () => {
    render(<TransactionStatus status="processing" />);
    
    const statusElement = screen.getByText('Processing');
    expect(statusElement).toBeInTheDocument();
    expect(statusElement).toHaveClass('text-blue-600');
    expect(screen.getByTestId('status-spinner')).toBeInTheDocument();
  });

  it('should render with custom size', () => {
    const { container } = render(<TransactionStatus status="completed" size="large" />);
    
    expect(container.firstChild).toHaveClass('transaction-status--large');
  });

  it('should show timestamp when provided', () => {
    const timestamp = new Date('2025-01-01T12:00:00Z');
    render(<TransactionStatus status="completed" timestamp={timestamp} />);
    
    expect(screen.getByText('Jan 1, 2025, 12:00 PM')).toBeInTheDocument();
  });

  it('should show custom message when provided', () => {
    render(
      <TransactionStatus 
        status="failed" 
        message="Card declined by issuer"
      />
    );
    
    expect(screen.getByText('Card declined by issuer')).toBeInTheDocument();
  });

  it('should render inline variant', () => {
    const { container } = render(
      <TransactionStatus status="completed" variant="inline" />
    );
    
    expect(container.firstChild).toHaveClass('transaction-status--inline');
  });

  it('should render badge variant', () => {
    const { container } = render(
      <TransactionStatus status="pending" variant="badge" />
    );
    
    expect(container.firstChild).toHaveClass('transaction-status--badge');
  });

  it('should show progress for processing with percentage', () => {
    render(
      <TransactionStatus 
        status="processing" 
        progress={75}
      />
    );
    
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
  });

  it('should be accessible with proper ARIA attributes', () => {
    render(<TransactionStatus status="pending" />);
    
    const statusElement = screen.getByRole('status');
    expect(statusElement).toHaveAttribute('aria-label', 'Transaction status: Pending');
  });

  it('should handle canceled status', () => {
    render(<TransactionStatus status="canceled" />);
    
    const statusElement = screen.getByText('Canceled');
    expect(statusElement).toBeInTheDocument();
    expect(statusElement).toHaveClass('text-gray-600');
  });

  it('should show retry option for failed status', () => {
    const onRetry = jest.fn();
    render(
      <TransactionStatus 
        status="failed" 
        showRetry={true}
        onRetry={onRetry}
      />
    );
    
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('should animate status changes', () => {
    const { rerender } = render(<TransactionStatus status="pending" />);
    
    expect(screen.getByText('Pending')).toBeInTheDocument();
    
    rerender(<TransactionStatus status="completed" />);
    
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByTestId('status-transition')).toHaveClass('transition-all');
  });
});