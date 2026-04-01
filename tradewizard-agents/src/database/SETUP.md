# Supabase Setup Guide

This guide explains how the Supabase integration was set up following best practices.

## Setup Process

### 1. Supabase CLI Installation

The Supabase CLI is available via npx (no global installation needed):

```bash
npx supabase --version
```

### 2. Project Initialization

The project was already linked to a remote Supabase project. You can verify this with:

```bash
npx supabase status
```

### 3. Creating Migrations

Migrations are created using the Supabase CLI, not manually:

```bash
npx supabase migration new migration_name
```

This creates a timestamped migration file in `supabase/migrations/`.

### 4. Writing Migration SQL

Edit the generated migration file in `supabase/migrations/` with your SQL:

```sql
CREATE TABLE IF NOT EXISTS markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_id TEXT UNIQUE NOT NULL,
  -- ... other fields
);
```

### 5. Pushing Migrations to Remote

Push migrations to the remote Supabase database:

```bash
npx supabase db push
```

This applies all pending migrations to your remote database.

### 6. Generating TypeScript Types

After pushing migrations, generate TypeScript types from the remote schema:

```bash
npx supabase gen types typescript --linked > src/database/types.ts
```

This creates a `types.ts` file with full TypeScript definitions for your database schema.

## Project Structure

```
tradewizard-agents/
├── supabase/
│   ├── migrations/
│   │   └── 20260115162602_initial_schema.sql  # Timestamped migration
│   ├── config.toml                             # Supabase configuration
│   └── .temp/                                  # CLI temporary files
└── src/
    └── database/
        ├── types.ts                            # Generated from Supabase
        ├── supabase-client.ts                  # Client wrapper
        ├── index.ts                            # Module exports
        └── README.md                           # Usage documentation
```

## Key Principles

### ✅ DO:
- Use `npx supabase migration new` to create migrations
- Store migrations in `supabase/migrations/`
- Push migrations with `npx supabase db push`
- Generate types with `npx supabase gen types typescript --linked`
- Use the generated types for type safety
- Version control migration files

### ❌ DON'T:
- Manually create migration files in `src/database/migrations/`
- Write schema definitions in TypeScript
- Manually write type definitions
- Run SQL directly in the Supabase dashboard (use migrations instead)
- Edit generated `types.ts` file manually

## Workflow

### Adding a New Table

1. Create a new migration:
```bash
npx supabase migration new add_users_table
```

2. Edit the migration file in `supabase/migrations/`:
```sql
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

3. Push to remote:
```bash
npx supabase db push
```

4. Regenerate types:
```bash
npx supabase gen types typescript --linked > src/database/types.ts
```

5. Use the new types in your code:
```typescript
import type { Tables } from './database/types.js';

type User = Tables<'users'>;
```

### Modifying an Existing Table

1. Create a new migration:
```bash
npx supabase migration new add_user_role
```

2. Write the ALTER TABLE statement:
```sql
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';
```

3. Push and regenerate types (same as above)

## Common Commands

```bash
# Check migration status
npx supabase db diff

# Pull remote schema changes
npx supabase db pull

# Reset local database (development only)
npx supabase db reset

# Link to a different project
npx supabase link --project-ref your-project-ref

# Generate types
npx supabase gen types typescript --linked > src/database/types.ts
```

## Benefits of This Approach

1. **Version Control**: All schema changes are tracked in git
2. **Type Safety**: TypeScript types are always in sync with the database
3. **Reproducibility**: Anyone can recreate the database from migrations
4. **Rollback**: Easy to revert changes by creating new migrations
5. **Team Collaboration**: No conflicts from manual schema changes
6. **CI/CD Ready**: Migrations can be applied automatically in deployment pipelines

## Current Schema

The initial migration (`20260115162602_initial_schema.sql`) creates:

- `markets` - Prediction market information
- `recommendations` - Trade recommendations
- `agent_signals` - Individual agent signals
- `analysis_history` - Analysis execution history
- `langgraph_checkpoints` - LangGraph workflow state

All tables include proper indexes, foreign keys, and triggers for automatic timestamp updates.

## Troubleshooting

### Types are out of sync

Regenerate types:
```bash
npx supabase gen types typescript --linked > src/database/types.ts
```

### Migration fails

Check the error message and fix the SQL. You may need to create a new migration to fix the issue.

### Can't connect to remote

Verify you're linked:
```bash
cat supabase/.temp/project-ref
```

Re-link if needed:
```bash
npx supabase link --project-ref your-project-ref
```

## Next Steps

- Add more migrations as needed for new features
- Keep types in sync by regenerating after each migration
- Use the typed client for all database operations
- Write tests using the generated types
