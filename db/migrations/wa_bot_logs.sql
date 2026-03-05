-- Table for storing AI Bot Logs
CREATE TABLE IF NOT EXISTS public.wa_bot_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id text,
  level text NOT NULL, -- 'info', 'warn', 'error', 'success', 'system'
  message text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT wa_bot_logs_pkey PRIMARY KEY (id),
  CONSTRAINT wa_bot_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.wa_bot_logs ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own logs
CREATE POLICY "Users can view their own logs" ON public.wa_bot_logs
  FOR SELECT USING ((user_id = auth.uid()));

-- Service Role / Admin can insert or view all
CREATE POLICY "Service Role full access to logs" ON public.wa_bot_logs
  USING (true) WITH CHECK (true);
