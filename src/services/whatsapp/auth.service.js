const {
    initAuthCreds,
    proto
} = require('@whiskeysockets/baileys');
const supabase = require('../../config/supabase');

// UUID detection regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bufferToBase64(obj) {
    if (Buffer.isBuffer(obj)) {
        return { type: 'Buffer', data: obj.toString('base64') };
    }
    if (obj instanceof Uint8Array) {
        return { type: 'Buffer', data: Buffer.from(obj).toString('base64') };
    }
    if (Array.isArray(obj)) {
        return obj.map(item => bufferToBase64(item));
    }
    if (obj !== null && typeof obj === 'object') {
        const result = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                result[key] = bufferToBase64(obj[key]);
            }
        }
        return result;
    }
    return obj;
}

function base64ToBuffer(obj) {
    if (obj !== null && typeof obj === 'object') {
        if (obj.type === 'Buffer' && typeof obj.data === 'string') {
            return Buffer.from(obj.data, 'base64');
        }
        if (Array.isArray(obj)) {
            return obj.map(item => base64ToBuffer(item));
        }
        const result = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                result[key] = base64ToBuffer(obj[key]);
            }
        }
        return result;
    }
    return obj;
}

async function useSupabaseAuthState(sessionId = 'main-session') {
    const USE_PRODUCTION = process.env.USE_PRODUCTION_DB === 'true';

    // Determine table based on session type for better isolation and scalability
    const isAiSession = sessionId.startsWith('wa-bot-ai') || UUID_REGEX.test(sessionId);

    let TABLE_NAME;
    if (isAiSession) {
        TABLE_NAME = USE_PRODUCTION ? 'wa_ai_sessions' : 'wa_ai_sessions_local';
    } else {
        TABLE_NAME = USE_PRODUCTION ? 'wa_sessions' : 'wa_sessions_local';
    }

    // Strict key partitioning
    const getKey = (type, id) => `${sessionId}:${type}:${id}`;

    const writeData = async (type, id, value) => {
        const key = getKey(type, id);
        try {
            const { error } = await supabase.from(TABLE_NAME).upsert({
                id: key,
                value: bufferToBase64(value),
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' });

            if (error) throw error;
        } catch (err) {
            console.error(`⚠️ [${sessionId}] Exception writing ${key}:`, err.message);
        }
    };

    const readData = async (type, id) => {
        const key = getKey(type, id);
        try {
            const { data, error } = await supabase.from(TABLE_NAME).select('value').eq('id', key).single();
            if (error || !data || !data.value) return null;
            return base64ToBuffer(data.value);
        } catch (err) {
            return null;
        }
    };

    const readDataBatch = async (type, ids) => {
        try {
            const keys = ids.map(id => getKey(type, id));
            const { data, error } = await supabase.from(TABLE_NAME).select('id, value').in('id', keys);
            if (error || !data) return {};

            const results = {};
            data.forEach(row => {
                // Reconstruct the original ID by removing prefix `${sessionId}:${type}:`
                const prefix = `${sessionId}:${type}:`;
                const id = row.id.startsWith(prefix) ? row.id.substring(prefix.length) : row.id.split(':').pop();
                results[id] = base64ToBuffer(row.value);
            });
            return results;
        } catch (err) {
            console.error(`⚠️ [${sessionId}] Batch read error for ${type}:`, err.message);
            return {};
        }
    };

    const removeData = async (type, id) => {
        try {
            await supabase.from(TABLE_NAME).delete().eq('id', getKey(type, id));
        } catch (err) {
            console.error(`⚠️ [${sessionId}] Error removing ${type}:${id}:`, err.message);
        }
    };

    let creds = await readData('auth', 'creds');
    if (!creds) {
        creds = initAuthCreds();
    }

    const state = {
        creds,
        keys: {
            get: async (type, ids) => {
                const results = await readDataBatch(type, ids);

                if (type === 'app-state-sync-key') {
                    for (const id in results) {
                        if (results[id]) {
                            results[id] = proto.Message.AppStateSyncKeyData.fromObject(results[id]);
                        }
                    }
                }
                return results;
            },
            set: async (data) => {
                const upserts = [];
                const deletes = [];

                for (const type in data) {
                    for (const id in data[type]) {
                        const key = getKey(type, id);
                        if (data[type][id]) {
                            upserts.push({
                                id: key,
                                value: bufferToBase64(data[type][id]),
                                updated_at: new Date().toISOString()
                            });
                        } else {
                            deletes.push(key);
                        }
                    }
                }

                if (upserts.length > 0) {
                    const { error } = await supabase.from(TABLE_NAME).upsert(upserts, { onConflict: 'id' });
                    if (error) console.error(`❌ [${sessionId}] Batch upsert failed:`, error.message);
                }

                if (deletes.length > 0) {
                    const { error } = await supabase.from(TABLE_NAME).delete().in('id', deletes);
                    if (error) console.error(`❌ [${sessionId}] Batch delete failed:`, error.message);
                }
            }
        }
    };

    return {
        state,
        saveCreds: async () => writeData('auth', 'creds', creds),
        clearSession: async () => {
            console.log(`🧹 [${sessionId}] Clearing all session data from ${TABLE_NAME}...`);
            // Use exact prefix match to avoid affecting other sessions in the same table
            const { error } = await supabase.from(TABLE_NAME).delete().filter('id', 'like', `${sessionId}:%`);
            if (error) console.error(`❌ [${sessionId}] Clear session failed:`, error.message);
        }
    };
}

module.exports = { useSupabaseAuthState };
