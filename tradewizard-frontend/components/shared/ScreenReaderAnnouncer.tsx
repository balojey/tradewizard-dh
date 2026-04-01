"use client";

import React, { useEffect, useRef } from "react";

interface ScreenReaderAnnouncerProps {
  message: string;
  priority?: "polite" | "assertive";
  clearAfter?: number;
}

/**
 * ScreenReaderAnnouncer Component
 * 
 * Provides live region announcements for screen readers.
 * Used for dynamic content updates that need to be announced to users.
 * 
 * @param message - The message to announce
 * @param priority - "polite" (default) or "assertive" for urgent messages
 * @param clearAfter - Optional milliseconds to clear message after announcement
 * 
 * @example
 * ```tsx
 * <ScreenReaderAnnouncer 
 *   message="Market data updated" 
 *   priority="polite"
 *   clearAfter={3000}
 * />
 * ```
 */
export default function ScreenReaderAnnouncer({
  message,
  priority = "polite",
  clearAfter,
}: ScreenReaderAnnouncerProps) {
  const [currentMessage, setCurrentMessage] = React.useState(message);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    setCurrentMessage(message);

    if (clearAfter && message) {
      // Clear previous timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout to clear message
      timeoutRef.current = setTimeout(() => {
        setCurrentMessage("");
      }, clearAfter);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [message, clearAfter]);

  return (
    <div
      role="status"
      aria-live={priority}
      aria-atomic="true"
      className="sr-only"
    >
      {currentMessage}
    </div>
  );
}

/**
 * Hook for managing screen reader announcements
 * 
 * @example
 * ```tsx
 * const announce = useScreenReaderAnnouncement();
 * 
 * // Announce a message
 * announce("Data loaded successfully");
 * 
 * // Announce with priority
 * announce("Error occurred", "assertive");
 * ```
 */
export function useScreenReaderAnnouncement() {
  const [announcement, setAnnouncement] = React.useState<{
    message: string;
    priority: "polite" | "assertive";
  }>({ message: "", priority: "polite" });

  const announce = React.useCallback(
    (message: string, priority: "polite" | "assertive" = "polite") => {
      setAnnouncement({ message, priority });
      
      // Clear after announcement
      setTimeout(() => {
        setAnnouncement({ message: "", priority: "polite" });
      }, 100);
    },
    []
  );

  return { announce, announcement };
}
