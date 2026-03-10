-- Update features for Basic package
UPDATE packages 
SET features = '{
  "max_prompts": 1,
  "max_contacts": 0,
  "max_api_keys": 1,
  "proactive_enabled": false,
  "max_delay_mins": 5,
  "history_retention_days": 7,
  "blocked_log_enabled": false,
  "log_monitor_enabled": false,
  "dashboard_level": "basic"
}'::jsonb,
display_name = 'Basic'
WHERE name = 'basic';

-- Update features for Premium package
UPDATE packages 
SET features = '{
  "max_prompts": 1,
  "max_contacts": 5,
  "max_api_keys": 1,
  "proactive_enabled": true,
  "max_delay_mins": 5,
  "history_retention_days": 30,
  "blocked_log_enabled": true,
  "log_monitor_enabled": false,
  "dashboard_level": "standard"
}'::jsonb,
display_name = 'Premium'
WHERE name = 'premium';

-- Update features for Pro package
UPDATE packages 
SET features = '{
  "max_prompts": 1,
  "max_contacts": 999,
  "max_api_keys": 1,
  "proactive_enabled": true,
  "max_delay_mins": 5,
  "history_retention_days": 60,
  "blocked_log_enabled": true,
  "log_monitor_enabled": true,
  "dashboard_level": "summary"
}'::jsonb,
display_name = 'Pro'
WHERE name = 'pro';
