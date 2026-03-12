const supabase = require('../../../config/supabase');

async function logBlockedAttempt(jid, pushName, userId = null) {
    if (!userId || userId === 'null') return;
    try {
        await supabase
            .from(this.blockedAttemptsTable)
            .upsert({
                user_id: userId,
                jid: jid,
                push_name: pushName,
                attempted_at: new Date().toISOString()
            }, { onConflict: 'user_id,jid' });
    } catch (err) { /* ignore */ }
}

async function getBlockedAttempts(userId = null) {
    if (!userId || userId === 'null') return [];
    try {
        const { data } = await supabase
            .from(this.blockedAttemptsTable)
            .select('*')
            .eq('user_id', userId)
            .order('attempted_at', { ascending: false });
        return data || [];
    } catch (err) { return []; }
}

async function deleteBlockedAttempt(jid, userId = null) {
    if (!userId || userId === 'null') return;
    try {
        await supabase
            .from(this.blockedAttemptsTable)
            .delete()
            .eq('user_id', userId)
            .eq('jid', jid);
    } catch (err) { /* ignore */ }
}

module.exports = {
    logBlockedAttempt,
    getBlockedAttempts,
    deleteBlockedAttempt
};
