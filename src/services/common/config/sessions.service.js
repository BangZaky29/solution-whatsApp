const supabase = require('../../../config/supabase');

async function upsertUserSession(userId, waSessionId, isPrimary = false) {
    try {
        return await supabase.from(this.userSessionsTable).upsert({
            user_id: userId,
            wa_session_id: waSessionId,
            is_primary: isPrimary,
            created_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
    } catch (err) { return false; }
}

async function removeUserSession(waSessionId) {
    try {
        return await supabase.from(this.userSessionsTable).delete().eq('wa_session_id', waSessionId);
    } catch (err) { return false; }
}

async function getAllUserSessions() {
    try {
        const { data } = await supabase.from(this.userSessionsTable).select('user_id');
        return data?.map(s => s.user_id) || [];
    } catch (err) { return []; }
}

async function getEnrichedAIInstances() {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    try {
        // Attempt 1: Auto-join via Supabase
        const { data, error } = await supabase
            .from(this.userSessionsTable)
            .select(`
                    user_id,
                    wa_session_id,
                    is_primary,
                    created_at,
                    users (
                        full_name,
                        email,
                        phone,
                        role,
                        username
                    )
                `);

        if (!error && data) return data;

        // Attempt 2: Manual fallback (if join fails or relationship is missing)
        console.warn(`[ConfigService] Falling back to manual join for enriched instances...`);

        const { data: rawSessions, error: sErr } = await supabase
            .from(this.userSessionsTable)
            .select('*');

        if (sErr || !rawSessions) throw sErr || new Error('Failed to fetch sessions');

        const userIds = rawSessions
            .map(s => s.user_id)
            .filter(id => UUID_REGEX.test(id));

        if (userIds.length === 0) {
            return rawSessions.map(s => ({ ...s, users: null }));
        }

        const { data: users } = await supabase
            .from('users')
            .select('id, full_name, email, phone, role, username')
            .in('id', userIds);

        return rawSessions.map(s => ({
            ...s,
            users: users?.find(u => u.id === s.user_id) || null
        }));

    } catch (err) {
        console.error(`[ConfigService] getEnrichedAIInstances ultimate failure:`, err.message);
        // Last resort: Return raw sessions without user data
        try {
            const { data } = await supabase.from(this.userSessionsTable).select('*');
            return data?.map(s => ({ ...s, users: null })) || [];
        } catch (e) { return []; }
    }
}

module.exports = {
    upsertUserSession,
    removeUserSession,
    getAllUserSessions,
    getEnrichedAIInstances
};
