# Database Persistence Layer

This module provides database persistence functionality for TradeWizard DOA, using the existing tradewizard-agents Supabase schema. It includes Supabase client management and data persistence with graceful fallback to in-memory storage.

## Components

### Database Types (`db_types.py`)

Python types matching the existing tradewizard-agents Supabase schema. These types are based on the TypeScript types from `tradewizard-frontend/lib/database.types.ts` and provide type-safe database operations.

**Key Types:**
- `MarketRow`, `MarketInsert`, `MarketUpdate` - Markets table
- `RecommendationRow`, `RecommendationInsert`, `RecommendationUpdate` - Recommendations table
- `AgentSignalRow`, `AgentSignalInsert` - Agent signals table
- `AnalysisHistoryRow`, `AnalysisHistoryInsert` - Analysis history table

### SupabaseClient (`supabase_client.py`)

Manages connections to Supabase/PostgreSQL with connection pooling and error handling.

**Features:**
- Supports both Supabase Cloud and local PostgreSQL connections
- Automatic connection management
- Health check functionality
- Context manager support for resource cleanup

**Usage:**
```python
from database import SupabaseClient, DatabaseConfig

config = DatabaseConfig(
    supabase_url="https://your-project.supabase.co",
    supabase_key="your-key",
    enable_persistence=True
)

# Initialize client
client = SupabaseClient(config)

# Check connection
if client.is_connected():
    print("Connected to database")

# Health check
result = await client.health_check()
if result.is_ok():
    print("Database is healthy")

# Use as context manager
with SupabaseClient(config) as client:
    # Use client
    pass
```

### PersistenceLayer (`persistence.py`)

Provides high-level data persistence operations with automatic fallback to in-memory storage on database errors.

**Features:**
- Save/load market data, agent signals, and recommendations
- Automatic fallback to in-memory storage on database failures
- Historical signal retrieval for memory context
- Complete analysis history tracking

**Usage:**
```python
from database import SupabaseClient, PersistenceLayer
from models.types import MarketBriefingDocument, AgentSignal

# Initialize
client = SupabaseClient(config)
persistence = PersistenceLayer(client)

# Save market data
result = await persistence.save_market_data(mbd)
if result.is_ok():
    print("Market data saved")

# Save agent signals
signals = [signal1, signal2, signal3]
result = await persistence.save_agent_signals(condition_id, signals)

# Retrieve historical signals for memory context
result = await persistence.get_historical_signals(
    condition_id="0xabc...",
    agent_name="market_microstructure",
    limit=3
)
if result.is_ok():
    historical_signals = result.unwrap()

# Save recommendation
result = await persistence.save_recommendation(recommendation)

# Check if in fallback mode
if persistence.is_fallback_mode():
    print("Using in-memory storage (database unavailable)")
```

## Database Schema

The database schema is defined in `tradewizard-agents/supabase/migrations/` and is shared between the TypeScript and Python implementations.

### Tables

1. **markets** - Market information and metadata
   - Primary key: `id` (UUID)
   - Unique: `condition_id` (Polymarket condition ID)
   - Stores question, event type, probabilities, volume, liquidity, status

2. **recommendations** - Trade recommendations from the Market Intelligence Engine
   - Primary key: `id` (UUID)
   - Foreign key: `market_id` → markets
   - Stores direction, probabilities, entry/target zones, confidence, explanation

3. **agent_signals** - Individual agent analysis outputs
   - Primary key: `id` (UUID)
   - Foreign keys: `market_id` → markets, `recommendation_id` → recommendations
   - Stores agent name/type, probabilities, confidence, direction, key drivers

4. **analysis_history** - Audit trail of analysis runs
   - Primary key: `id` (UUID)
   - Foreign key: `market_id` → markets
   - Stores analysis type, status, duration, cost, agents used, errors

5. **langgraph_checkpoints** - LangGraph workflow state persistence
   - Primary key: (`thread_id`, `checkpoint_id`)
   - Stores checkpoint data and metadata for workflow recovery

6. **recommendation_outcomes** - Performance tracking (optional)
   - Primary key: `id` (UUID)
   - Foreign keys: `market_id` → markets, `recommendation_id` → recommendations
   - Stores actual outcomes, correctness, ROI, edge captured

### Indexes

Performance indexes are created for:
- Market lookups by condition_id and status
- Agent signal queries by market_id, recommendation_id, and agent_name
- Recommendation filtering by market_id and created_at
- Analysis history queries by market_id and status

## Error Handling

The persistence layer implements graceful degradation:

1. **Database Unavailable**: Falls back to in-memory storage
2. **Connection Errors**: Logs error and uses in-memory cache
3. **Query Failures**: Returns structured error with details
4. **Validation Errors**: Caught and reported with context

All operations return `Result[T, str]` types for functional error handling:
- `Ok(value)` on success
- `Err(message)` on failure

## Configuration

Required environment variables:

```bash
# Supabase Cloud (preferred)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-key

# OR Direct PostgreSQL
POSTGRES_CONNECTION_STRING=postgresql://user:pass@host:5432/db

# Enable/disable persistence
ENABLE_PERSISTENCE=true
```

## Running Migrations

The database schema is managed in the tradewizard-agents project. To apply migrations:

```bash
# From tradewizard-agents directory
npm run migrate

# Or manually with Supabase CLI
cd tradewizard-agents
npx supabase db push
```

The DOA Python implementation uses the same database as tradewizard-agents, so no separate migrations are needed.

## Testing

Run the test suite:

```bash
# Run all database tests
pytest doa/database/test_persistence.py -v

# Run with coverage
pytest doa/database/test_persistence.py --cov=doa/database --cov-report=html
```

## Fallback Mode

When the database is unavailable, the persistence layer automatically switches to in-memory storage:

- All save operations succeed but store data in memory
- Historical queries return in-memory data
- Data is lost when the process terminates
- Useful for development and testing without database setup

Check fallback status:
```python
if persistence.is_fallback_mode():
    logger.warning("Running in fallback mode - data not persisted")
```

## Best Practices

1. **Always check Result types**: Use `.is_ok()` and `.is_err()` to handle errors
2. **Use context managers**: Ensure proper resource cleanup with `with` statements
3. **Monitor fallback mode**: Log warnings when database is unavailable
4. **Batch operations**: Save multiple signals at once for better performance
5. **Handle partial failures**: Agent failures shouldn't prevent data persistence
