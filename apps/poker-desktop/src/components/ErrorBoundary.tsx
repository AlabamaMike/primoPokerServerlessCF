import React, { Component, ReactNode, ErrorInfo } from 'react';

interface ErrorReport {
  error: {
    message: string;
    stack?: string;
    name: string;
  };
  errorInfo: ErrorInfo;
  timestamp: Date;
  userAgent: string;
  url: string;
  componentStack?: string;
}

interface Props {
  children: ReactNode;
  fallback?: (error: Error, errorInfo: ErrorInfo) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  level?: 'page' | 'component' | 'app';
  enableReporting?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
  lastErrorTime: Date | null;
}

export class ErrorBoundary extends Component<Props, State> {
  private retryCount = 0;
  private readonly MAX_RETRIES = 3;
  private readonly ERROR_RESET_TIME = 30000; // 30 seconds

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
      lastErrorTime: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      errorInfo: null,
      lastErrorTime: new Date()
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError, enableReporting = true, level = 'component' } = this.props;
    
    console.error(`[ErrorBoundary-${level}] caught an error:`, error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
      errorCount: this.state.errorCount + 1
    });
    
    // Call custom error handler if provided
    onError?.(error, errorInfo);
    
    // Report error to service if enabled
    if (enableReporting) {
      this.reportError(error, errorInfo);
    }
    
    // Check if we should reset error count
    if (this.state.lastErrorTime) {
      const timeSinceLastError = Date.now() - this.state.lastErrorTime.getTime();
      if (timeSinceLastError > this.ERROR_RESET_TIME) {
        this.retryCount = 0;
      }
    }
  }

  private reportError(error: Error, errorInfo: ErrorInfo) {
    const errorReport: ErrorReport = {
      error: {
        message: error.message,
        stack: error.stack || '',
        name: error.name
      },
      errorInfo,
      timestamp: new Date(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      componentStack: errorInfo.componentStack
    };

    // Log to console in development
    if (import.meta.env.DEV) {
      console.log('Error Report:', errorReport);
    }

    // Store in localStorage for offline capability
    try {
      const errorKey = `error-report-${Date.now()}`;
      localStorage.setItem(errorKey, JSON.stringify(errorReport));
      
      // Clean up old errors (keep last 10)
      const errorKeys = Object.keys(localStorage)
        .filter(key => key.startsWith('error-report-'))
        .sort();
      
      if (errorKeys.length > 10) {
        errorKeys.slice(0, -10).forEach(key => localStorage.removeItem(key));
      }
    } catch (e) {
      console.error('Failed to store error report:', e);
    }
  }

  resetError = () => {
    this.retryCount++;
    if (this.retryCount <= this.MAX_RETRIES) {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null
      });
    } else {
      console.error('Max retry attempts reached');
    }
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.state.errorInfo!);
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
            <div className="text-center">
              <svg
                className="mx-auto h-12 w-12 text-red-500 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Oops! Something went wrong
              </h1>
              
              <p className="text-gray-600 mb-4">
                We encountered an unexpected error. Please try refreshing the page.
              </p>
              
              {import.meta.env.DEV && (
                <details className="text-left mb-4">
                  <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                    Error details (development only)
                  </summary>
                  <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
                    {this.state.error.toString()}
                    {this.state.errorInfo && this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
              
              {this.retryCount < this.MAX_RETRIES ? (
                <>
                  <button
                    onClick={this.resetError}
                    className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded transition-colors"
                  >
                    Try Again
                  </button>
                  {this.retryCount > 0 && (
                    <p className="text-xs text-gray-500 mt-2">
                      Retry attempt {this.retryCount} of {this.MAX_RETRIES}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-500 mt-4">
                  Please refresh the page to continue
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: (error: Error, errorInfo: ErrorInfo) => ReactNode,
  onError?: (error: Error, errorInfo: ErrorInfo) => void
) {
  return (props: P) => (
    <ErrorBoundary fallback={fallback} onError={onError}>
      <Component {...props} />
    </ErrorBoundary>
  );
}