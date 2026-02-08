-- ============================================
-- WhatsApp Gateway - Supabase Session Schema
-- ============================================
-- This table stores Baileys authentication state
-- Run this in Supabase SQL Editor before starting the server

-- Create the wa_sessions table
CREATE TABLE IF NOT EXISTS wa_sessions (
    -- Key identifier (e.g., 'creds', 'app-state-sync-key-xxx', 'pre-key-1')
    id TEXT PRIMARY KEY,
    
    -- Serialized value as JSONB
    -- Note: Buffer objects are converted to { type: 'Buffer', data: '<base64>' }
    value JSONB NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_wa_sessions_id ON wa_sessions(id);

-- Function to auto-update the updated_at column
CREATE OR REPLACE FUNCTION update_wa_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Trigger to call the function on updates
DROP TRIGGER IF EXISTS trigger_update_wa_sessions_updated_at ON wa_sessions;
CREATE TRIGGER trigger_update_wa_sessions_updated_at
    BEFORE UPDATE ON wa_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_wa_sessions_updated_at();

-- ============================================
-- IMPORTANT: Disable RLS for anon key access
-- ============================================
-- Run this if you get "row-level security policy" error
ALTER TABLE wa_sessions DISABLE ROW LEVEL SECURITY;

-- If RLS was already enabled, drop existing policies
DROP POLICY IF EXISTS "Allow all access" ON wa_sessions;

-- Alternative: If you WANT RLS enabled, uncomment below:
-- ALTER TABLE wa_sessions ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all access" ON wa_sessions FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE wa_sessions IS 'Stores WhatsApp Baileys authentication state for session persistence';
COMMENT ON COLUMN wa_sessions.id IS 'Key identifier like creds, app-state-sync-key-xxx, pre-key-N';
COMMENT ON COLUMN wa_sessions.value IS 'Serialized auth data (Buffers are Base64 encoded)';

