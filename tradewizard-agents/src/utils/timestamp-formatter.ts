/**
 * Timestamp Formatter Utility
 * 
 * Converts ISO 8601 timestamps to human-readable formats for AI agent consumption.
 * Supports both relative time (e.g., "2 hours ago") and absolute time (e.g., "January 15, 2024 at 3:30 PM EST").
 */

import { parseISO, formatDistanceToNow, format, isValid } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

/**
 * Options for timestamp formatting
 */
export interface TimestampFormatOptions {
  /**
   * Timezone for absolute time formatting
   * @default 'America/New_York'
   */
  timezone?: string;
  
  /**
   * Threshold in days for switching from relative to absolute time
   * @default 7
   */
  relativeThresholdDays?: number;
  
  /**
   * Reference time for relative calculations (defaults to now)
   */
  referenceTime?: Date;
}

/**
 * Format result with metadata
 */
export interface FormattedTimestamp {
  /**
   * Human-readable timestamp string
   */
  formatted: string;
  
  /**
   * Whether relative or absolute format was used
   */
  formatType: 'relative' | 'absolute' | 'fallback';
  
  /**
   * Original ISO 8601 timestamp (for debugging)
   */
  original: string;
}

/**
 * Configuration interface for timestamp formatting
 */
export interface TimestampFormatterConfig {
  /**
   * Enable/disable human-readable timestamp formatting
   * @default true
   */
  enabled: boolean;
  
  /**
   * Timezone for absolute time formatting
   * @default 'America/New_York'
   */
  timezone: string;
  
  /**
   * Threshold in days for switching from relative to absolute time
   * @default 7
   */
  relativeThresholdDays: number;
}

/**
 * Default configuration
 */
const DEFAULT_TIMEZONE = 'America/New_York';
const DEFAULT_THRESHOLD_DAYS = 7;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: TimestampFormatterConfig = {
  enabled: true,
  timezone: DEFAULT_TIMEZONE,
  relativeThresholdDays: DEFAULT_THRESHOLD_DAYS,
};

/**
 * Global configuration (can be overridden at runtime)
 */
let globalConfig: TimestampFormatterConfig = { ...DEFAULT_CONFIG };

/**
 * Load configuration from environment variables
 */
function loadConfigFromEnv(): TimestampFormatterConfig {
  return {
    enabled: process.env.ENABLE_HUMAN_READABLE_TIMESTAMPS !== 'false',
    timezone: process.env.TIMESTAMP_TIMEZONE || DEFAULT_TIMEZONE,
    relativeThresholdDays: parseInt(
      process.env.RELATIVE_TIME_THRESHOLD_DAYS || String(DEFAULT_THRESHOLD_DAYS),
      10
    ),
  };
}

/**
 * Initialize global configuration from environment variables
 */
function initializeConfig(): void {
  globalConfig = loadConfigFromEnv();
}

/**
 * Get current global configuration
 * 
 * Returns a readonly copy of the current configuration.
 * Useful for debugging or checking current settings.
 * 
 * @returns Readonly copy of current configuration
 * 
 * @example
 * const config = getConfig();
 * console.log(`Formatting enabled: ${config.enabled}`);
 * console.log(`Timezone: ${config.timezone}`);
 * console.log(`Threshold: ${config.relativeThresholdDays} days`);
 */
export function getConfig(): Readonly<TimestampFormatterConfig> {
  return { ...globalConfig };
}

/**
 * Set global configuration (for runtime override)
 * 
 * This function allows you to override the default configuration at runtime.
 * Useful for testing, feature flags, or dynamic configuration changes.
 * 
 * @param config - Partial configuration to merge with current config
 * 
 * @example
 * // Disable formatting globally (fallback to ISO 8601)
 * setConfig({ enabled: false });
 * 
 * @example
 * // Change timezone to Pacific Time
 * setConfig({ timezone: 'America/Los_Angeles' });
 * 
 * @example
 * // Adjust relative time threshold to 14 days
 * setConfig({ relativeThresholdDays: 14 });
 * 
 * @example
 * // Multiple options at once
 * setConfig({
 *   enabled: true,
 *   timezone: 'America/Chicago',
 *   relativeThresholdDays: 3
 * });
 */
