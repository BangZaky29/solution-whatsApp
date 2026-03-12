const supabase = require('../../../config/supabase');

async function getTargetMode(userId = null) {
    if (!userId || userId === 'null') return 'all';
    const settingKey = `target_mode:${userId}`;
    const setting = await this.getSetting(settingKey);
    return setting?.mode || 'all';
}

async function isContactAllowed(jid, userId = null) {
    if (!userId || userId === 'null') return false;
    const mode = await this.getTargetMode(userId);
    if (mode === 'all') return true;

    const incomingId = jid.split('@')[0];

    // Fetch all allowed contacts for this user to perform a robust ID-part comparison
    const { data, error } = await supabase
        .from(this.contactsTable)
        .select('jid, is_allowed')
        .eq('user_id', userId)
        .eq('is_allowed', true);

    if (error || !data) return false;

    const isTargetGroup = jid.endsWith('@g.us');
    return data.some(contact => {
        const dbId = contact.jid.split('@')[0];
        const isMatch = contact.jid === jid || (!isTargetGroup && dbId === incomingId);
        return isMatch;
    });
}

async function getAllowedContacts(userId = null) {
    if (!userId || userId === 'null') return [];
    const { data } = await supabase
        .from(this.contactsTable)
        .select('*')
        .eq('user_id', userId)
        .eq('is_allowed', true);
    return data || [];
}

async function addContact(jid, name, userId = null) {
    if (!userId || userId === 'null') return { error: "User ID required" };
    const cleanJid = jid.includes('@') ? jid : `${jid.replace(/\D/g, '')}@s.whatsapp.net`;
    return await supabase.from(this.contactsTable).upsert({
        jid: cleanJid,
        push_name: name,
        is_allowed: true,
        user_id: userId
    }, { onConflict: 'jid,user_id' });
}

async function removeContact(jid, userId = null) {
    if (!userId || userId === 'null') return { error: "User ID required" };
    const cleanJid = jid.includes('@') ? jid : `${jid.replace(/\D/g, '')}@s.whatsapp.net`;
    return await supabase.from(this.contactsTable).delete().eq('jid', cleanJid).eq('user_id', userId);
}

module.exports = {
    getTargetMode,
    isContactAllowed,
    getAllowedContacts,
    addContact,
    removeContact
};
