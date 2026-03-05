-- =====================================================
-- SEED: Packages Data (Basic, Premium, Pro)
-- Run this in Supabase SQL Editor
-- =====================================================

-- Clear existing packages (if any)
DELETE FROM public.packages;

-- ── BASIC ──
INSERT INTO public.packages (name, display_name, price, token_amount, duration_days, features, is_active)
VALUES (
  'basic',
  'Basic',
  49000,
  5000,
  30,
  '{
    "max_prompts": 2,
    "max_contacts": 10,
    "max_api_keys": 0,
    "proactive_enabled": false,
    "max_delay_mins": 5,
    "history_retention_days": 7,
    "blocked_log_enabled": false,
    "log_monitor_enabled": false,
    "dashboard_level": "summary"
  }'::jsonb,
  true
);

-- ── PREMIUM ──
INSERT INTO public.packages (name, display_name, price, token_amount, duration_days, features, is_active)
VALUES (
  'premium',
  'Premium',
  99000,
  15000,
  30,
  '{
    "max_prompts": 5,
    "max_contacts": 50,
    "max_api_keys": 1,
    "proactive_enabled": true,
    "max_delay_mins": 15,
    "history_retention_days": 30,
    "blocked_log_enabled": true,
    "log_monitor_enabled": false,
    "dashboard_level": "full"
  }'::jsonb,
  true
);

-- ── PRO ──
INSERT INTO public.packages (name, display_name, price, token_amount, duration_days, features, is_active)
VALUES (
  'pro',
  'Pro',
  199000,
  50000,
  30,
  '{
    "max_prompts": 999,
    "max_contacts": 999,
    "max_api_keys": 999,
    "proactive_enabled": true,
    "max_delay_mins": 30,
    "history_retention_days": 90,
    "blocked_log_enabled": true,
    "log_monitor_enabled": true,
    "dashboard_level": "full_export"
  }'::jsonb,
  true
);

-- =====================================================
-- Verify insertion
-- =====================================================
SELECT name, display_name, price, token_amount, features FROM public.packages ORDER BY price;

-- =====================================================
-- RLS Policies for Payment Tables
-- (Backend uses service_role key which bypasses RLS,
--  but add these for safety/future frontend direct access)
-- =====================================================

-- packages: allow public read
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read packages" ON public.packages
  FOR SELECT USING (true);

-- subscriptions: user can only read their own
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own subscriptions" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access subscriptions" ON public.subscriptions
  FOR ALL USING (auth.role() = 'service_role');

-- token_balances: user can only read their own
ALTER TABLE public.token_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own token balance" ON public.token_balances
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access token_balances" ON public.token_balances
  FOR ALL USING (auth.role() = 'service_role');

-- token_transactions: user can only read their own
ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own token transactions" ON public.token_transactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access token_transactions" ON public.token_transactions
  FOR ALL USING (auth.role() = 'service_role');

-- topup_orders: user can only read their own
ALTER TABLE public.topup_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own topup orders" ON public.topup_orders
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access topup_orders" ON public.topup_orders
  FOR ALL USING (auth.role() = 'service_role');