export function setConfig(config: Partial<TimestampFormatterConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Reset configuration to defaults from environment variables
 * 
 * Reloads configuration from environment variables, discarding any runtime overrides.
 * Useful for testing or resetting to known state.
 * 
 * Environment variables:
 * - ENABLE_HUMAN_READABLE_TIMESTAMPS: 'true' or 'false' (default: 'true')
 * - TIMESTAMP_TIMEZONE: IANA timezone name (default: 'America/New_York')
 * - RELATIVE_TIME_THRESHOLD_DAYS: Number of days (default: '7')
 * 
 * @example
 * // After runtime overrides, reset to environment defaults
 * setConfig({ timezone: 'America/Los_Angeles' });
 * resetConfig(); // Back to America/New_York (from env)
 */
export function resetConfig(): void {
  initializeConfig();
}

// Initialize configuration on module load
initializeConfig();

/**
 * Parse timestamp input to Date object
 */
function parseTimestamp(timestamp: string | number): Date | null {
  try {
    if (typeof timestamp === 'number') {
      return new Date(timestamp);
    }
    return parseISO(timestamp);
  } catch {
    return null;
  }
}

/**
 * Format timestamp as relative time (e.g., "2 hours ago")
 * 
 * Converts timestamps to human-readable relative time strings.
 * Uses natural language for recent events.
 * 
 * Time ranges:
 * - < 1 minute: "just now"
 * - 1-59 minutes: "X minutes ago"
 * - 1-23 hours: "X hours ago"
 * - 1-6 days: "X days ago"
 * - 7+ days: Falls back to formatDistanceToNow
 * 
 * @param isoTimestamp - ISO 8601 timestamp string or Unix timestamp number
 * @param referenceTime - Reference time for calculation (defaults to now)
 * @returns Relative time string
 * 
 * @example
 * // Recent timestamps
 * formatRelativeTime('2024-01-15T15:30:00Z') // => 'just now'
 * formatRelativeTime('2024-01-15T15:25:00Z') // => '5 minutes ago'
 * formatRelativeTime('2024-01-15T13:30:00Z') // => '2 hours ago'
 * formatRelativeTime('2024-01-12T15:30:00Z') // => '3 days ago'
 * 
 * @example
 * // With custom reference time
 * const refTime = new Date('2024-01-15T15:30:00Z');
 * formatRelativeTime('2024-01-15T15:00:00Z', refTime) // => '30 minutes ago'
 * 
 * @example
 * // Unix timestamp (milliseconds)
 * formatRelativeTime(1705330200000) // => '2 hours ago'
 */
export function formatRelativeTime(
  isoTimestamp: string | number,
  referenceTime?: Date
): string {
  const date = parseTimestamp(isoTimestamp);
  
  if (!date || !isValid(date)) {
    return 'invalid timestamp';
  }

  const reference = referenceTime || new Date();
  const diffMs = reference.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Less than 1 minute
  if (diffMinutes < 1) {
    return 'just now';
  }

  // 1-59 minutes
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }

  // 1-23 hours
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  // 1-6 days
  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }

  // Fallback to formatDistanceToNow for consistency
  return formatDistanceToNow(date, { addSuffix: true });
}

