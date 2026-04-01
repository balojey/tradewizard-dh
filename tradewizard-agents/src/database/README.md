# Database Module - Supabase PostgreSQL Integration

This module provides Supabase PostgreSQL integration for the Automated Market Monitor, including connection management, TypeScript types, and retry logic.

## Features

- **Connection Management**: Automatic connection with retry logic and exponential backoff
- **Type Safety**: Full TypeScript support with types generated from Supabase schema
- **Health Checks**: Connection health monitoring
- **Retry Logic**: Configurable retry mechanism for database operations
- **Schema Migrations**: Managed via Supabase CLI
- **Agent Memory System**: Historical signal retrieval for closed-loop agent analysis

## Quick Links

- **[Memory System Configuration](./MEMORY_SYSTEM_CONFIG.md)** - Complete guide to the Agent Memory System
- **[Migration Guide](./MIGRATIONS.md)** - Database schema migration documentation
- **[Setup Guide](./SETUP.md)** - Initial database setup instructions

## Setup

### 1. Install Dependencies

```bash
npm install @supabase/supabase-js
```

### 2. Configure Environment Variables

Add the following to your `.env` file:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # Optional, for admin operations
```

### 3. Database Migrations

The database schema is managed using SQL migration files with a tracking system. See [MIGRATIONS.md](./MIGRATIONS.md) for complete documentation.

#### Quick Start:

```bash
# Check migration status
npm run migrate:status

# Push migrations to remote database (recommended)
npx supabase db push

# Or run migration tracking script
npm run migrate
```

#### Generate TypeScript types from remote schema:

```bash
npx supabase gen types typescript --linked > src/database/types.ts
```

#### Create a new migration:

```bash
# Generate timestamp
TIMESTAMP=$(date +%Y%m%d%H%M%S)

# Create migration file
touch supabase/migrations/${TIMESTAMP}_your_migration_name.sql
```

For detailed migration documentation, see:
- [MIGRATIONS.md](./MIGRATIONS.md) - Complete migration guide
- [supabase/migrations/README.md](../../supabase/migrations/README.md) - Quick reference

## Usage

### Basic Connection

```typescript
import { createSupabaseClientManager } from './database/index.js';

// Create client manager
const manager = createSupabaseClientManager();

// Connect to Supabase
await manager.connect();

// Get the typed client
const client = manager.getClient();

// Use the client with full type safety
const { data, error } = await client
  .from('markets')
  .select('*')
  .limit(10);

// Disconnect when done
await manager.disconnect();
```

### With Custom Retry Configuration

```typescript
import { SupabaseClientManager, loadSupabaseConfig } from './database/index.js';

const config = loadSupabaseConfig();
const manager = new SupabaseClientManager(config, {
  maxRetries: 5,
  baseDelayMs: 2000,
  maxDelayMs: 30000,
});

await manager.connect();
```

### Using TypeScript Types

```typescript
import type { Database, Tables, TablesInsert } from './database/index.js';

// Get row type for a table
type Market = Tables<'markets'>;

// Get insert type for a table
type NewMarket = TablesInsert<'markets'>;

// Use in your code
const newMarket: NewMarket = {
  condition_id: '123',
  question: 'Will X happen?',
  event_type: 'election',
  // TypeScript will enforce all required fields
};

const { data, error } = await client
  .from('markets')
  .insert(newMarket);
```

### Health Check

```typescript
const manager = createSupabaseClientManager();
await manager.connect();

// Check if connection is healthy
const isHealthy = await manager.healthCheck();
console.log('Database healthy:', isHealthy);
```

### Retry Wrapper

```typescript
const manager = createSupabaseClientManager();
await manager.connect();
const client = manager.getClient();

// Wrap any operation with retry logic
const result = await manager.withRetry(async () => {
  const { data, error } = await client
    .from('markets')
    .insert({ condition_id: '123', question: 'Test', event_type: 'election' });
  
  if (error) throw error;
  return data;
}, 'insert market');
```

### Agent Memory System

```typescript
import { createMemoryRetrievalService } from './memory-retrieval.js';

