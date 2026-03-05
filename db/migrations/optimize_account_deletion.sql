-- Migration Script: Optimize Account Total Deletion
-- Automatically wipe all related user data when a user is deleted, preventing Foreign Key constraint timeouts.

BEGIN;

-- 1. otp_codes
ALTER TABLE public.otp_codes DROP CONSTRAINT IF EXISTS otp_codes_user_id_fkey;
ALTER TABLE public.otp_codes ADD CONSTRAINT otp_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 2. subscriptions
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_user_id_fkey;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 3. token_balances
ALTER TABLE public.token_balances DROP CONSTRAINT IF EXISTS token_balances_user_id_fkey;
ALTER TABLE public.token_balances ADD CONSTRAINT token_balances_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 4. token_transactions
ALTER TABLE public.token_transactions DROP CONSTRAINT IF EXISTS token_transactions_user_id_fkey;
ALTER TABLE public.token_transactions ADD CONSTRAINT token_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 5. topup_orders
ALTER TABLE public.topup_orders DROP CONSTRAINT IF EXISTS topup_orders_user_id_fkey;
ALTER TABLE public.topup_orders ADD CONSTRAINT topup_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 6. user_sessions
ALTER TABLE public.user_sessions DROP CONSTRAINT IF EXISTS user_sessions_user_id_fkey;
ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 7. wa_bot_api_keys
ALTER TABLE public.wa_bot_api_keys DROP CONSTRAINT IF EXISTS wa_bot_api_keys_user_id_fkey;
ALTER TABLE public.wa_bot_api_keys ADD CONSTRAINT wa_bot_api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 8. wa_bot_blocked_attempts
ALTER TABLE public.wa_bot_blocked_attempts DROP CONSTRAINT IF EXISTS wa_bot_blocked_attempts_user_id_fkey;
ALTER TABLE public.wa_bot_blocked_attempts ADD CONSTRAINT wa_bot_blocked_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 9. wa_bot_contacts
ALTER TABLE public.wa_bot_contacts DROP CONSTRAINT IF EXISTS wa_bot_contacts_user_id_fkey;
ALTER TABLE public.wa_bot_contacts ADD CONSTRAINT wa_bot_contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 10. wa_bot_logs
ALTER TABLE public.wa_bot_logs DROP CONSTRAINT IF EXISTS wa_bot_logs_user_id_fkey;
ALTER TABLE public.wa_bot_logs ADD CONSTRAINT wa_bot_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 11. wa_bot_prompts
ALTER TABLE public.wa_bot_prompts DROP CONSTRAINT IF EXISTS wa_bot_prompts_user_id_fkey;
ALTER TABLE public.wa_bot_prompts ADD CONSTRAINT wa_bot_prompts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 12. wa_chat_history
ALTER TABLE public.wa_chat_history DROP CONSTRAINT IF EXISTS wa_chat_history_user_id_fkey;
ALTER TABLE public.wa_chat_history ADD CONSTRAINT wa_chat_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 13. wa_chat_history_local
ALTER TABLE public.wa_chat_history_local DROP CONSTRAINT IF EXISTS wa_chat_history_local_user_id_fkey;
ALTER TABLE public.wa_chat_history_local ADD CONSTRAINT wa_chat_history_local_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 14. wa_sessions (REFERENCES auth.users!)
ALTER TABLE public.wa_sessions DROP CONSTRAINT IF EXISTS wa_sessions_user_id_fkey;
ALTER TABLE public.wa_sessions ADD CONSTRAINT wa_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

COMMIT;
