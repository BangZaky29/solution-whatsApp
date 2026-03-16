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

    // ── STRICT GATING ──
    // If NOT a moderator, we force features to false if not in the user's package features
    if (!isModerator) {
      // 1. Basic AI Access
      if (!userFeatures.has_subscription && !merged.is_ai_enabled) {
          // If no sub and user hasn't explicitly enabled it (which they shouldn't be able to easily)
          // keep it off. But we usually allow is_ai_enabled if they have some prompts left.
      }

      // 2. Proactive Features
      if (!userFeatures.proactive_enabled) {
        merged.is_proactive_enabled = false;
      }
      
      // 3. Media Features
      if (!userFeatures.media_receive_enabled) {
        merged.media_receive_enabled = false;
      }
      if (!userFeatures.media_save_enabled) {
        merged.media_save_to_cloud = false;
      }
      if (!userFeatures.media_send_enabled) {
        merged.media_send_enabled = false;
      }

      // 4. Group Features
      if (!userFeatures.group_chat_enabled) {
        merged.group_chat_enabled = false;
      }
      if (!userFeatures.group_keyword_trigger) {
        merged.group_trigger_keyword = false;
      }

      // 5. History / Memory
      if (userFeatures.history_retention_days === 0) {
        merged.history_enabled = false;
        merged.history_max_messages = 0;
      } else {
        // CAP or INITIALIZE history messages by package limit
        const maxMsgs = userFeatures.max_history_messages || 1000;
        if (merged.history_max_messages <= 0) {
            merged.history_max_messages = 20; // Default small memory if not configured
        }
        if (merged.history_max_messages > maxMsgs) {
            merged.history_max_messages = maxMsgs;
        }
      }
    } else {
        // MODERATOR BYPASS: Ensure AI is enabled by default for moderators if not set
        if (settings === null) {
            merged.is_ai_enabled = true;
            merged.group_chat_enabled = true;
            merged.media_receive_enabled = true;
            merged.history_enabled = true;
            merged.history_max_messages = 20;
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
