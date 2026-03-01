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
    const TABLE_NAME = USE_PRODUCTION ? 'wa_sessions' : 'wa_sessions_local';

    const getKey = (type, id) => `${sessionId}:${type}:${id}`;

    const writeData = async (type, id, value) => {
        const key = getKey(type, id);
        try {
            await supabase.from(TABLE_NAME).upsert({
                id: key,
                value: bufferToBase64(value)
            }, { onConflict: 'id' });
        } catch (err) {
            console.error(`⚠️ Exception writing ${key}:`, err.message);
        }
    };

    const readData = async (type, id) => {
        const key = getKey(type, id);
        const { data, error } = await supabase.from(TABLE_NAME).select('value').eq('id', key).single();
        if (error || !data || !data.value) return null;
        return base64ToBuffer(data.value);
    };

    const removeData = async (type, id) => {
        await supabase.from(TABLE_NAME).delete().eq('id', getKey(type, id));
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
            await supabase.from(TABLE_NAME).delete().like('id', `${sessionId}:%`);
        }
    };
}

module.exports = { useSupabaseAuthState };
