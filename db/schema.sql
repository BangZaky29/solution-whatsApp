-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.otp_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  code text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  is_used boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT otp_codes_pkey PRIMARY KEY (id),
  CONSTRAINT otp_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  wa_session_id text NOT NULL,
  is_primary boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  email text,
  full_name text,
  password_hash text,
  role text DEFAULT 'user'::text,
  created_at timestamp with time zone DEFAULT now(),
  username text UNIQUE,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);
CREATE TABLE public.wa_ai_sessions (
  id text NOT NULL,
  value jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT wa_ai_sessions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.wa_ai_sessions_local (
  id text NOT NULL,
  value jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT wa_ai_sessions_local_pkey PRIMARY KEY (id)
);
CREATE TABLE public.wa_bot_api_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_value text NOT NULL,
  is_active boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT wa_bot_api_keys_pkey PRIMARY KEY (id)
);
CREATE TABLE public.wa_bot_contacts (
  jid text NOT NULL,
  push_name text,
  is_allowed boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT wa_bot_contacts_pkey PRIMARY KEY (jid)
);
CREATE TABLE public.wa_bot_prompts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  content text NOT NULL,
  is_active boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT wa_bot_prompts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.wa_bot_settings (
  id text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT wa_bot_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.wa_chat_history (
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
CREATE TABLE public.wa_chat_history_local (
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
CREATE TABLE public.wa_sessions (
  id text NOT NULL,
  value jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT wa_sessions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.wa_sessions_local (
  id text NOT NULL,
  value jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT wa_sessions_local_pkey PRIMARY KEY (id)
);