/**
 * Format timestamp as absolute time (e.g., "January 15, 2024 at 3:30 PM EST")
 * 
 * Converts timestamps to human-readable absolute time strings with timezone.
 * Uses 12-hour clock format with full month names.
 * 
 * Format pattern: "Month Day, Year at Hour:Minute AM/PM Timezone"
 * - Month: Full name (January, February, etc.)
 * - Day: Without leading zero (1, 15, 31)
 * - Year: Full year (2024)
 * - Hour: 12-hour format without leading zero (1-12)
 * - Minute: With leading zero (00-59)
 * - AM/PM: Uppercase
 * - Timezone: Abbreviation (EST, EDT, PST, PDT, etc.)
 * 
 * @param isoTimestamp - ISO 8601 timestamp string or Unix timestamp number
 * @param timezone - IANA timezone name (defaults to America/New_York)
 * @returns Absolute time string with timezone
 * 
 * @example
 * // Eastern Time (default)
 * formatAbsoluteTime('2024-01-15T20:30:00Z')
 * // => 'January 15, 2024 at 3:30 PM EST'
 * 
 * @example
 * // During Daylight Saving Time
 * formatAbsoluteTime('2024-07-15T19:30:00Z')
 * // => 'July 15, 2024 at 3:30 PM EDT'
 * 
 * @example
 * // Pacific Time
 * formatAbsoluteTime('2024-01-15T20:30:00Z', 'America/Los_Angeles')
 * // => 'January 15, 2024 at 12:30 PM PST'
 * 
 * @example
 * // Unix timestamp
 * formatAbsoluteTime(1705349400000)
 * // => 'January 15, 2024 at 3:30 PM EST'
 * 
 * @example
 * // Fallback to UTC on timezone error
 * formatAbsoluteTime('2024-01-15T15:30:00Z', 'Invalid/Timezone')
 * // => 'January 15, 2024 at 3:30 PM (UTC)'
 */
export function formatAbsoluteTime(
  isoTimestamp: string | number,
  timezone: string = DEFAULT_TIMEZONE
): string {
  const date = parseTimestamp(isoTimestamp);
  
  if (!date || !isValid(date)) {
    return 'invalid timestamp';
  }

  try {
    // Format: "MMMM d, yyyy 'at' h:mm a zzz"
    // MMMM = full month name (January)
    // d = day without leading zero
    // yyyy = full year
    // h = 12-hour format without leading zero
    // mm = minutes with leading zero
    // a = AM/PM
    // zzz = timezone abbreviation (EST/EDT)
    const formatted = formatInTimeZone(
      date,
      timezone,
      "MMMM d, yyyy 'at' h:mm a zzz"
    );
    
    return formatted;
  } catch (error) {
    // Fallback to UTC if timezone conversion fails
    console.warn('Timezone conversion failed, falling back to UTC', { error });
    return format(date, "MMMM d, yyyy 'at' h:mm a") + ' (UTC)';
  }
}

/**
 * Main formatting function - automatically chooses relative or absolute format
 * 
 * This is the primary function for timestamp formatting. It automatically selects
 * between relative and absolute formats based on the timestamp age and threshold.
 * 
 * Selection Logic:
 * - Age < threshold (default 7 days): Relative format ("2 hours ago")
 * - Age >= threshold: Absolute format ("January 15, 2024 at 3:30 PM EST")
 * - Null/undefined: "unknown time"
 * - Invalid format: "invalid timestamp"
 * - Formatting disabled: Returns ISO 8601 format
 * 
 * @param isoTimestamp - ISO 8601 timestamp string, Unix timestamp number, or null/undefined
 * @param options - Formatting options (overrides global config)
 * @returns Formatted timestamp with metadata
 * 
 * @example
 * // Recent timestamp (< 7 days) - uses relative format
 * formatTimestamp('2024-01-15T15:30:00Z')
 * // => { formatted: '2 hours ago', formatType: 'relative', original: '2024-01-15T15:30:00Z' }
 * 
 * @example
 * // Older timestamp (>= 7 days) - uses absolute format
 * formatTimestamp('2024-01-01T15:30:00Z')
 * // => { formatted: 'January 1, 2024 at 3:30 PM EST', formatType: 'absolute', original: '2024-01-01T15:30:00Z' }
 * 
 * @example
 * // Null timestamp
 * formatTimestamp(null)
 * // => { formatted: 'unknown time', formatType: 'fallback', original: 'null' }
 * 
 * @example
 * // Invalid timestamp
 * formatTimestamp('not-a-date')
 * // => { formatted: 'invalid timestamp', formatType: 'fallback', original: 'not-a-date' }
 * 
 * @example
 * // With custom options
 * formatTimestamp('2024-01-15T15:30:00Z', {
 *   timezone: 'America/Los_Angeles',
 *   relativeThresholdDays: 14
 * })
 * 
 * @example
 * // Unix timestamp (milliseconds)
 * formatTimestamp(1705330200000)
 * // => { formatted: '2 hours ago', formatType: 'relative', original: '1705330200000' }
 * 
 * @example
 * // When formatting is disabled globally
 * setConfig({ enabled: false });
 * formatTimestamp('2024-01-15T15:30:00Z')
 * // => { formatted: '2024-01-15T15:30:00.000Z', formatType: 'fallback', original: '2024-01-15T15:30:00Z' }
 */