const manager = createSupabaseClientManager();
await manager.connect();

// Create memory retrieval service
const memoryService = createMemoryRetrievalService(manager);

// Get historical signals for an agent
const memory = await memoryService.getAgentMemory(
  'Market Microstructure Agent',
  '0x1234567890abcdef',
  3  // Retrieve last 3 signals
);

console.log('Has history:', memory.hasHistory);
console.log('Signals:', memory.historicalSignals);

// Get memory for all agents
const allMemories = await memoryService.getAllAgentMemories(
  '0x1234567890abcdef',
  ['Market Microstructure Agent', 'Risk Assessment Agent'],
  3
);

// Format memory context for agent prompts
import { formatMemoryContext } from '../utils/memory-formatter.js';

const formatted = formatMemoryContext(memory, {
  maxLength: 1000,
  dateFormat: 'human'
});

console.log('Formatted context:', formatted.text);
```

See [Memory System Configuration](./MEMORY_SYSTEM_CONFIG.md) for complete documentation.

## Database Schema

The schema is defined in `supabase/migrations/` and includes:

### markets
Stores prediction market information with fields for condition_id, question, description, event_type, market_probability, volume_24h, liquidity, status, and more.

### recommendations
Stores trade recommendations with direction, fair_probability, market_edge, confidence levels, entry/target zones, and explanations.

### agent_signals
Stores individual agent signals with agent_name, agent_type, fair_probability, confidence, direction, and key_drivers.

**Memory System Integration**: This table is used by the Agent Memory System to retrieve historical signals for closed-loop analysis. Agents query their previous signals before generating new analysis, enabling them to track evolution and explain changes in reasoning.

### analysis_history
Tracks analysis execution history with analysis_type, status, duration, cost, and agents_used.

### langgraph_checkpoints
Stores LangGraph workflow checkpoints for state persistence and recovery.

## Supabase CLI Commands

### Link to remote project:
```bash
npx supabase link --project-ref your-project-ref
```

### Check migration status:
```bash
npx supabase db diff
```

### Reset local database (development only):
```bash
npx supabase db reset
```

### Pull remote schema changes:
```bash
npx supabase db pull
```

## Error Handling

The module includes comprehensive error handling:

- **Connection Errors**: Automatic retry with exponential backoff
- **Query Errors**: Detailed error logging
- **Timeout Handling**: Configurable timeouts for operations

## Testing

Run the test suite:

```bash
npm test -- src/database/
```

Tests cover:
- Connection establishment and retry logic
- Configuration loading and validation
- Health checks
- Error handling

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_KEY` or `SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Service role key for admin operations |

### Retry Configuration

```typescript
interface RetryConfig {
  maxRetries: number;      // Maximum number of retry attempts (default: 3)
  baseDelayMs: number;     // Base delay between retries (default: 1000ms)
  maxDelayMs: number;      // Maximum delay between retries (default: 10000ms)
}
```

## Best Practices

1. **Always use retry logic** for production operations
2. **Check health** before critical operations
3. **Handle disconnections** gracefully
4. **Use service role key** only for admin operations
5. **Monitor connection status** in long-running services
6. **Close connections** when done to free resources
7. **Use TypeScript types** for type safety
8. **Manage schema via migrations** not manual SQL

## Troubleshooting

### Connection Fails

- Verify `SUPABASE_URL` and `SUPABASE_KEY` are correct
- Check network connectivity
- Ensure Supabase project is active
- Review Supabase dashboard for service status

### Type Generation Fails

- Ensure you're linked to the remote project: `npx supabase link`
- Check that migrations have been pushed: `npx supabase db push`
- Verify you have proper permissions

### Health Check Fails

- Check if tables are created (run migrations)
- Verify database connection
- Review Supabase logs for errors

## License

ISC
