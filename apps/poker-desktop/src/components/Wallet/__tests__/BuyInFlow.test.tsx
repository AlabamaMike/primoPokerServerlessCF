import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { BuyInFlow } from '../BuyInFlow';

const mockTable = {
  id: 'table-123',
  name: 'High Stakes Table',
  minBuyIn: 100,
  maxBuyIn: 1000,
  blinds: { small: 1, big: 2 }
};

describe('BuyInFlow', () => {
  const mockOnBuyIn = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should display table information', () => {
    render(
      <BuyInFlow
        table={mockTable}
        walletBalance={500}
        onBuyIn={mockOnBuyIn}
        onCancel={mockOnCancel}
      />
    );
    
    expect(screen.getByText('Buy-in to High Stakes Table')).toBeInTheDocument();
    expect(screen.getByText('Blinds: $1/$2')).toBeInTheDocument();
    expect(screen.getByText('Min buy-in: $100.00')).toBeInTheDocument();
    expect(screen.getByText('Max buy-in: $1,000.00')).toBeInTheDocument();
  });

  it('should show wallet balance', () => {
    render(
      <BuyInFlow
        table={mockTable}
        walletBalance={500}
        onBuyIn={mockOnBuyIn}
        onCancel={mockOnCancel}
      />
    );
    
    expect(screen.getByText('Wallet Balance: $500.00')).toBeInTheDocument();
  });

  it('should validate minimum buy-in', async () => {
    const user = userEvent.setup();
    render(
      <BuyInFlow
        table={mockTable}
        walletBalance={500}
        onBuyIn={mockOnBuyIn}
        onCancel={mockOnCancel}
      />
    );
    
    const input = screen.getByLabelText('Buy-in Amount');
    const submitButton = screen.getByText('Join Table');
    
    await user.type(input, '50');
    await user.click(submitButton);
    
    expect(screen.getByText('Minimum buy-in is $100.00')).toBeInTheDocument();
    expect(mockOnBuyIn).not.toHaveBeenCalled();
  });

  it('should validate maximum buy-in', async () => {
    const user = userEvent.setup();
    render(
      <BuyInFlow
        table={mockTable}
        walletBalance={2000}
        onBuyIn={mockOnBuyIn}
        onCancel={mockOnCancel}
      />
    );
    
    const input = screen.getByLabelText('Buy-in Amount');
    const submitButton = screen.getByText('Join Table');
    
    await user.type(input, '1500');
    await user.click(submitButton);
    
    expect(screen.getByText('Maximum buy-in is $1,000.00')).toBeInTheDocument();
    expect(mockOnBuyIn).not.toHaveBeenCalled();
  });

  it('should validate against wallet balance', async () => {
    const user = userEvent.setup();
    render(
      <BuyInFlow
        table={mockTable}
        walletBalance={50}
        onBuyIn={mockOnBuyIn}
        onCancel={mockOnCancel}
      />
    );
    
    const input = screen.getByLabelText('Buy-in Amount');
    const submitButton = screen.getByText('Join Table');
    
    await user.type(input, '100');
    await user.click(submitButton);
    
    expect(screen.getByText('Insufficient balance. Available: $50.00')).toBeInTheDocument();
    expect(mockOnBuyIn).not.toHaveBeenCalled();
  });

  it('should suggest buy-in amounts', async () => {
    const user = userEvent.setup();
    render(
      <BuyInFlow
        table={mockTable}
        walletBalance={1000}
        onBuyIn={mockOnBuyIn}
        onCancel={mockOnCancel}
      />
    );
    
    // Should show suggested amounts based on table limits
    expect(screen.getByText('Min ($100)')).toBeInTheDocument();
    expect(screen.getByText('50 BBs ($100)')).toBeInTheDocument();
    expect(screen.getByText('100 BBs ($200)')).toBeInTheDocument();
    expect(screen.getByText('Max ($1,000)')).toBeInTheDocument();
    
    // Click suggested amount
    const suggested200 = screen.getByText('100 BBs ($200)');
    await user.click(suggested200);
    
    const input = screen.getByLabelText('Buy-in Amount');
    expect(input).toHaveValue(200);
  });

  it('should handle successful buy-in', async () => {
    const user = userEvent.setup();
    render(
      <BuyInFlow
        table={mockTable}
        walletBalance={500}
        onBuyIn={mockOnBuyIn}
        onCancel={mockOnCancel}
      />
    );
    
    const input = screen.getByLabelText('Buy-in Amount');
    const submitButton = screen.getByText('Join Table');
    
    await user.type(input, '200');
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(mockOnBuyIn).toHaveBeenCalledWith({
        tableId: 'table-123',
        amount: 200,
        seatPreference: undefined
      });
    });
  });

  it('should allow seat preference selection', async () => {
    const user = userEvent.setup();
    render(
      <BuyInFlow
        table={mockTable}
        walletBalance={500}
        onBuyIn={mockOnBuyIn}
        onCancel={mockOnCancel}
        availableSeats={[1, 3, 5, 7]}
      />
    );
    
    expect(screen.getByText('Select Seat (Optional)')).toBeInTheDocument();
    
    const seatSelect = screen.getByLabelText('Preferred Seat');
    await user.selectOptions(seatSelect, '3');
    
    const input = screen.getByLabelText('Buy-in Amount');
    await user.type(input, '200');
    
    const submitButton = screen.getByText('Join Table');
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(mockOnBuyIn).toHaveBeenCalledWith({
        tableId: 'table-123',
        amount: 200,
        seatPreference: 3
      });
    });
  });

  it('should show loading state', () => {
    render(
      <BuyInFlow
        table={mockTable}
        walletBalance={500}
        onBuyIn={mockOnBuyIn}
        onCancel={mockOnCancel}
        isLoading={true}
      />
    );
    
    expect(screen.getByText('Joining table...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join/i })).toBeDisabled();
  });

  it('should handle cancel action', async () => {
    const user = userEvent.setup();
    render(
      <BuyInFlow
        table={mockTable}
        walletBalance={500}
        onBuyIn={mockOnBuyIn}
        onCancel={mockOnCancel}
      />
    );
    
    const cancelButton = screen.getByText('Cancel');
    await user.click(cancelButton);
    
    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('should show auto top-up option', async () => {
    const user = userEvent.setup();
    render(
      <BuyInFlow
        table={mockTable}
        walletBalance={500}
        onBuyIn={mockOnBuyIn}
        onCancel={mockOnCancel}
        showAutoTopUp={true}
      />
    );
    
    expect(screen.getByLabelText('Enable Auto Top-up')).toBeInTheDocument();
    
    const checkbox = screen.getByLabelText('Enable Auto Top-up');
    await user.click(checkbox);
    
    // Should show top-up threshold input
    expect(screen.getByLabelText('Top-up when balance falls below')).toBeInTheDocument();
    
    const thresholdInput = screen.getByLabelText('Top-up when balance falls below');
    await user.type(thresholdInput, '50');
    
    const amountInput = screen.getByLabelText('Buy-in Amount');
    await user.type(amountInput, '200');
    
    const submitButton = screen.getByText('Join Table');
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(mockOnBuyIn).toHaveBeenCalledWith({
        tableId: 'table-123',
        amount: 200,
        seatPreference: undefined,
        autoTopUp: {
          enabled: true,
          threshold: 50,
          topUpTo: 200
        }
      });
    });
  });

  it('should display table statistics if available', () => {
    render(
      <BuyInFlow
        table={{
          ...mockTable,
          stats: {
            averagePot: 25.50,
            playersPerFlop: 45,
            handsPerHour: 60
          }
        }}
        walletBalance={500}
        onBuyIn={mockOnBuyIn}
        onCancel={mockOnCancel}
      />
    );
    
    expect(screen.getByText('Table Statistics')).toBeInTheDocument();
    expect(screen.getByText('Avg Pot: $25.50')).toBeInTheDocument();
    expect(screen.getByText('Players/Flop: 45%')).toBeInTheDocument();
    expect(screen.getByText('Hands/Hour: 60')).toBeInTheDocument();
  });
});