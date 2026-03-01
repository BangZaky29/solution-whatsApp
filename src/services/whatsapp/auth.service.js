const {
    initAuthCreds,
    proto
} = require('@whiskeysockets/baileys');
const supabase = require('../../config/supabase');

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
    let TABLE_NAME;
    if (sessionId.startsWith('wa-bot-ai')) {
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
                const result = {};
                for (const id of ids) {
                    let data = await readData(type, id);
                    if (data && type === 'app-state-sync-key') {
                        data = proto.Message.AppStateSyncKeyData.fromObject(data);
                    }
                    result[id] = data;
                }
                return result;
            },
            set: async (data) => {
                for (const type in data) {
                    for (const id in data[type]) {
                        if (data[type][id]) await writeData(type, id, data[type][id]);
                        else await removeData(type, id);
                    }
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