export function formatTimestamp(
  isoTimestamp: string | number | null | undefined,
  options?: TimestampFormatOptions
): FormattedTimestamp {
  // Handle null/undefined
  if (isoTimestamp === null || isoTimestamp === undefined) {
    return {
      formatted: 'unknown time',
      formatType: 'fallback',
      original: String(isoTimestamp),
    };
  }

  const originalStr = String(isoTimestamp);
  const date = parseTimestamp(isoTimestamp);

  // Handle invalid timestamps
  if (!date || !isValid(date)) {
    return {
      formatted: 'invalid timestamp',
      formatType: 'fallback',
      original: originalStr,
    };
  }

  // Check if formatting is disabled globally
  if (!globalConfig.enabled) {
    // Return ISO 8601 format when disabled
    return {
      formatted: date.toISOString(),
      formatType: 'fallback',
      original: originalStr,
    };
  }

  // Merge options with global config
  const timezone = options?.timezone || globalConfig.timezone;
  const thresholdDays = options?.relativeThresholdDays ?? globalConfig.relativeThresholdDays;
  const referenceTime = options?.referenceTime || new Date();

  // Calculate age in days
  const diffMs = referenceTime.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  // Use relative format for recent timestamps (< threshold)
  if (diffDays < thresholdDays && diffDays >= 0) {
    return {
      formatted: formatRelativeTime(isoTimestamp, referenceTime),
      formatType: 'relative',
      original: originalStr,
    };
  }

  // Use absolute format for older timestamps
  return {
    formatted: formatAbsoluteTime(isoTimestamp, timezone),
    formatType: 'absolute',
    original: originalStr,
  };
}

/**
 * Batch format multiple timestamps efficiently
 * 
 * Formats multiple timestamps in a single call. More efficient than calling
 * formatTimestamp repeatedly when processing arrays of timestamps.
 * 
 * @param timestamps - Array of ISO 8601 timestamps, Unix timestamps, or null/undefined values
 * @param options - Formatting options applied to all timestamps
 * @returns Array of formatted timestamps with metadata
 * 
 * @example
 * // Format multiple timestamps
 * const timestamps = [
 *   '2024-01-15T15:30:00Z',
 *   '2024-01-01T12:00:00Z',
 *   null,
 *   1705330200000
 * ];
 * const formatted = formatTimestampBatch(timestamps);
 * // => [
 * //   { formatted: '2 hours ago', formatType: 'relative', ... },
 * //   { formatted: 'January 1, 2024 at 12:00 PM EST', formatType: 'absolute', ... },
 * //   { formatted: 'unknown time', formatType: 'fallback', ... },
 * //   { formatted: '2 hours ago', formatType: 'relative', ... }
 * // ]
 * 
 * @example
 * // With custom options
 * formatTimestampBatch(timestamps, {
 *   timezone: 'America/Chicago',
 *   relativeThresholdDays: 3
 * })
 */
export function formatTimestampBatch(
  timestamps: Array<string | number | null | undefined>,
  options?: TimestampFormatOptions
): FormattedTimestamp[] {
  return timestamps.map(timestamp => formatTimestamp(timestamp, options));
}
