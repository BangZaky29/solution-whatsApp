const supabase = require("../../../config/supabase");
const featuresService = require("../../payment/features.service");

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
    is_ai_enabled: true,
    is_proactive_enabled: false,
    response_delay_mins: 0,
    media_receive_enabled: true,
    media_save_to_cloud: false,
    media_send_enabled: false,
    media_confirm_before_save: true,
    group_chat_enabled: false,
    group_trigger_mention: true,
    group_trigger_reply: true,
    group_trigger_keyword: false,
    history_enabled: true,
    history_max_messages: 10,
    proactive_idle_threshold_mins: 60,
    proactive_max_per_cycle: 3,
  };

  if (!userId || userId === "null") return defaultControls;

  try {
    const key = `ai_controls:${userId}`;
    const settings = await this.getSetting(key);
    const userFeatures = await featuresService.getUserFeatures(userId);

    const merged = {
      ...defaultControls,
      ...(settings || {}),
    };

    // Strict enforcement: Force features to false if not allowed by plan
    if (!userFeatures.proactive_enabled) {
      merged.is_proactive_enabled = false;
    }
    if (!userFeatures.media_save_enabled) {
      merged.media_save_to_cloud = false;
    }
    if (!userFeatures.media_send_enabled) {
      merged.media_send_enabled = false;
    }
    if (!userFeatures.group_chat_enabled) {
      merged.group_chat_enabled = false;
    }
    if (!userFeatures.group_keyword_trigger) {
      merged.group_trigger_keyword = false;
    }

    return merged;
  } catch (err) {
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
