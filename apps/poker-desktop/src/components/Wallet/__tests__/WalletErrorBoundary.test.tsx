import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WalletErrorBoundary, withWalletErrorBoundary } from '../WalletErrorBoundary';
import { logger } from '../../../utils/logger';

// Mock the logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    error: jest.fn()
  }
}));

// Component that throws an error
const ErrorComponent: React.FC<{ shouldThrow: boolean }> = ({ shouldThrow }) => {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div>No error</div>;
};

// Component with network error
const NetworkErrorComponent: React.FC<{ shouldThrow: boolean }> = ({ shouldThrow }) => {
  if (shouldThrow) {
    throw new Error('Failed to fetch wallet data');
  }
  return <div>No error</div>;
};

// Component with balance error
const BalanceErrorComponent: React.FC<{ shouldThrow: boolean }> = ({ shouldThrow }) => {
  if (shouldThrow) {
    throw new Error('Insufficient funds for transaction');
  }
  return <div>No error</div>;
};

describe('WalletErrorBoundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress console.error for error boundary tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should render children when there is no error', () => {
    render(
      <WalletErrorBoundary>
        <ErrorComponent shouldThrow={false} />
      </WalletErrorBoundary>
    );
    
    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  it('should render error fallback when error occurs', () => {
    render(
      <WalletErrorBoundary>
        <ErrorComponent shouldThrow={true} />
      </WalletErrorBoundary>
    );
    
    expect(screen.getByText('Wallet Error')).toBeInTheDocument();
    expect(screen.getByText('An unexpected error occurred with your wallet. Please try again.')).toBeInTheDocument();
  });

  it('should log error when error occurs', () => {
    render(
      <WalletErrorBoundary>
        <ErrorComponent shouldThrow={true} />
      </WalletErrorBoundary>
    );
    
    expect(logger.error).toHaveBeenCalledWith(
      'Wallet component error:',
      expect.objectContaining({
        error: 'Error: Test error message',
        componentStack: expect.any(String),
        timestamp: expect.any(String)
      })
    );
  });

  it('should detect and display network errors', () => {
    render(
      <WalletErrorBoundary>
        <NetworkErrorComponent shouldThrow={true} />
      </WalletErrorBoundary>
    );
    
    expect(screen.getByText('Connection Error')).toBeInTheDocument();
    expect(screen.getByText('Unable to connect to the wallet service. Please check your connection and try again.')).toBeInTheDocument();
  });

  it('should detect and display balance errors', () => {
    render(
      <WalletErrorBoundary>
        <BalanceErrorComponent shouldThrow={true} />
      </WalletErrorBoundary>
    );
    
    expect(screen.getByText('Transaction Error')).toBeInTheDocument();
    expect(screen.getByText('There was an issue processing your transaction. Please verify your balance and try again.')).toBeInTheDocument();
  });

  it('should show refresh button for network errors', () => {
    render(
      <WalletErrorBoundary>
        <NetworkErrorComponent shouldThrow={true} />
      </WalletErrorBoundary>
    );
    
    const refreshButton = screen.getByLabelText('Refresh the page');
    expect(refreshButton).toBeInTheDocument();
  });

  it('should reset error state when try again is clicked', () => {
    const { rerender } = render(
      <WalletErrorBoundary>
        <ErrorComponent shouldThrow={true} />
      </WalletErrorBoundary>
    );
    
    // Error is shown
    expect(screen.getByText('Wallet Error')).toBeInTheDocument();
    
    // Click try again
    const tryAgainButton = screen.getByLabelText('Retry the failed operation');
    fireEvent.click(tryAgainButton);
    
    // Rerender with no error
    rerender(
      <WalletErrorBoundary>
        <ErrorComponent shouldThrow={false} />
      </WalletErrorBoundary>
    );
    
    // Should show normal content
    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  it('should show error details in development mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    
    render(
      <WalletErrorBoundary>
        <ErrorComponent shouldThrow={true} />
      </WalletErrorBoundary>
    );
    
    expect(screen.getByText('Error details')).toBeInTheDocument();
    expect(screen.getByText(/Error: Test error message/)).toBeInTheDocument();
    
    process.env.NODE_ENV = originalEnv;
  });

  it('should not show error details in production mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    
    render(
      <WalletErrorBoundary>
        <ErrorComponent shouldThrow={true} />
      </WalletErrorBoundary>
    );
    
    expect(screen.queryByText('Error details')).not.toBeInTheDocument();
    
    process.env.NODE_ENV = originalEnv;
  });

  describe('Enhanced network error detection', () => {
    const networkErrorCases = [
      { error: new Error('network error'), expected: 'Connection Error' },
      { error: new Error('Failed to fetch'), expected: 'Connection Error' },
      { error: new Error('NetworkError'), expected: 'Connection Error' },
      { error: new Error('Request timeout'), expected: 'Connection Error' },
      { error: new Error('Device is offline'), expected: 'Connection Error' },
      { error: Object.assign(new Error('TypeError'), { name: 'NetworkError' }), expected: 'Connection Error' },
      { error: Object.assign(new Error('fetch failed'), { name: 'TypeError' }), expected: 'Connection Error' },
      { error: Object.assign(new Error('Connection failed'), { code: 'ERR_NETWORK' }), expected: 'Connection Error' },
      { error: Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED' }), expected: 'Connection Error' }
    ];

    networkErrorCases.forEach(({ error, expected }) => {
      it(`should detect "${error.message}" as network error`, () => {
        const NetworkTestComponent = () => {
          throw error;
        };

        render(
          <WalletErrorBoundary>
            <NetworkTestComponent />
          </WalletErrorBoundary>
        );
        
        expect(screen.getByText(expected)).toBeInTheDocument();
      });
    });
  });
});

describe('withWalletErrorBoundary HOC', () => {
  const TestComponent: React.FC = () => <div>Test Component</div>;
  const ErrorTestComponent: React.FC<{ shouldThrow: boolean }> = ({ shouldThrow }) => {
    if (shouldThrow) {
      throw new Error('HOC test error');
    }
    return <div>Test Component</div>;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should wrap component with error boundary', () => {
    const WrappedComponent = withWalletErrorBoundary(TestComponent);
    render(<WrappedComponent />);
    
    expect(screen.getByText('Test Component')).toBeInTheDocument();
  });

  it('should handle errors in wrapped component', () => {
    const WrappedComponent = withWalletErrorBoundary(ErrorTestComponent);
    render(<WrappedComponent shouldThrow={true} />);
    
    expect(screen.getByText('Wallet Error')).toBeInTheDocument();
  });

  it('should pass props to wrapped component', () => {
    const PropsTestComponent: React.FC<{ message: string }> = ({ message }) => (
      <div>{message}</div>
    );
    
    const WrappedComponent = withWalletErrorBoundary(PropsTestComponent);
    render(<WrappedComponent message="Props passed correctly" />);
    
    expect(screen.getByText('Props passed correctly')).toBeInTheDocument();
  });
});