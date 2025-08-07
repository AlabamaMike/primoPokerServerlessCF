import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { WithdrawModal } from '../WithdrawModal';

describe('WithdrawModal', () => {
  const mockOnWithdraw = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render when open', () => {
    render(
      <WithdrawModal
        isOpen={true}
        onClose={mockOnClose}
        onWithdraw={mockOnWithdraw}
        availableBalance={500}
      />
    );
    
    expect(screen.getByText('Withdraw Funds')).toBeInTheDocument();
    expect(screen.getByText('Available: $500.00')).toBeInTheDocument();
  });

  it('should not render when closed', () => {
    render(
      <WithdrawModal
        isOpen={false}
        onClose={mockOnClose}
        onWithdraw={mockOnWithdraw}
        availableBalance={500}
      />
    );
    
    expect(screen.queryByText('Withdraw Funds')).not.toBeInTheDocument();
  });

  it('should validate minimum withdrawal amount', async () => {
    const user = userEvent.setup();
    render(
      <WithdrawModal
        isOpen={true}
        onClose={mockOnClose}
        onWithdraw={mockOnWithdraw}
        availableBalance={500}
        minWithdrawal={20}
      />
    );
    
    const input = screen.getByLabelText('Withdrawal Amount');
    const submitButton = screen.getByText('Confirm Withdrawal');
    
    await user.type(input, '10');
    await user.click(submitButton);
    
    expect(screen.getByText('Minimum withdrawal is $20.00')).toBeInTheDocument();
    expect(mockOnWithdraw).not.toHaveBeenCalled();
  });

  it('should validate against available balance', async () => {
    const user = userEvent.setup();
    render(
      <WithdrawModal
        isOpen={true}
        onClose={mockOnClose}
        onWithdraw={mockOnWithdraw}
        availableBalance={100}
      />
    );
    
    const input = screen.getByLabelText('Withdrawal Amount');
    const submitButton = screen.getByText('Confirm Withdrawal');
    
    await user.type(input, '150');
    await user.click(submitButton);
    
    expect(screen.getByText('Insufficient balance. Available: $100.00')).toBeInTheDocument();
    expect(mockOnWithdraw).not.toHaveBeenCalled();
  });

  it('should require security confirmation', async () => {
    const user = userEvent.setup();
    render(
      <WithdrawModal
        isOpen={true}
        onClose={mockOnClose}
        onWithdraw={mockOnWithdraw}
        availableBalance={500}
        requireConfirmation={true}
      />
    );
    
    const input = screen.getByLabelText('Withdrawal Amount');
    await user.type(input, '100');
    
    // Should show confirmation step
    const continueButton = screen.getByText('Continue');
    await user.click(continueButton);
    
    expect(screen.getByText('Confirm Withdrawal')).toBeInTheDocument();
    expect(screen.getByText('You are about to withdraw $100.00')).toBeInTheDocument();
    
    // Confirm withdrawal
    const confirmButton = screen.getByText('Confirm');
    await user.click(confirmButton);
    
    await waitFor(() => {
      expect(mockOnWithdraw).toHaveBeenCalledWith({
        amount: 100,
        currency: 'USD',
        withdrawalMethod: 'bank'
      });
    });
  });

  it('should handle withdrawal with 2FA', async () => {
    const user = userEvent.setup();
    render(
      <WithdrawModal
        isOpen={true}
        onClose={mockOnClose}
        onWithdraw={mockOnWithdraw}
        availableBalance={500}
        require2FA={true}
      />
    );
    
    const amountInput = screen.getByLabelText('Withdrawal Amount');
    await user.type(amountInput, '100');
    
    const continueButton = screen.getByText('Continue');
    await user.click(continueButton);
    
    // Should show 2FA input
    expect(screen.getByLabelText('Enter 2FA Code')).toBeInTheDocument();
    
    const codeInput = screen.getByLabelText('Enter 2FA Code');
    await user.type(codeInput, '123456');
    
    const submitButton = screen.getByText('Confirm Withdrawal');
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(mockOnWithdraw).toHaveBeenCalledWith({
        amount: 100,
        currency: 'USD',
        withdrawalMethod: 'bank',
        twoFactorCode: '123456'
      });
    });
  });

  it('should show processing state', () => {
    render(
      <WithdrawModal
        isOpen={true}
        onClose={mockOnClose}
        onWithdraw={mockOnWithdraw}
        availableBalance={500}
        isProcessing={true}
      />
    );
    
    expect(screen.getByText('Processing withdrawal...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled();
  });

  it('should allow withdrawal method selection', async () => {
    const user = userEvent.setup();
    render(
      <WithdrawModal
        isOpen={true}
        onClose={mockOnClose}
        onWithdraw={mockOnWithdraw}
        availableBalance={500}
        withdrawalMethods={['bank', 'paypal', 'crypto']}
      />
    );
    
    const methodSelect = screen.getByLabelText('Withdrawal Method');
    await user.selectOptions(methodSelect, 'paypal');
    
    const amountInput = screen.getByLabelText('Withdrawal Amount');
    await user.type(amountInput, '100');
    
    const submitButton = screen.getByText('Confirm Withdrawal');
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(mockOnWithdraw).toHaveBeenCalledWith({
        amount: 100,
        currency: 'USD',
        withdrawalMethod: 'paypal'
      });
    });
  });

  it('should show withdrawal limits', () => {
    render(
      <WithdrawModal
        isOpen={true}
        onClose={mockOnClose}
        onWithdraw={mockOnWithdraw}
        availableBalance={500}
        minWithdrawal={10}
        maxWithdrawal={1000}
        dailyLimit={500}
        dailyWithdrawn={200}
      />
    );
    
    expect(screen.getByText('Daily limit: $300.00 remaining')).toBeInTheDocument();
    expect(screen.getByText('Min: $10.00 | Max: $1,000.00')).toBeInTheDocument();
  });

  it('should validate against daily limit', async () => {
    const user = userEvent.setup();
    render(
      <WithdrawModal
        isOpen={true}
        onClose={mockOnClose}
        onWithdraw={mockOnWithdraw}
        availableBalance={500}
        dailyLimit={500}
        dailyWithdrawn={400}
      />
    );
    
    const input = screen.getByLabelText('Withdrawal Amount');
    await user.type(input, '150');
    
    const submitButton = screen.getByText('Confirm Withdrawal');
    await user.click(submitButton);
    
    expect(screen.getByText('Exceeds daily limit. Remaining: $100.00')).toBeInTheDocument();
    expect(mockOnWithdraw).not.toHaveBeenCalled();
  });

  it('should show estimated arrival time', () => {
    render(
      <WithdrawModal
        isOpen={true}
        onClose={mockOnClose}
        onWithdraw={mockOnWithdraw}
        availableBalance={500}
        estimatedArrival={{
          bank: '3-5 business days',
          paypal: '1-2 business days',
          crypto: '30-60 minutes'
        }}
      />
    );
    
    expect(screen.getByText('Estimated arrival: 3-5 business days')).toBeInTheDocument();
  });
});