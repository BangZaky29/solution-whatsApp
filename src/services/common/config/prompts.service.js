const supabase = require('../../../config/supabase');

async function getSystemPrompt(userId = null) {
    try {
        if (!userId || userId === 'null') return "Anda adalah asisten AI ramah.";

        const { data: userPrompt, error } = await supabase
            .from(this.promptsTable)
            .select('content')
            .eq('is_active', true)
            .eq('user_id', userId)
            .limit(1)
            .single();

        if (!error && userPrompt) return userPrompt.content;

        // If no user-specific active prompt is found, return the default.
        // No fallbacks to settings table or .env as per user request.
        return "Anda adalah asisten AI ramah.";
    } catch (err) {
        return "Anda adalah asisten AI ramah.";
    }
}

async function getAllPrompts(userId = null) {
    if (!userId || userId === 'null') return [];
    const { data } = await supabase
        .from(this.promptsTable)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    return data || [];
}

async function setActivePrompt(id, userId = null) {
    if (!userId || userId === 'null') return { error: "User ID required" };
    await supabase.from(this.promptsTable).update({ is_active: false }).neq('id', id).eq('user_id', userId);
    return await supabase.from(this.promptsTable).update({ is_active: true }).eq('id', id).eq('user_id', userId);
}

module.exports = {
    getSystemPrompt,
    getAllPrompts,
    setActivePrompt
};
