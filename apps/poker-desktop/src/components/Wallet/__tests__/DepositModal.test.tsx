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

  describe('Keyboard Navigation', () => {
    it('should close modal on Escape key', async () => {
      render(
        <DepositModal
          isOpen={true}
          onClose={mockOnClose}
          onDeposit={mockOnDeposit}
        />
      );
      
      fireEvent.keyDown(document, { key: 'Escape' });
      
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should navigate preset amounts with arrow keys', async () => {
      render(
        <DepositModal
          isOpen={true}
          onClose={mockOnClose}
          onDeposit={mockOnDeposit}
          presetAmounts={[25, 50, 100, 250]}
        />
      );
      
      // Focus first preset button
      const firstPreset = screen.getByText('$25');
      firstPreset.focus();
      expect(document.activeElement).toBe(firstPreset);
      
      // Arrow right to next preset
      fireEvent.keyDown(firstPreset, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(screen.getByText('$50'));
      
      // Arrow right again
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(screen.getByText('$100'));
      
      // Arrow left to go back
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
      expect(document.activeElement).toBe(screen.getByText('$50'));
    });

    it('should wrap around when navigating preset amounts', async () => {
      render(
        <DepositModal
          isOpen={true}
          onClose={mockOnClose}
          onDeposit={mockOnDeposit}
          presetAmounts={[25, 50, 100, 250]}
        />
      );
      
      // Focus last preset
      const lastPreset = screen.getByText('$250');
      lastPreset.focus();
      
      // Arrow right should wrap to first
      fireEvent.keyDown(lastPreset, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(screen.getByText('$25'));
      
      // Arrow left should wrap to last
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
      expect(document.activeElement).toBe(screen.getByText('$250'));
    });

    it('should select preset amount on Enter key', async () => {
      render(
        <DepositModal
          isOpen={true}
          onClose={mockOnClose}
          onDeposit={mockOnDeposit}
          presetAmounts={[25, 50, 100, 250]}
        />
      );
      
      const preset100 = screen.getByText('$100');
      preset100.focus();
      
      fireEvent.keyDown(preset100, { key: 'Enter' });
      
      const input = screen.getByLabelText('Deposit Amount');
      expect(input).toHaveValue(100);
    });

    it('should trap focus within modal', async () => {
      const user = userEvent.setup();
      render(
        <DepositModal
          isOpen={true}
          onClose={mockOnClose}
          onDeposit={mockOnDeposit}
        />
      );
      
      // Focus should be within modal
      const modalElement = screen.getByRole('dialog');
      expect(modalElement).toBeInTheDocument();
      
      // Tab through focusable elements
      await user.tab();
      expect(document.activeElement).toBeInTheDocument();
      expect(modalElement.contains(document.activeElement)).toBe(true);
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(
        <DepositModal
          isOpen={true}
          onClose={mockOnClose}
          onDeposit={mockOnDeposit}
        />
      );
      
      const modal = screen.getByRole('dialog');
      expect(modal).toHaveAttribute('aria-modal', 'true');
      expect(modal).toHaveAttribute('aria-labelledby', 'deposit-modal-title');
    });

    it('should have accessible preset buttons', () => {
      render(
        <DepositModal
          isOpen={true}
          onClose={mockOnClose}
          onDeposit={mockOnDeposit}
          presetAmounts={[25, 50, 100]}
        />
      );
      
      const preset25 = screen.getByLabelText('Select $25.00 deposit amount');
      expect(preset25).toBeInTheDocument();
    });

    it('should announce preset selection to screen readers', async () => {
      const user = userEvent.setup();
      render(
        <DepositModal
          isOpen={true}
          onClose={mockOnClose}
          onDeposit={mockOnDeposit}
          presetAmounts={[25, 50, 100]}
        />
      );
      
      const preset50 = screen.getByText('$50');
      await user.click(preset50);
      
      // Check for screen reader announcement
      await waitFor(() => {
        const announcer = document.querySelector('[role="status"][aria-live="polite"]');
        expect(announcer).toBeInTheDocument();
        expect(announcer).toHaveTextContent('Selected $50.00 deposit amount');
      });
    });

    it('should have focus indication on preset buttons', () => {
      render(
        <DepositModal
          isOpen={true}
          onClose={mockOnClose}
          onDeposit={mockOnDeposit}
          presetAmounts={[25, 50, 100]}
        />
      );
      
      const preset = screen.getByText('$25');
      preset.focus();
      
      // Should have focus ring class when focused
      expect(preset).toHaveClass('ring-2', 'ring-blue-500', 'ring-offset-2');
    });
  });

  describe('Skip Links', () => {
    it('should have skip links for keyboard navigation', () => {
      render(
        <DepositModal
          isOpen={true}
          onClose={mockOnClose}
          onDeposit={mockOnDeposit}
        />
      );
      
      // Skip links should be present but screen-reader only by default
      const skipToInput = screen.getByText('Skip to amount input');
      const skipToSubmit = screen.getByText('Skip to submit button');
      
      expect(skipToInput).toBeInTheDocument();
      expect(skipToSubmit).toBeInTheDocument();
      expect(skipToInput).toHaveClass('sr-only');
      expect(skipToSubmit).toHaveClass('sr-only');
    });

    it('should focus amount input when skip link is clicked', async () => {
      const user = userEvent.setup();
      render(
        <DepositModal
          isOpen={true}
          onClose={mockOnClose}
          onDeposit={mockOnDeposit}
        />
      );
      
      const skipToInput = screen.getByText('Skip to amount input');
      await user.click(skipToInput);
      
      const amountInput = screen.getByLabelText('Deposit Amount');
      expect(document.activeElement).toBe(amountInput);
    });

    it('should focus submit button when skip link is clicked', async () => {
      const user = userEvent.setup();
      render(
        <DepositModal
          isOpen={true}
          onClose={mockOnClose}
          onDeposit={mockOnDeposit}
        />
      );
      
      const skipToSubmit = screen.getByText('Skip to submit button');
      await user.click(skipToSubmit);
      
      const submitButton = screen.getByRole('button', { name: /deposit/i });
      expect(document.activeElement).toBe(submitButton);
    });
  });
});