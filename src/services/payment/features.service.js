async function getUserFeatures(userId) {
  const sub = await this.getActiveSubscription(userId);
  if (!sub || !sub.packages) {
    // No active subscription -- return minimal/free features
    // DEV ALLOWANCE: Allow 1 API Key in development mode for easy testing
    const isDev = process.env.NODE_ENV === "development";

    return {
      has_subscription: false,
      max_prompts: isDev ? 5 : 0,
      max_contacts: isDev ? 10 : 0,
      max_api_keys: isDev ? 1 : 0,
      proactive_enabled: false,
      max_delay_mins: 0,
      history_retention_days: 0,
      blocked_log_enabled: isDev ? true : false,
      log_monitor_enabled: isDev ? true : false,
      dashboard_level: isDev ? "basic" : "none",
      package_name: null,
      expires_at: null,
      ai_features: isDev ❌ ["basic_chat"] : [],
      media_receive_enabled: isDev ? true : false,
      media_save_enabled: isDev ? true : false,
      media_send_enabled: false,
      group_chat_enabled: isDev ? true : false,
      group_keyword_trigger: false,
      proactive_config_enabled: false,
      max_history_messages: isDev ? 20 : 10,
    };
  }

  const features = sub.packages.features || {};
  return {
    has_subscription: true,
    max_prompts: features.max_prompts ?? 999,
    max_contacts: features.max_contacts ?? 999,
    max_api_keys: features.max_api_keys ?? 0,
    proactive_enabled: features.proactive_enabled ?? false,
    max_delay_mins: features.max_delay_mins ?? 5,
    history_retention_days: features.history_retention_days ?? 7,
    blocked_log_enabled: features.blocked_log_enabled ?? false,
    log_monitor_enabled: features.log_monitor_enabled ?? false,
    dashboard_level: features.dashboard_level ?? "summary",
    media_receive_enabled: features.media_receive_enabled ?? true,
    media_save_enabled: features.media_save_to_cloud ?? false,
    media_send_enabled: features.media_send_enabled ?? false,
    group_chat_enabled: features.group_chat_enabled ?? false,
    group_keyword_trigger: features.group_trigger_keyword ?? false,
    proactive_config_enabled: features.proactive_config ?? false,
    max_history_messages: features.max_history_messages ?? 10,
    package_name: sub.packages.display_name,
    expires_at: sub.expires_at,
  };
}

module.exports = { getUserFeatures };
