-- Migration: Add last_used_at column to api_keys table
-- Date: 2025-12-11
-- Description: Adds last_used_at timestamp tracking to the api_keys table
--              to complement the existing usage_count column

-- Add last_used_at column if it doesn't exist
DO $$ 
BEGIN
    -- Check if the column already exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'api_keys' 
        AND column_name = 'last_used_at'
    ) THEN
        -- Add the column
        ALTER TABLE public.api_keys 
        ADD COLUMN last_used_at TIMESTAMPTZ;
        
        RAISE NOTICE 'Added last_used_at column to api_keys table';
    ELSE
        RAISE NOTICE 'Column last_used_at already exists in api_keys table';
    END IF;
END $$;

-- Create an index on last_used_at for efficient queries
CREATE INDEX IF NOT EXISTS idx_api_keys_last_used_at 
ON public.api_keys(last_used_at);

-- Add comment to document the column
COMMENT ON COLUMN public.api_keys.last_used_at IS 
'Timestamp of the last time this API key was used for authentication';

-- Optionally initialize existing rows with created_at if available
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'api_keys' 
        AND column_name = 'created_at'
    ) THEN
        UPDATE public.api_keys 
        SET last_used_at = created_at 
        WHERE last_used_at IS NULL;
        
        RAISE NOTICE 'Initialized last_used_at for existing records';
    END IF;
END $$;
