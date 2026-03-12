const supabase = require('../../../config/supabase');

async function getGeminiApiKey(userId = null) {
    try {
        // Strictly filter by userId
        if (userId && userId !== 'null' && userId !== 'undefined') {
            const { data, error } = await supabase
                .from(this.apiKeysTable)
                .select('key_value, model_name, api_version')
                .eq('is_active', true)
                .eq('user_id', userId)
                .limit(1)
                .single();

            if (!error && data) {
                return {
                    key: data.key_value,
                    model: data.model_name || 'gemini-2.5-flash',
                    version: data.api_version || 'v1beta'
                };
            }
        }

        // Strictly return null if no user-specific key is found. No fallbacks to .env allowed as per user request.
        return {
            key: null,
            model: 'gemini-2.5-flash',
            version: 'v1beta'
        };
    } catch (err) {
        console.error(`[ConfigService] Exception getting API key:`, err.message);
        return {
            key: null,
            model: 'gemini-2.5-flash',
            version: 'v1beta'
        };
    }
}

async function getAllApiKeys(userId = null) {
    try {
        if (!userId || userId === 'null') return [];
        const { data, error } = await supabase
            .from(this.apiKeysTable)
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error(`[ConfigService] Error fetching API keys:`, err.message);
        return [];
    }
}

async function addApiKey(name, key, model = 'gemini-2.5-flash', version = 'v1beta', userId = null) {
    if (!userId || userId === 'null') return { error: "User ID required" };
    return await supabase.from(this.apiKeysTable).insert({
        name,
        key_value: key,
        model_name: model,
        api_version: version,
        is_active: false,
        user_id: userId
    });
}

async function updateApiKey(id, name, key, model, version, userId = null) {
    if (!userId || userId === 'null') return { error: "User ID required" };
    const updateData = { name };
    if (key) updateData.key_value = key;
    if (model) updateData.model_name = model;
    if (version !== undefined) updateData.api_version = version;

    return await supabase.from(this.apiKeysTable).update(updateData).eq('id', id).eq('user_id', userId);
}

async function removeApiKey(id, userId = null) {
    if (!userId || userId === 'null') return { error: "User ID required" };
    return await supabase.from(this.apiKeysTable).delete().eq('id', id).eq('user_id', userId);
}

async function activateApiKey(id, userId = null) {
    if (!userId || userId === 'null') return { error: "User ID required" };

    await supabase.from(this.apiKeysTable).update({ is_active: false }).neq('id', id).eq('user_id', userId);
    return await supabase.from(this.apiKeysTable).update({ is_active: true }).eq('id', id).eq('user_id', userId);
}

module.exports = {
    getGeminiApiKey,
    getAllApiKeys,
    addApiKey,
    updateApiKey,
    removeApiKey,
    activateApiKey
};
