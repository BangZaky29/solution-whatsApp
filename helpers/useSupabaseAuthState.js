/**
 * ============================================
 * useSupabaseAuthState.js
 * ============================================
 * 
 * CRITICAL HELPER: Custom authentication state handler for Baileys
 * that stores session data in Supabase instead of the local filesystem.
 * 
 * WHY THIS IS NEEDED:
 * - Baileys normally uses `useMultiFileAuthState` which stores auth in local files
 * - This doesn't work for serverless/Docker deployments where filesystem is ephemeral
 * - We need to persist auth state in Supabase so sessions survive restarts
 * 
 * BUFFER SERIALIZATION:
 * - Baileys auth keys contain Node.js Buffer objects
 * - Supabase JSONB cannot store raw Buffers
 * - Solution: Convert Buffers to { type: 'Buffer', data: '<base64>' } before saving
 * - Convert back to actual Buffers when reading
 */

const { createClient } = require('@supabase/supabase-js');
const { proto } = require('@whiskeysockets/baileys');
const { initAuthCreds } = require('@whiskeysockets/baileys');

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

/**
 * Recursively converts Buffer objects to a serializable format
 * This is crucial because:
 * 1. Node.js Buffers are binary data containers
 * 2. JSON.stringify cannot properly serialize Buffers
 * 3. Supabase JSONB needs JSON-compatible data
 * 
 * @param {any} obj - Object that may contain Buffer instances
 * @returns {any} - Object with Buffers converted to { type: 'Buffer', data: '<base64>' }
 */
function bufferToBase64(obj) {
    if (Buffer.isBuffer(obj)) {
        // Convert Buffer to our serializable format
        return {
            type: 'Buffer',
            data: obj.toString('base64')
        };
    }

    if (obj instanceof Uint8Array) {
        // Uint8Array is also common in Baileys
        return {
            type: 'Buffer',
            data: Buffer.from(obj).toString('base64')
        };
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

/**
 * Recursively converts our serialized format back to Buffer objects
 * This reverses the bufferToBase64 transformation
 * 
 * @param {any} obj - Object that may contain serialized Buffers
 * @returns {any} - Object with serialized Buffers restored to actual Buffers
 */
function base64ToBuffer(obj) {
    if (obj !== null && typeof obj === 'object') {
        // Check if this is our serialized Buffer format
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

/**
 * Main authentication state handler for Supabase
 * Mimics Baileys' useMultiFileAuthState but uses Supabase as storage
 * 
 * @param {string} sessionId - Unique identifier for this session
 * @returns {Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }>}
 */
async function useSupabaseAuthState(sessionId = 'main-session') {
    /**
     * Generates the database key for a given data type and ID
     * This prefixes keys with sessionId to support multiple sessions
     */
    const getKey = (type, id) => {
        return `${sessionId}:${type}:${id}`;
    };

    /**
     * Writes data to Supabase
     * Handles Buffer serialization automatically
     */
    const writeData = async (type, id, value) => {
        const key = getKey(type, id);
        const serializedValue = bufferToBase64(value);

        try {
            const { error } = await supabase
                .from('wa_sessions')
                .upsert({
                    id: key,
                    value: serializedValue
                }, {
                    onConflict: 'id'
                });

            if (error) {
                console.error(`⚠️ Error writing ${key}:`, error.message);
                console.error(`   Hint: Run "ALTER TABLE wa_sessions DISABLE ROW LEVEL SECURITY;" in Supabase SQL Editor`);
                // Don't throw - allow connection to continue
            }
        } catch (err) {
            console.error(`⚠️ Exception writing ${key}:`, err.message);
        }
    };

    /**
     * Reads data from Supabase
     * Handles Buffer deserialization automatically
     */
    const readData = async (type, id) => {
        const key = getKey(type, id);

        const { data, error } = await supabase
            .from('wa_sessions')
            .select('value')
            .eq('id', key)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No rows returned - this is normal for first run
                return null;
            }
            console.error(`Error reading ${key}:`, error);
            return null;
        }

        if (!data || !data.value) {
            return null;
        }

        // Deserialize Buffers back from Base64
        return base64ToBuffer(data.value);
    };

    /**
     * Removes data from Supabase
     */
    const removeData = async (type, id) => {
        const key = getKey(type, id);

        const { error } = await supabase
            .from('wa_sessions')
            .delete()
            .eq('id', key);

        if (error) {
            console.error(`Error removing ${key}:`, error);
        }
    };

    /**
     * Removes all data for a specific type (used for bulk cleanup)
     */
    const removeDataByPrefix = async (prefix) => {
        const fullPrefix = `${sessionId}:${prefix}`;

        const { error } = await supabase
            .from('wa_sessions')
            .delete()
            .like('id', `${fullPrefix}%`);

        if (error) {
            console.error(`Error removing by prefix ${fullPrefix}:`, error);
        }
    };

    // ============================================
    // Initialize authentication credentials
    // ============================================

    // Try to load existing credentials from Supabase
    let creds = await readData('auth', 'creds');

    if (!creds) {
        // First run - generate new credentials
        console.log('📱 No existing credentials found, generating new ones...');
        creds = initAuthCreds();
    } else {
        console.log('📱 Loaded existing credentials from Supabase');
    }

    // ============================================
    // Build the authentication state object
    // ============================================

    const state = {
        creds,
        keys: {
            /**
             * Get multiple keys by type and IDs
             * @param {string} type - Key type (pre-key, session, sender-key, etc.)
             * @param {string[]} ids - Array of key IDs
             */
            get: async (type, ids) => {
                const result = {};

                for (const id of ids) {
                    let data = await readData(type, id);

                    if (data && type === 'app-state-sync-key') {
                        // App state sync keys need special protobuf handling
                        data = proto.Message.AppStateSyncKeyData.fromObject(data);
                    }

                    result[id] = data;
                }

                return result;
            },

            /**
             * Set multiple keys by type
             * @param {object} data - Object with key types as keys, and { id: value } objects as values
             */
            set: async (data) => {
                for (const type in data) {
                    for (const id in data[type]) {
                        const value = data[type][id];

                        if (value) {
                            await writeData(type, id, value);
                        } else {
                            // null/undefined means delete
                            await removeData(type, id);
                        }
                    }
                }
            }
        }
    };

    // ============================================
    // Return state and saveCreds function
    // ============================================

    return {
        state,
        /**
         * Save credentials to Supabase
         * Called by Baileys whenever credentials are updated
         */
        saveCreds: async () => {
            await writeData('auth', 'creds', creds);
            console.log('💾 Credentials saved to Supabase');
        },
        /**
         * Clear all session data (for logout)
         */
        clearSession: async () => {
            // Delete all data with this session prefix
            const { error } = await supabase
                .from('wa_sessions')
                .delete()
                .like('id', `${sessionId}:%`);

            if (error) {
                console.error('Error clearing session:', error);
                throw error;
            }
            console.log('🗑️ Session cleared from Supabase');
        }
    };
}

module.exports = { useSupabaseAuthState };
