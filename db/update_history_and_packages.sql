-- 1. Update wa_chat_history structure
-- First, add cascade if not exists (safer to drop and recreate constraint if needed)
ALTER TABLE public.wa_chat_history 
  DROP CONSTRAINT IF EXISTS wa_chat_history_user_id_fkey;

ALTER TABLE public.wa_chat_history
  ADD CONSTRAINT wa_chat_history_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

-- 2. Update Packages for Unlimited History
-- Update all packages to have 9999 days retention and 1000 max messages
UPDATE public.packages 
SET features = features || '{"history_retention_days": 9999, "max_history_messages": 1000}'::jsonb;

-- 3. Verify changes
SELECT name, features->>'history_retention_days' as retention, features->>'max_history_messages' as max_msgs 
FROM public.packages;
