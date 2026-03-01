-- Multi-User Authentication & Multi-Tenancy Schema

-- 1. Users Table
CREATE TABLE IF NOT EXISTS public.users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  phone text UNIQUE NOT NULL,
  email text,
  full_name text,
  password_hash text,
  role text DEFAULT 'user',
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- 2. OTP Codes Table
CREATE TABLE IF NOT EXISTS public.otp_codes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id),
  code text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  is_used boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- 3. User Sessions (Mapping users to WA instances)
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  wa_session_id text NOT NULL, -- The unique ID used in wa_sessions tables
  is_primary boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on user_sessions
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own sessions" ON public.user_sessions
  FOR ALL USING (auth.uid() = user_id);

-- 4. Update existing wa_sessions policy to support user isolation
-- (Note: This assumes we add a user_id column to wa_sessions or link through user_sessions)
-- For now, we use user_sessions mapping.
