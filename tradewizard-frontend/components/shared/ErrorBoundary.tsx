"use client";

import React, { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { ERROR_STYLES, BUTTON_BASE, BUTTON_VARIANTS } from "@/constants/ui";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  resetKeys?: Array<string | number>;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * ErrorBoundary - Catches React errors in child components
 * 
 * Provides a fallback UI when errors occur and allows recovery through reset.
 * Logs errors for debugging and can trigger custom error handlers.
 * 
 * @example
 * ```tsx
 * <ErrorBoundary fallback={<CustomErrorUI />}>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 * 
 * @example With reset keys
 * ```tsx
 * <ErrorBoundary resetKeys={[marketId]}>
 *   <MarketDetails marketId={marketId} />
 * </ErrorBoundary>
 * ```
 */
export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console
    console.error("ErrorBoundary caught an error:", error, errorInfo);

    // Update state with error info
    this.setState({
      errorInfo,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log to error tracking service (e.g., Sentry) if available
    if (typeof window !== "undefined" && (window as any).Sentry) {
      (window as any).Sentry.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
          },
        },
      });
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    // Reset error state when resetKeys change
    if (
      this.state.hasError &&
      this.props.resetKeys &&
      prevProps.resetKeys &&
      this.props.resetKeys.some(
        (key, index) => key !== prevProps.resetKeys?.[index]
      )
    ) {
      this.reset();
    }
  }

  reset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className={ERROR_STYLES}>
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-red-300 mb-2">
                Something went wrong
              </h3>
              <p className="text-sm text-red-200/80 mb-4">
                {this.state.error?.message ||
                  "An unexpected error occurred while rendering this component."}
              </p>
              {process.env.NODE_ENV === "development" &&
                this.state.errorInfo && (
                  <details className="mt-4 text-xs text-red-200/60">
                    <summary className="cursor-pointer hover:text-red-200/80 mb-2">
                      Error details (development only)
                    </summary>
                    <pre className="mt-2 p-3 bg-black/20 rounded overflow-auto max-h-48">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              <button
                onClick={this.reset}
                className={`${BUTTON_BASE} ${BUTTON_VARIANTS.secondary} px-4 py-2 text-sm mt-4`}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
