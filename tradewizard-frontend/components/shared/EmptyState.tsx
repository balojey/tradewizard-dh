import React from "react";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  title: string;
  message: string;
  icon?: LucideIcon;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

/**
 * EmptyState - Reusable component for displaying empty states
 * 
 * Displays a centered empty state message with optional icon and action button.
 * Used throughout the application to provide helpful guidance when no data is available.
 * 
 * @param title - The main heading for the empty state
 * @param message - Descriptive message explaining why the state is empty
 * @param icon - Optional Lucide icon component to display above the title
 * @param action - Optional action button with label and onClick handler
 * @param className - Optional additional CSS classes
 * 
 * Requirements: 15.4
 */
export default function EmptyState({ 
  title, 
  message, 
  icon: Icon,
  action,
  className = ""
}: EmptyStateProps) {
  return (
    <div className={`text-center py-8 ${className}`}>
      {Icon && (
        <div className="flex justify-center mb-4">
          <Icon className="h-12 w-12 text-gray-500" />
        </div>
      )}
      <h3 className="text-lg font-semibold mb-2 text-white">{title}</h3>
      <p className="text-gray-400 text-sm max-w-md mx-auto">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-6 px-6 py-2 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 hover:border-indigo-500/50 text-indigo-400 font-medium transition-all duration-200"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
