# TradeWizard Supabase Database

This directory contains all database-related files for the TradeWizard Automated Market Monitor, including schema migrations, monitoring queries, and configuration.

## Directory Structure

```
supabase/
├── migrations/              # Database schema migrations
│   ├── 20260115162601_migration_tracking.sql
│   ├── 20260115162602_initial_schema.sql
│   └── README.md
├── monitoring-queries.sql   # Dashboard and monitoring views
├── DASHBOARD_SETUP.md      # Dashboard setup guide
├── config.toml             # Supabase local configuration
└── README.md               # This file
```

## Quick Start

### 1. Set Up Local Supabase

```bash
# Start local Supabase instance
supabase start

# Apply migrations
supabase db push

# Install monitoring queries
supabase db execute -f supabase/monitoring-queries.sql
```

### 2. Connect to Production

```bash
# Link to your Supabase project
supabase link --project-ref your-project-ref

# Push migrations to production
supabase db push

# Install monitoring queries
supabase db execute -f supabase/monitoring-queries.sql
```

### 3. Verify Setup

```bash
# Check migration status
npm run migrate:status

# Test a monitoring query
psql "your-connection-string" -c "SELECT * FROM v_market_analysis_summary;"
```

## Database Schema

### Core Tables

| Table | Description | Key Columns |
|-------|-------------|-------------|
| `markets` | Prediction markets being monitored | condition_id, question, status |
| `recommendations` | Trade recommendations | market_id, direction, confidence |
| `agent_signals` | Individual agent signals | agent_name, fair_probability |
| `analysis_history` | Analysis execution history | status, duration_ms, cost_usd |
| `langgraph_checkpoints` | LangGraph workflow state | thread_id, checkpoint |

### Monitoring Views

The monitoring queries create 20 views for dashboards:

- **Market Analysis** (5 views) - Analysis statistics and trends
- **Agent Performance** (5 views) - Agent behavior and signals
- **Cost Tracking** (5 views) - Cost analysis and projections
- **Quota Usage** (5 views) - Capacity and usage patterns

See [monitoring-queries.sql](./monitoring-queries.sql) for complete list.

## Migrations

### Running Migrations

```bash
# Check status
npm run migrate:status

# Apply all pending migrations
npm run migrate

# Or use Supabase CLI
supabase db push
```

### Creating New Migrations

```bash
# Generate timestamp
TIMESTAMP=$(date +%Y%m%d%H%M%S)

# Create migration file
touch supabase/migrations/${TIMESTAMP}_your_migration_name.sql

# Edit the file and add your SQL
# Then apply it
supabase db push
```

See [migrations/README.md](./migrations/README.md) for detailed migration guide.

## Monitoring Dashboard

### Installing Monitoring Queries

The monitoring queries provide comprehensive insights into system performance:

```bash
# Install all monitoring views and functions
supabase db execute -f supabase/monitoring-queries.sql
```

### Using the Dashboard

See [DASHBOARD_SETUP.md](./DASHBOARD_SETUP.md) for:
- Complete setup instructions
- Dashboard layout recommendations
- Query examples
- Integration with visualization tools (Metabase, Grafana, Superset)
- Performance optimization tips

### Quick Dashboard Queries

```sql
-- Overall system health
SELECT * FROM v_market_analysis_summary;

-- Daily performance (last 7 days)
SELECT * FROM v_daily_analysis_stats 
WHERE analysis_date >= CURRENT_DATE - INTERVAL '7 days';

-- Agent performance
SELECT * FROM v_agent_performance_summary;

-- Cost tracking (current month)
SELECT * FROM v_daily_cost_tracking 
WHERE cost_date >= DATE_TRUNC('month', CURRENT_DATE);
```

## Configuration

### Environment Variables

Required environment variables for database connection:

```bash
# Supabase connection
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Database connection (for migrations)
DATABASE_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres
```

### Local Development

The `config.toml` file configures local Supabase instance:

```toml
[api]
port = 54321
schemas = ["public"]

[db]
port = 54322

[studio]
port = 54323
```

## Database Access

### Using Supabase Client (TypeScript)

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

// Query markets
const { data: markets } = await supabase
  .from('markets')
  .select('*')
  .eq('status', 'active');

// Query monitoring view
const { data: stats } = await supabase
  .from('v_market_analysis_summary')
  .select('*')
  .single();
```

### Using psql

```bash
# Connect to local instance
psql "postgresql://postgres:postgres@localhost:54322/postgres"

# Connect to production
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
```

### Using Supabase Studio

Access the web UI:
- Local: http://localhost:54323
- Production: https://app.supabase.com/project/[PROJECT-REF]

## Backup and Recovery

### Backup Database

```bash
# Backup schema and data
pg_dump -h db.[PROJECT-REF].supabase.co \
  -U postgres \
  -d postgres \
  -F c \
  -f backup_$(date +%Y%m%d).dump

# Backup schema only
pg_dump -h db.[PROJECT-REF].supabase.co \
  -U postgres \
  -d postgres \
  --schema-only \
  -f schema_backup.sql
