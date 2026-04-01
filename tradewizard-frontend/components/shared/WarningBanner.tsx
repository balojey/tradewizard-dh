"use client";

import React from "react";
import { AlertTriangle, AlertCircle, Info, XCircle } from "lucide-react";

export type WarningType = "warning" | "error" | "info" | "critical";

interface WarningBannerProps {
  type?: WarningType;
  title: string;
  message: string;
  details?: string[];
  className?: string;
  onDismiss?: () => void;
}

/**
 * WarningBanner Component
 * 
 * Displays warning messages for incomplete data scenarios.
 * Used throughout the Performance components to inform users about
 * missing or incomplete data that affects calculations.
 * 
 * Requirements: 15.1, 15.2
 * 
 * @example
 * ```tsx
 * <WarningBanner
 *   type="warning"
 *   title="Incomplete Price Data"
 *   message="Historical price data is incomplete for this market."
 *   details={["Some performance metrics may be unavailable", "Charts may show gaps"]}
 * />
 * ```
 */
export default function WarningBanner({
  type = "warning",
  title,
  message,
  details,
  className = "",
  onDismiss,
}: WarningBannerProps) {
  const config = {
    warning: {
      icon: AlertTriangle,
      bgColor: "bg-yellow-500/10",
      borderColor: "border-yellow-500/20",
      iconColor: "text-yellow-400",
      titleColor: "text-yellow-300",
      textColor: "text-yellow-100/80",
    },
    error: {
      icon: XCircle,
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/20",
      iconColor: "text-red-400",
      titleColor: "text-red-300",
      textColor: "text-red-100/80",
    },
    info: {
      icon: Info,
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/20",
      iconColor: "text-blue-400",
      titleColor: "text-blue-300",
      textColor: "text-blue-100/80",
    },
    critical: {
      icon: AlertCircle,
      bgColor: "bg-red-500/20",
      borderColor: "border-red-500/30",
      iconColor: "text-red-400",
      titleColor: "text-red-200",
      textColor: "text-red-100/90",
    },
  }[type];

  const Icon = config.icon;

  return (
    <div
      className={`flex items-start gap-3 p-4 ${config.bgColor} border ${config.borderColor} rounded-lg ${className}`}
      role="alert"
      aria-live="polite"
    >
      <Icon className={`w-5 h-5 ${config.iconColor} flex-shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <div className={`font-semibold ${config.titleColor} mb-1`}>
          {title}
        </div>
        <p className={`text-sm ${config.textColor}`}>
          {message}
        </p>
        {details && details.length > 0 && (
          <ul className={`mt-2 space-y-1 text-sm ${config.textColor}`}>
            {details.map((detail, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-xs mt-0.5">•</span>
                <span>{detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className={`${config.iconColor} hover:opacity-70 transition-opacity flex-shrink-0`}
          aria-label="Dismiss warning"
        >
          <XCircle className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
