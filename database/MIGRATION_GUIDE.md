# API Keys last_used_at Column Migration

## Overview

This document describes the fix for the missing `last_used_at` column in the `api_keys` table.

## Problem

The application code was attempting to track API key usage with both `usage_count` and `last_used_at` columns, but the database schema only had `usage_count`. This caused the following issues:

1. **Runtime errors** when selecting `last_used_at` from the database
2. **Update failures** when trying to set `last_used_at` values
3. **Incomplete tracking** of API key usage patterns

## Solution

This fix provides a proper database migration to add the `last_used_at` column instead of disabling the functionality in the code.

### What Changed

1. **Reverted code changes** that removed `last_used_at` functionality
2. **Created database migration** (`database/migrations/001_add_last_used_at_to_api_keys.sql`)
3. **Added migration tooling** to make it easy to apply the schema change

### Migration Details

The migration adds:

- `last_used_at TIMESTAMPTZ` column to track when API keys were last used
- Index `idx_api_keys_last_used_at` for efficient querying
- Automatic initialization of existing records with their `created_at` values

The migration is **idempotent** - safe to run multiple times.

## How to Apply the Migration

### Quick Start (Recommended)

```bash
# Using the provided Node.js script
node database/run-migration.js
```

### Alternative Methods

**Using Supabase Dashboard (Manual):**

1. Open your Supabase project dashboard
2. Navigate to: SQL Editor
3. Copy the contents of `database/migrations/001_add_last_used_at_to_api_keys.sql`
4. Paste and execute

**Using psql:**

```bash
psql "postgresql://[YOUR_CONNECTION_STRING]" \
  -f database/migrations/001_add_last_used_at_to_api_keys.sql
```

**Using Supabase CLI:**

```bash
supabase db push \
  --db-url "postgresql://[YOUR_CONNECTION_STRING]" \
  --include migrations/001_add_last_used_at_to_api_keys.sql
```

## Verification

After applying the migration, verify the column exists:

```sql
-- Check column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'api_keys' 
  AND column_name = 'last_used_at';

-- Expected result:
-- column_name   | data_type
-- last_used_at  | timestamp with time zone
```

## Impact

### Before Migration

- ❌ API key usage tracking incomplete
- ❌ Runtime errors when authenticating
- ❌ Unable to query when keys were last used

### After Migration

- ✅ Full API key usage tracking
- ✅ No runtime errors
- ✅ Can monitor and audit key usage patterns
- ✅ Supports security features like detecting stale keys

## Files Changed

### New Files

1. `database/migrations/001_add_last_used_at_to_api_keys.sql` - SQL migration script
2. `database/run-migration.js` - Node.js migration runner
3. `database/README.md` - Migration documentation
4. `database/MIGRATION_GUIDE.md` - This file

### Restored Files

1. `src/routes/mcp-sse.ts` - Restored `last_used_at` tracking
2. `src/middleware/auth-aligned.ts` - Restored `last_used_at` updates
3. `src/unified-mcp-server.ts` - Restored `last_used_at` in queries

## Testing

After applying the migration:

1. **Test API key authentication:**
   ```bash
   curl -H "X-API-Key: your_key" https://mcp.lanonasis.com/health
   ```

2. **Verify last_used_at is updated:**
   ```sql
   SELECT id, name, last_used_at, usage_count 
   FROM api_keys 
   WHERE key_hash = '[your_key_hash]';
   ```

3. **Check application logs** for any database errors

## Rollback (If Needed)

If you need to rollback the migration:

```sql
-- Remove the column (WARNING: This will delete data)
ALTER TABLE public.api_keys DROP COLUMN IF EXISTS last_used_at;

-- Remove the index
DROP INDEX IF EXISTS idx_api_keys_last_used_at;
```

Note: You would also need to revert the code changes to remove `last_used_at` references.

## Future Enhancements

With `last_used_at` tracking in place, you can now implement:

- **Stale key detection**: Identify keys not used in X days
- **Usage analytics**: Track patterns of API key usage
- **Security alerts**: Alert on unusual usage patterns
- **Automatic key rotation**: Rotate keys based on age and usage
- **Compliance reporting**: Demonstrate key usage for audits

## Support

For issues or questions:

1. Check the logs in `database/run-migration.js` output
2. Verify your database connection settings
3. Review the SQL in the migration file
4. Check Supabase dashboard for any constraint violations

## Related Documentation

- [Database Migrations README](./README.md)
- [API Key Management Guide](../APIKEY_QUICK_REFERENCE.md)
- [Comprehensive API Key Documentation](../COMPREHENSIVE_APIKEY_UPDATE_COMPLETE.md)