```

### Restore Database

```bash
# Restore from dump
pg_restore -h db.[PROJECT-REF].supabase.co \
  -U postgres \
  -d postgres \
  -c \
  backup_20260115.dump
```

## Performance Optimization

### Indexes

All critical indexes are created in migrations:

```sql
-- Check index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as scans
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC;
```

### Query Performance

```sql
-- Analyze query performance
EXPLAIN ANALYZE
SELECT * FROM v_daily_analysis_stats
WHERE analysis_date >= CURRENT_DATE - INTERVAL '30 days';

-- Update table statistics
ANALYZE markets;
ANALYZE analysis_history;
ANALYZE agent_signals;
```

### Vacuum

```sql
-- Reclaim storage and update statistics
VACUUM ANALYZE markets;
VACUUM ANALYZE analysis_history;
```

## Monitoring and Alerts

### Health Checks

```sql
-- Check database size
SELECT
  pg_size_pretty(pg_database_size('postgres')) as db_size;

-- Check table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check connection count
SELECT count(*) FROM pg_stat_activity;
```

### Alerts

Set up alerts for:
- High failure rate (< 80% success)
- Cost overruns (> daily threshold)
- No recent analysis (> 25 hours)
- Database size (> 80% of quota)

See [DASHBOARD_SETUP.md](./DASHBOARD_SETUP.md) for alert query examples.

## Troubleshooting

### Common Issues

#### Migration Fails

```bash
# Check migration status
npm run migrate:status

# View error logs
supabase db logs

# Reset local database (CAUTION: destroys data)
supabase db reset
```

#### Connection Issues

```bash
# Test connection
psql "your-connection-string" -c "SELECT 1;"

# Check Supabase status
curl https://status.supabase.com/api/v2/status.json
```

#### Slow Queries

```sql
-- Find slow queries
SELECT
  query,
  calls,
  total_time,
  mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

#### View Not Found

```bash
# Reinstall monitoring queries
supabase db execute -f supabase/monitoring-queries.sql

# Verify views exist
psql "your-connection-string" -c "\dv"
```

## Security

### Row Level Security (RLS)

Currently, RLS is not enabled. For production:

```sql
-- Enable RLS on tables
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Public read access" ON markets
  FOR SELECT USING (true);

CREATE POLICY "Service role full access" ON markets
  FOR ALL USING (auth.role() = 'service_role');
```

### API Keys

- **Anon Key**: Safe for client-side use, respects RLS
- **Service Role Key**: Full access, use server-side only
- Never commit keys to version control

## Resources

### Documentation

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Supabase CLI Reference](https://supabase.com/docs/reference/cli)

### Internal Documentation

- [migrations/README.md](./migrations/README.md) - Migration guide
- [DASHBOARD_SETUP.md](./DASHBOARD_SETUP.md) - Dashboard setup
- [src/database/README.md](../src/database/README.md) - Database client usage
- [src/database/MIGRATIONS.md](../src/database/MIGRATIONS.md) - Migration details

### Support

For issues:
1. Check troubleshooting section above
2. Review Supabase logs
3. Consult project documentation
4. Open an issue in the repository

## Development Workflow

### Local Development

```bash
# 1. Start local Supabase
supabase start

# 2. Apply migrations
supabase db push

# 3. Install monitoring queries
supabase db execute -f supabase/monitoring-queries.sql

# 4. Run your application
npm run dev

# 5. View database in Studio
open http://localhost:54323
```

### Testing Changes

```bash
# 1. Create test migration
touch supabase/migrations/$(date +%Y%m%d%H%M%S)_test_change.sql

# 2. Apply to local
supabase db push

# 3. Test your changes
npm test

# 4. If good, apply to staging
supabase link --project-ref staging-ref
supabase db push

# 5. Finally, apply to production
supabase link --project-ref prod-ref
supabase db push
```

### Rollback

```bash
# Reset local database
supabase db reset

# For production, create a rollback migration
touch supabase/migrations/$(date +%Y%m%d%H%M%S)_rollback_change.sql
# Add DROP/ALTER statements to undo changes
supabase db push
```

## Maintenance

### Regular Tasks

- **Daily**: Monitor dashboard for anomalies
- **Weekly**: Review slow queries and optimize
- **Monthly**: Analyze table sizes and vacuum if needed
- **Quarterly**: Review and archive old data

### Data Retention

Consider implementing data retention policies:

```sql
-- Archive old analysis history (older than 1 year)
CREATE TABLE analysis_history_archive AS
SELECT * FROM analysis_history
WHERE created_at < NOW() - INTERVAL '1 year';

-- Delete archived records
DELETE FROM analysis_history
WHERE created_at < NOW() - INTERVAL '1 year';
```

## Contributing

When adding new database features:

1. Create a migration file with timestamp
2. Update this README if adding new tables/views
3. Update DASHBOARD_SETUP.md if adding monitoring queries
4. Test locally before pushing to production
5. Document any new environment variables

## License

See project LICENSE file.
