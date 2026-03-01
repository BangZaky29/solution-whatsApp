-- ========================================================
-- FULL MIGRATION SCRIPT FOR WA-BOT-AI
-- Supabase Project: uhuouuonszrcbambffrr
-- Description: Creates all tables and disables RLS for 
--              direct backend access (simplified setup)
-- ========================================================

-- 1. API KEYS TABLE
CREATE TABLE IF NOT EXISTS public.wa_bot_api_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_value text NOT NULL,
  is_active boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT wa_bot_api_keys_pkey PRIMARY KEY (id)
);
ALTER TABLE public.wa_bot_api_keys DISABLE ROW LEVEL SECURITY;

-- 2. CONTACTS TABLE
CREATE TABLE IF NOT EXISTS public.wa_bot_contacts (
  jid text NOT NULL,
  push_name text,
  is_allowed boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT wa_bot_contacts_pkey PRIMARY KEY (jid)
);
ALTER TABLE public.wa_bot_contacts DISABLE ROW LEVEL SECURITY;

-- 3. PROMPTS TABLE
CREATE TABLE IF NOT EXISTS public.wa_bot_prompts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  content text NOT NULL,
  is_active boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT wa_bot_prompts_pkey PRIMARY KEY (id)
);
ALTER TABLE public.wa_bot_prompts DISABLE ROW LEVEL SECURITY;

-- 4. SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.wa_bot_settings (
  id text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT wa_bot_settings_pkey PRIMARY KEY (id)
);
ALTER TABLE public.wa_bot_settings DISABLE ROW LEVEL SECURITY;

-- 5. CHAT HISTORY TABLE
CREATE TABLE IF NOT EXISTS public.wa_chat_history (
  jid text NOT NULL,
  push_name text,
  history jsonb DEFAULT '[]'::jsonb,
  msg_count integer DEFAULT 0,
  last_active timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  proactive_count integer DEFAULT 0,
  last_sender text,
  CONSTRAINT wa_chat_history_pkey PRIMARY KEY (jid)
);
ALTER TABLE public.wa_chat_history DISABLE ROW LEVEL SECURITY;

-- 6. LOCAL CHAT HISTORY TABLE (Dev/Prod split if needed)
CREATE TABLE IF NOT EXISTS public.wa_chat_history_local (
  jid text NOT NULL,
  push_name text,
  history jsonb DEFAULT '[]'::jsonb,
  msg_count integer DEFAULT 0,
  last_active timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  proactive_count integer DEFAULT 0,
  last_sender text,
  CONSTRAINT wa_chat_history_local_pkey PRIMARY KEY (jid)
);
ALTER TABLE public.wa_chat_history_local DISABLE ROW LEVEL SECURITY;

-- 7. SESSIONS TABLE (Prod)
CREATE TABLE IF NOT EXISTS public.wa_sessions (
  id text NOT NULL,
  value jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT wa_sessions_pkey PRIMARY KEY (id)
);
ALTER TABLE public.wa_sessions DISABLE ROW LEVEL SECURITY;

-- 8. SESSIONS LOCAL TABLE (Dev)
CREATE TABLE IF NOT EXISTS public.wa_sessions_local (
  id text NOT NULL,
  value jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT wa_sessions_local_pkey PRIMARY KEY (id)
);
ALTER TABLE public.wa_sessions_local DISABLE ROW LEVEL SECURITY;

-- ========================================================
-- POLICIES (If you ever want to re-enable RLS)
-- ========================================================
-- To enable RLS again, run: ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
-- Then run the following policies:


CREATE POLICY "Allow all access" ON public.wa_bot_api_keys FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.wa_bot_contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.wa_bot_prompts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.wa_bot_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.wa_chat_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.wa_chat_history_local FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.wa_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.wa_sessions_local FOR ALL USING (true) WITH CHECK (true);

