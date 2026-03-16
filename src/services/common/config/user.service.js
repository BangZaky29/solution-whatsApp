const supabase = require("../../../config/supabase");
const paymentService = require("../../payment/payment.service");
const moderatorGuard = require("../../moderator/moderatorGuard");

async function getUserDisplay(userId) {
  try {
    if (!userId || userId === "null" || userId === "undefined") return "System";

    const UUID_REGEX =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(userId)) {
      return userId; // Return as is for non-UUIDs (system IDs)
    }

    const { data } = await supabase
      .from("users")
      .select("username, full_name")
      .eq("id", userId)
      .single();
    if (!data) return userId;

    const name = data.full_name || data.username || userId;
    return name;
  } catch (err) {
    return userId;
  }
}


async function getAIControls(userId = null) {
  const defaultControls = {
    is_ai_enabled: false, // Default to OFF until active session/package confirmed
    is_proactive_enabled: false,
    response_delay_mins: 0,
    media_receive_enabled: false,
    media_save_to_cloud: false,
    media_send_enabled: false,
    media_confirm_before_save: true,
    group_chat_enabled: false,
    group_trigger_mention: false,
    group_trigger_reply: false,
    group_trigger_keyword: false,
    history_enabled: true,
    history_max_messages: 100,
    proactive_idle_threshold_mins: 60,
    proactive_max_per_cycle: 1,
  };

  if (!userId || userId === "null") return defaultControls;

  try {
    const key = `ai_controls:${userId}`;
    const settings = await this.getSetting(key);
    const userFeatures = await paymentService.getUserFeatures(userId);
    const isModerator = await moderatorGuard.isModerator(userId);

    const merged = {
      ...defaultControls,
      ...(settings || {}),
    };

    // ── FEATURE GATING ──
    const maxPackageMsgs = userFeatures.max_history_messages || 1000;

    if (!isModerator) {
      // Regular User: Strict enforcement
      if (!userFeatures.proactive_enabled) merged.is_proactive_enabled = false;
      if (!userFeatures.media_receive_enabled) merged.media_receive_enabled = false;
      if (!userFeatures.media_save_enabled) merged.media_save_to_cloud = false;
      if (!userFeatures.media_send_enabled) merged.media_send_enabled = false;
      if (!userFeatures.group_chat_enabled) merged.group_chat_enabled = false;
      if (!userFeatures.group_keyword_trigger) merged.group_trigger_keyword = false;

      if (userFeatures.history_retention_days === 0) {
        merged.history_enabled = false;
        merged.history_max_messages = 0;
      }
    } else {
      // Moderator: Explicit bypass for some features if record is fresh
      if (settings === null) {
        merged.is_ai_enabled = true;
        merged.group_chat_enabled = true;
        merged.media_receive_enabled = true;
        merged.history_enabled = true;
      }
    }

    // ── COMMON HISTORY LIMIT LOGIC ──
    if (merged.history_enabled) {
      // If messages limit is unset or too small, default to 100 or package max
      if (!merged.history_max_messages || merged.history_max_messages < 50) {
        merged.history_max_messages = Math.min(100, maxPackageMsgs);
      }
      // Never exceed package limit
      if (merged.history_max_messages > maxPackageMsgs) {
        merged.history_max_messages = maxPackageMsgs;
      }
    }

    console.log(`[getAIControls] Final gating for ${userId}: is_ai=${merged.is_ai_enabled}, group=${merged.group_chat_enabled}`);
    return merged;
  } catch (err) {
    console.error(`[getAIControls] Critical Failure:`, err);
    return defaultControls;
  }
}

async function updateAIControls(userId, controls) {
  if (!userId || userId === "null") return false;
  const key = `ai_controls:${userId}`;
  return await this.updateSetting(key, controls);
}

module.exports = {
  getUserDisplay,
  getAIControls,
  updateAIControls,
};
