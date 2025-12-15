# Database Migrations

This directory contains SQL migration scripts for the Lanonasis MCP Server database schema.

## Running Migrations

### Option 1: Using Supabase CLI

If you have the Supabase CLI installed:

```bash
supabase db push --db-url "postgresql://[YOUR_CONNECTION_STRING]" --include migrations/001_add_last_used_at_to_api_keys.sql
```

### Option 2: Using psql

```bash
psql "postgresql://[YOUR_CONNECTION_STRING]" -f database/migrations/001_add_last_used_at_to_api_keys.sql
```

### Option 3: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy the contents of `001_add_last_used_at_to_api_keys.sql`
4. Paste and run the SQL

### Option 4: Using Node.js Script

We provide a migration runner script:

```bash
node database/run-migration.js
```

## Migration Files

### 001_add_last_used_at_to_api_keys.sql

**Purpose**: Adds the `last_used_at` column to the `api_keys` table to track when each API key was last used.

**Changes**:
- Adds `last_used_at TIMESTAMPTZ` column to `public.api_keys` table
- Creates an index on `last_used_at` for efficient querying
- Initializes existing records with `created_at` value if available

**Safe to re-run**: Yes, the migration includes checks to prevent errors if the column already exists.

## Creating New Migrations

When creating new migrations:

1. Name files with incrementing numbers: `00X_description.sql`
2. Include a header comment describing the migration
3. Use idempotent operations (check if column/table exists before creating)
4. Add comments to document the purpose of each change

Example:

```sql
-- Migration: Add new_column to table_name
-- Date: YYYY-MM-DD
-- Description: Brief description of what this migration does

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'table_name' AND column_name = 'new_column'
    ) THEN
        ALTER TABLE table_name ADD COLUMN new_column DATA_TYPE;
    END IF;
END $$;
```

## Troubleshooting

### Permission Errors

If you encounter permission errors, ensure your database user has the necessary privileges:

```sql
GRANT ALL PRIVILEGES ON TABLE api_keys TO your_user;
```

### Column Already Exists

The migration scripts are designed to be idempotent. If a column already exists, the script will skip creating it and output a notice.

### Verification

After running a migration, verify it worked:

```sql
-- Check if column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'api_keys' AND column_name = 'last_used_at';

-- Check the index
SELECT indexname FROM pg_indexes 
WHERE tablename = 'api_keys' AND indexname = 'idx_api_keys_last_used_at';
```
