const supabase = require('../../../config/supabase');

async function getUserDisplay(userId) {
    try {
        if (!userId || userId === 'null' || userId === 'undefined') return 'System';

        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!UUID_REGEX.test(userId)) {
            return userId; // Return as is for non-UUIDs (system IDs)
        }

        const { data } = await supabase.from('users').select('username, full_name').eq('id', userId).single();
        if (!data) return userId;

        const name = data.full_name || data.username || userId;
        return name;
    } catch (err) { return userId; }
}

async function getAIControls(userId = null) {
    if (!userId || userId === 'null') return { is_ai_enabled: false, is_proactive_enabled: false, response_delay_mins: 0 };
    const key = `ai_controls:${userId}`;
    const settings = await this.getSetting(key);
    return {
        is_ai_enabled: true,
        is_proactive_enabled: true,
        response_delay_mins: 0,
        ...(settings || {})
    };
}

async function updateAIControls(userId, controls) {
    if (!userId || userId === 'null') return false;
    const key = `ai_controls:${userId}`;
    return await this.updateSetting(key, controls);
}

module.exports = {
    getUserDisplay,
    getAIControls,
    updateAIControls
};
