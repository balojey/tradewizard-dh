import { ERROR_STYLES, BUTTON_BASE, BUTTON_VARIANTS } from "@/constants/ui";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { formatErrorForDisplay } from "@/utils/errorLogging";

interface ErrorStateProps {
  error: Error | string | unknown;
  title?: string;
  onRetry?: () => void;
  showRetry?: boolean;
}

/**
 * ErrorState - Display error messages with optional retry functionality
 * 
 * @param error - The error to display
 * @param title - Optional title for the error (defaults to "Error")
 * @param onRetry - Optional callback for retry button
 * @param showRetry - Whether to show retry button (defaults to true if onRetry provided)
 * 
 * @example
 * ```tsx
 * <ErrorState 
 *   error={error} 
 *   title="Failed to load data"
 *   onRetry={() => refetch()}
 * />
 * ```
 */
export default function ErrorState({
  error,
  title = "Error",
  onRetry,
  showRetry = !!onRetry,
}: ErrorStateProps) {
  const errorMessage = formatErrorForDisplay(error);

  return (
    <div className={ERROR_STYLES}>
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <AlertTriangle className="w-6 h-6 text-red-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-red-300 mb-2">{title}</h3>
          <p className="text-sm text-red-200/80">{errorMessage}</p>
          {showRetry && onRetry && (
            <button
              onClick={onRetry}
              className={`${BUTTON_BASE} ${BUTTON_VARIANTS.secondary} px-4 py-2 text-sm mt-4`}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
