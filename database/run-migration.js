#!/usr/bin/env node

/**
 * Database Migration Runner
 * 
 * Runs the SQL migration to add last_used_at column to api_keys table
 * 
 * Usage:
 *   node database/run-migration.js
 * 
 * Environment Variables Required:
 *   - SUPABASE_URL: Your Supabase project URL
 *   - SUPABASE_SERVICE_KEY: Your Supabase service role key
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Check for required environment variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: Missing required environment variables');
  console.error('   Please set SUPABASE_URL and SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function runMigration() {
  try {
    console.log('🔄 Starting database migration...\n');

    // Read the migration file
    const migrationPath = path.join(__dirname, 'migrations', '001_add_last_used_at_to_api_keys.sql');
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📄 Loaded migration: 001_add_last_used_at_to_api_keys.sql');

    // Execute the migration
    console.log('⚙️  Executing migration...');
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: migrationSQL
    });

    if (error) {
      // If rpc doesn't exist, try alternative method
      if (error.message.includes('function') && error.message.includes('does not exist')) {
        console.log('⚠️  RPC method not available, using alternative approach...');
        await runMigrationAlternative(migrationSQL);
      } else {
        throw error;
      }
    } else {
      console.log('✅ Migration completed successfully');
    }

    // Verify the migration
    console.log('\n🔍 Verifying migration...');
    const { data: columns, error: verifyError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_name', 'api_keys')
      .eq('column_name', 'last_used_at');

    if (verifyError) {
      console.log('⚠️  Could not verify migration automatically');
      console.log('   Please verify manually in your Supabase dashboard');
    } else if (columns && columns.length > 0) {
      console.log('✅ Verified: last_used_at column exists');
      console.log(`   Type: ${columns[0].data_type}`);
    } else {
      console.log('⚠️  Column verification returned no results');
      console.log('   This may be normal depending on your Supabase configuration');
    }

    console.log('\n✨ Migration process complete!');
    console.log('\n📋 Next Steps:');
    console.log('   1. Verify the column exists in your Supabase dashboard');
    console.log('   2. Check the SQL Editor logs for any notices or errors');
    console.log('   3. Test API key authentication to ensure functionality');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\n💡 Manual Migration Instructions:');
    console.error('   1. Open your Supabase dashboard');
    console.error('   2. Go to SQL Editor');
    console.error('   3. Run the SQL from: database/migrations/001_add_last_used_at_to_api_keys.sql');
    process.exit(1);
  }
}

async function runMigrationAlternative(sql) {
  console.log('📝 Alternative migration method:');
  console.log('   Please run the following SQL manually in your Supabase SQL Editor:\n');
  console.log('---START SQL---');
  console.log(sql);
  console.log('---END SQL---\n');
  console.log('   After running the SQL, the migration will be complete.');
}

// Run the migration
runMigration();
