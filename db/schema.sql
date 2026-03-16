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
CREATE TABLE public.packages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_name text NOT NULL,
  price integer NOT NULL,
  token_amount integer NOT NULL,
  duration_days integer NOT NULL DEFAULT 30,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT packages_pkey PRIMARY KEY (id)
);
CREATE TABLE public.subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  package_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  started_at timestamp with time zone,
  expires_at timestamp with time zone,
  midtrans_order_id text UNIQUE,
  midtrans_transaction_id text,
  payment_method text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT subscriptions_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id),
  CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.token_balances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  balance integer NOT NULL DEFAULT 0,
  total_used integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT token_balances_pkey PRIMARY KEY (id),
  CONSTRAINT token_balances_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.token_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  type text NOT NULL,
  description text,
  reference_id text,
  balance_after integer NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT token_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT token_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.topup_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_amount integer NOT NULL,
  price integer NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  midtrans_order_id text UNIQUE,
  midtrans_transaction_id text,
  payment_method text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT topup_orders_pkey PRIMARY KEY (id),
  CONSTRAINT topup_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  wa_session_id text NOT NULL,
  is_primary boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_sessions_local (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  wa_session_id text NOT NULL,
  is_primary boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_sessions_local_pkey PRIMARY KEY (id),
  CONSTRAINT user_sessions_local_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
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
  model_name text DEFAULT 'gemini-2.5-flash'::text,
  api_version text DEFAULT 'v1beta'::text,
  user_id uuid,
  CONSTRAINT wa_bot_api_keys_pkey PRIMARY KEY (id),
  CONSTRAINT wa_bot_api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.wa_bot_blocked_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  jid text NOT NULL,
  push_name text,
  attempted_at timestamp with time zone DEFAULT now(),
  CONSTRAINT wa_bot_blocked_attempts_pkey PRIMARY KEY (id),
  CONSTRAINT wa_bot_blocked_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.wa_bot_contacts (
  jid text NOT NULL,
  push_name text,
  is_allowed boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  user_id uuid NOT NULL,
  CONSTRAINT wa_bot_contacts_pkey PRIMARY KEY (jid, user_id),
  CONSTRAINT wa_bot_contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.wa_bot_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id text,
  level text NOT NULL,
  message text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT wa_bot_logs_pkey PRIMARY KEY (id),
  CONSTRAINT wa_bot_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.wa_bot_prompts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  content text NOT NULL,
  is_active boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  user_id uuid,
  CONSTRAINT wa_bot_prompts_pkey PRIMARY KEY (id),
  CONSTRAINT wa_bot_prompts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.wa_bot_settings (
  id text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT wa_bot_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.wa_chat_history (
  jid text NOT NULL,
  push_name text NULL,
  history jsonb NULL DEFAULT '[]'::jsonb,
  msg_count integer NULL DEFAULT 0,
  last_active timestamp with time zone NULL DEFAULT now(),
  created_at timestamp with time zone NULL DEFAULT now(),
  proactive_count integer NULL DEFAULT 0,
  last_sender text NULL,
  user_id uuid NOT NULL,
  CONSTRAINT wa_chat_history_pkey PRIMARY KEY (jid, user_id),
  CONSTRAINT wa_chat_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE TABLE public.wa_chat_history_local (
  jid text NOT NULL,
  push_name text NULL,
  history jsonb NULL DEFAULT '[]'::jsonb,
  msg_count integer NULL DEFAULT 0,
  last_active timestamp with time zone NULL DEFAULT now(),
  created_at timestamp with time zone NULL DEFAULT now(),
  proactive_count integer NULL DEFAULT 0,
  last_sender text NULL,
  user_id uuid NOT NULL,
  CONSTRAINT wa_chat_history_local_pkey PRIMARY KEY (jid, user_id),
  CONSTRAINT wa_chat_history_local_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE TABLE public.wa_media (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  jid text NOT NULL,
  message_id text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  bucket_path text NOT NULL,
  public_url text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT wa_media_pkey PRIMARY KEY (id),
  CONSTRAINT wa_media_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.wa_sessions (
  id text NOT NULL,
  value jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  user_id uuid UNIQUE,
  CONSTRAINT wa_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT wa_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.wa_sessions_local (
  id text NOT NULL,
  value jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT wa_sessions_local_pkey PRIMARY KEY (id)
);
CREATE TABLE public.moderator_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  moderator_phone text NOT NULL,
  raw_command text NOT NULL,
  parsed_action text NOT NULL,
  target_identifier text,
  status text DEFAULT 'success'::text,
  reason text,
  result_summary text,
  executed_at timestamp with time zone DEFAULT now(),
  CONSTRAINT moderator_logs_pkey PRIMARY KEY (id)
);