import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { DepositModal } from '../DepositModal';

describe('DepositModal', () => {
  const mockOnDeposit = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render when open', () => {
    render(
      <DepositModal
        isOpen={true}
        onClose={mockOnClose}
        onDeposit={mockOnDeposit}
      />
    );
    
    expect(screen.getByText('Make a Deposit')).toBeInTheDocument();
  });

  it('should not render when closed', () => {
    render(
      <DepositModal
        isOpen={false}
        onClose={mockOnClose}
        onDeposit={mockOnDeposit}
      />
    );
    
    expect(screen.queryByText('Make a Deposit')).not.toBeInTheDocument();
  });

  it('should validate minimum deposit amount', async () => {
    const user = userEvent.setup();
    render(
      <DepositModal
        isOpen={true}
        onClose={mockOnClose}
        onDeposit={mockOnDeposit}
        minDeposit={10}
      />
    );
    
    const input = screen.getByLabelText('Deposit Amount');
    const submitButton = screen.getByText('Deposit');
    
    await user.type(input, '5');
    await user.click(submitButton);
    
    expect(screen.getByText('Minimum deposit is $10.00')).toBeInTheDocument();
    expect(mockOnDeposit).not.toHaveBeenCalled();
  });

  it('should validate maximum deposit amount', async () => {
    const user = userEvent.setup();
    render(
      <DepositModal
        isOpen={true}
        onClose={mockOnClose}
        onDeposit={mockOnDeposit}
        maxDeposit={1000}
      />
    );
    
    const input = screen.getByLabelText('Deposit Amount');
    const submitButton = screen.getByText('Deposit');
    
    await user.type(input, '1500');
    await user.click(submitButton);
    
    expect(screen.getByText('Maximum deposit is $1,000.00')).toBeInTheDocument();
    expect(mockOnDeposit).not.toHaveBeenCalled();
  });

  it('should handle valid deposit submission', async () => {
    const user = userEvent.setup();
    render(
      <DepositModal
        isOpen={true}
        onClose={mockOnClose}
        onDeposit={mockOnDeposit}
      />
    );
    
    const input = screen.getByLabelText('Deposit Amount');
    const submitButton = screen.getByText('Deposit');
    
    await user.type(input, '100.50');
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(mockOnDeposit).toHaveBeenCalledWith({
        amount: 100.50,
        currency: 'USD',
        paymentMethod: 'card'
      });
    });
  });

  it('should show loading state during deposit', async () => {
    const user = userEvent.setup();
    render(
      <DepositModal
        isOpen={true}
        onClose={mockOnClose}
        onDeposit={mockOnDeposit}
        isProcessing={true}
      />
    );
    
    expect(screen.getByText('Processing...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /deposit/i })).toBeDisabled();
  });

  it('should display preset amounts', async () => {
    const user = userEvent.setup();
    render(
      <DepositModal
        isOpen={true}
        onClose={mockOnClose}
        onDeposit={mockOnDeposit}
        presetAmounts={[25, 50, 100, 250]}
      />
    );
    
    const preset50 = screen.getByText('$50');
    await user.click(preset50);
    
    const input = screen.getByLabelText('Deposit Amount');
    expect(input).toHaveValue(50);
  });

  it('should validate numeric input only', async () => {
    const user = userEvent.setup();
    render(
      <DepositModal
        isOpen={true}
        onClose={mockOnClose}
        onDeposit={mockOnDeposit}
      />
    );
    
    const input = screen.getByLabelText('Deposit Amount');
    await user.type(input, 'abc');
    
    expect(input).toHaveValue(0);
  });

  it('should close modal on cancel', async () => {
    const user = userEvent.setup();
    render(
      <DepositModal
        isOpen={true}
        onClose={mockOnClose}
        onDeposit={mockOnDeposit}
      />
    );
    
    const cancelButton = screen.getByText('Cancel');
    await user.click(cancelButton);
    
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should close modal on backdrop click', async () => {
    const user = userEvent.setup();
    render(
      <DepositModal
        isOpen={true}
        onClose={mockOnClose}
        onDeposit={mockOnDeposit}
      />
    );
    
    const backdrop = screen.getByTestId('modal-backdrop');
    await user.click(backdrop);
    
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should show error message', () => {
    render(
      <DepositModal
        isOpen={true}
        onClose={mockOnClose}
        onDeposit={mockOnDeposit}
        error="Payment method declined"
      />
    );
    
    expect(screen.getByText('Payment method declined')).toBeInTheDocument();
  });

  it('should allow payment method selection', async () => {
    const user = userEvent.setup();
    render(
      <DepositModal
        isOpen={true}
        onClose={mockOnClose}
        onDeposit={mockOnDeposit}
        paymentMethods={['card', 'bank', 'crypto']}
      />
    );
    
    const methodSelect = screen.getByLabelText('Payment Method');
    await user.selectOptions(methodSelect, 'crypto');
    
    const input = screen.getByLabelText('Deposit Amount');
    const submitButton = screen.getByText('Deposit');
    
    await user.type(input, '100');
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(mockOnDeposit).toHaveBeenCalledWith({
        amount: 100,
        currency: 'USD',
        paymentMethod: 'crypto'
      });
    });
  });
});