# Human-Readable Timestamp Formatting

## Overview

The timestamp formatting system converts ISO 8601 timestamps to human-readable formats for AI agent consumption. This improves agent understanding of temporal context without requiring parsing overhead.

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Enable/disable human-readable timestamp formatting
ENABLE_HUMAN_READABLE_TIMESTAMPS=true

# Timezone for absolute timestamp formatting (default: America/New_York)
TIMESTAMP_TIMEZONE=America/New_York

# Threshold in days for relative vs absolute format (default: 7)
RELATIVE_TIME_THRESHOLD_DAYS=7
```

### Runtime Configuration

You can also configure the formatter at runtime:

```typescript
import { setConfig, getConfig, resetConfig } from './utils/timestamp-formatter.js';

// Get current configuration
const config = getConfig();
console.log(config);
// { enabled: true, timezone: 'America/New_York', relativeThresholdDays: 7 }

// Update configuration
setConfig({ enabled: false }); // Disable formatting
setConfig({ timezone: 'America/Los_Angeles' }); // Change timezone
setConfig({ relativeThresholdDays: 14 }); // Change threshold

// Reset to environment defaults
resetConfig();
```

## Feature Flag for Gradual Rollout

The system supports gradual rollout through the `ENABLE_HUMAN_READABLE_TIMESTAMPS` flag:

### Enabled (Default)
```typescript
// ENABLE_HUMAN_READABLE_TIMESTAMPS=true
formatTimestamp('2024-01-15T15:30:00Z')
// => { formatted: '2 hours ago', formatType: 'relative', ... }
```

### Disabled (Fallback to ISO 8601)
```typescript
// ENABLE_HUMAN_READABLE_TIMESTAMPS=false
formatTimestamp('2024-01-15T15:30:00Z')
// => { formatted: '2024-01-15T15:30:00.000Z', formatType: 'fallback', ... }
```

### Deployment Strategy

1. **Phase 1**: Deploy with `ENABLE_HUMAN_READABLE_TIMESTAMPS=false`
   - No impact on existing behavior
   - Code is deployed but inactive

2. **Phase 2**: Enable for 10% of requests
   - Use runtime configuration to enable for subset of users
   - Monitor for errors and performance impact

3. **Phase 3**: Gradually increase to 100%
   - Increase percentage based on monitoring results
   - Full rollout when stable

4. **Rollback**: Set `ENABLE_HUMAN_READABLE_TIMESTAMPS=false`
   - Instant rollback to ISO 8601 format
   - No data loss or corruption

## Usage

### Basic Usage

```typescript
import { formatTimestamp } from './utils/timestamp-formatter.js';

// Automatic format selection (relative or absolute)
const result = formatTimestamp('2024-01-15T15:30:00Z');
console.log(result.formatted); // "2 hours ago" or "January 15, 2024 at 3:30 PM EST"
```

### Agent Context Formatting

```typescript
import { formatMarketContextForAgent } from './utils/agent-context-formatter.js';

// Format complete market context with human-readable timestamps
const context = formatMarketContextForAgent(state, 'NewsAgent');
// All timestamps in the context are automatically formatted
```

### Check if Formatting is Enabled

```typescript
import { isTimestampFormattingEnabled } from './utils/agent-context-formatter.js';

if (isTimestampFormattingEnabled()) {
  console.log('Human-readable formatting is active');
} else {
  console.log('Using ISO 8601 format');
}
```

## Format Examples

### Relative Time (< 7 days old)
- `just now` - Less than 1 minute
- `5 minutes ago` - 1-59 minutes
- `2 hours ago` - 1-23 hours
- `3 days ago` - 1-6 days

### Absolute Time (≥ 7 days old)
- `January 15, 2024 at 3:30 PM EST`
- `December 25, 2023 at 11:59 PM EST`
- `March 10, 2024 at 9:00 AM EDT` (DST aware)

### Fallback Cases
- `unknown time` - Null or undefined timestamp
- `invalid timestamp` - Malformed timestamp
- `2024-01-15T15:30:00.000Z (UTC)` - Timezone conversion failure

## Backward Compatibility

The system maintains full backward compatibility:

- **State Management**: Timestamps in LangGraph state remain in ISO 8601 format
- **Database**: All persisted timestamps remain in ISO 8601 format
- **API Contracts**: No changes to data structures or API responses
- **Existing Code**: Code that reads timestamps from state continues to work

Formatting only happens at the boundary when constructing agent prompts.

## Performance

- Single timestamp formatting: < 1ms
- Batch formatting (100 timestamps): < 50ms
- Agent context formatting: < 10ms total overhead
- Timezone rules are automatically cached by date-fns-tz

## Testing

Run the test suite:

```bash
# Unit tests
npm test -- src/utils/timestamp-formatter.test.ts --run

# Configuration tests
npm test -- src/utils/timestamp-formatter-config.test.ts --run

# All timestamp-related tests
npm test -- src/utils/timestamp --run
```

## Troubleshooting

### Timestamps still showing ISO 8601 format

Check your configuration:
```typescript
import { getConfig } from './utils/timestamp-formatter.js';
console.log(getConfig());
```

Ensure `ENABLE_HUMAN_READABLE_TIMESTAMPS=true` in your `.env` file.

### Timezone not correct

Set the correct timezone:
```bash
TIMESTAMP_TIMEZONE=America/New_York  # Eastern Time
TIMESTAMP_TIMEZONE=America/Los_Angeles  # Pacific Time
TIMESTAMP_TIMEZONE=UTC  # Universal Time
```

### Relative time threshold not working

Adjust the threshold:
```bash
RELATIVE_TIME_THRESHOLD_DAYS=14  # Use relative format for up to 14 days
```

## Related Files

- `src/utils/timestamp-formatter.ts` - Core formatting utility
- `src/utils/agent-context-formatter.ts` - Agent context formatting
- `src/utils/timestamp-formatter.test.ts` - Unit tests
- `src/utils/timestamp-formatter-config.test.ts` - Configuration tests
- `.env` - Environment configuration
- `.env.example` - Configuration template
