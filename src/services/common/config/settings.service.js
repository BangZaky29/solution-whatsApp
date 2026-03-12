const supabase = require('../../../config/supabase');

async function getSetting(id) {
    try {
        const { data, error } = await supabase
            .from(this.settingsTable)
            .select('value')
            .eq('id', id)
            .single();

        if (error) return null;
        return data?.value || null;
    } catch (err) {
        return null;
    }
}

async function updateSetting(id, value) {
    try {
        const { error } = await supabase
            .from(this.settingsTable)
            .upsert({ id, value, updated_at: new Date().toISOString() });
        return !error;
    } catch (err) {
        return false;
    }
}

async function incrementStat(key, userId = null) {
    if (!userId || userId === 'null') return;
    try {
        const statKey = `global_stats:${userId}`;
        const stats = await this.getSetting(statKey) || { requests: 0, responses: 0 };
        stats[key] = (stats[key] || 0) + 1;
        await this.updateSetting(statKey, stats);
    } catch (err) {
        // ignore
    }
}

module.exports = {
    getSetting,
    updateSetting,
    incrementStat
};
