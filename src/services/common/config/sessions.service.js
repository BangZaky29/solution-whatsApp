const supabase = require('../../../config/supabase');

async function upsertUserSession(userId, waSessionId, isPrimary = false) {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isSystemSession = !UUID_REGEX.test(userId);

    try {
        const payload = {
            wa_session_id: waSessionId,
            is_primary: isPrimary,
            updated_at: new Date().toISOString()
        };

        // If it's a UUID, it's a user session
        if (!isSystemSession) {
            payload.user_id = userId;
            return await supabase.from(this.userSessionsTable).upsert(payload, { onConflict: 'user_id' });
        } else {
            // It's a system session (like CS-BOT or main-session)
            // We use wa_session_id as the primary identifier if user_id is null/invalid
            payload.user_id = null;
            return await supabase.from(this.userSessionsTable).upsert(payload, { onConflict: 'wa_session_id' });
        }
    } catch (err) {
        console.error(`[ConfigService] upsertUserSession error:`, err.message);
        return false;
    }
}

async function removeUserSession(waSessionId) {
    try {
        return await supabase.from(this.userSessionsTable).delete().eq('wa_session_id', waSessionId);
    } catch (err) { return false; }
}

async function getAllUserSessions() {
    try {
        const { data } = await supabase.from(this.userSessionsTable).select('user_id, wa_session_id');
        // Return wa_session_id primarily, fallback to user_id (which is usually the same for AI bots)
        return data?.map(s => s.wa_session_id || s.user_id).filter(id => id) || [];
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
