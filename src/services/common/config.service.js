const supabase = require('../../config/supabase');

/**
 * Config Service
 * Handles persistent configuration and global stats in Supabase
 */
class ConfigService {
    constructor() {
        this.settingsTable = 'wa_bot_settings';
        this.promptsTable = 'wa_bot_prompts';
        this.contactsTable = 'wa_bot_contacts';
        this.apiKeysTable = 'wa_bot_api_keys';
        this.userSessionsTable = 'user_sessions';
    }

    async getGeminiApiKey(userId = null) {
        try {
            // 1. Try Specific User Key
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
                        model: data.model_name || 'gemini-1.5-flash',
                        version: data.api_version || 'v1beta'
                    };
                }
            }

            // 2. Fallback to Global Key (user_id IS NULL)
            const { data: globalData, error: globalError } = await supabase
                .from(this.apiKeysTable)
                .select('key_value, model_name, api_version')
                .eq('is_active', true)
                .is('user_id', null)
                .limit(1)
                .single();

            if (!globalError && globalData) {
                return {
                    key: globalData.key_value,
                    model: globalData.model_name || 'gemini-1.5-flash',
                    version: globalData.api_version || 'v1beta'
                };
            }

            // 3. System Environment Fallback
            return {
                key: process.env.GEMINI_API_KEY || null,
                model: 'gemini-1.5-flash',
                version: 'v1beta'
            };
        } catch (err) {
            console.error(`❌ [ConfigService] Exception getting API key:`, err.message);
            return {
                key: process.env.GEMINI_API_KEY || null,
                model: 'gemini-1.5-flash',
                version: 'v1beta'
            };
        }
    }

    async getAllApiKeys(userId = null) {
        try {
            let query = supabase
                .from(this.apiKeysTable)
                .select('*')
                .order('created_at', { ascending: false });

            if (userId) {
                query = query.eq('user_id', userId);
            } else {
                query = query.is('user_id', null);
            }

            const { data, error } = await query;

            if (error) {
                console.error(`❌ [ConfigService] Error fetching all API keys:`, error.message);
                throw error;
            }
            return data || [];
        } catch (err) {
            console.error(`❌ [ConfigService] Catch error fetching API keys:`, err.message);
            return [];
        }
    }

    async addApiKey(name, key, model = 'gemini-1.5-flash', version = 'v1beta', userId = null) {
        return await supabase.from(this.apiKeysTable).insert({
            name,
            key_value: key,
            model_name: model,
            api_version: version,
            is_active: false,
            user_id: userId
        });
    }

    async updateApiKey(id, name, key, model, version, userId = null) {
        const updateData = { name };
        if (key) updateData.key_value = key;
        if (model) updateData.model_name = model;
        if (version !== undefined) updateData.api_version = version;

        let query = supabase.from(this.apiKeysTable).update(updateData).eq('id', id);
        if (userId) query = query.eq('user_id', userId);
        return await query;
    }

    async removeApiKey(id, userId = null) {
        let query = supabase.from(this.apiKeysTable).delete().eq('id', id);
        if (userId) query = query.eq('user_id', userId);
        return await query;
    }

    async activateApiKey(id, userId = null) {
        let deactivateQuery = supabase.from(this.apiKeysTable).update({ is_active: false }).neq('id', id);
        if (userId) deactivateQuery = deactivateQuery.eq('user_id', userId);
        await deactivateQuery;

        return await supabase.from(this.apiKeysTable).update({ is_active: true }).eq('id', id);
    }

    async getSetting(id) {
        try {
            const { data, error } = await supabase
                .from(this.settingsTable)
                .select('value')
                .eq('id', id)
                .single();

            if (error) {
                if (error.code === 'PGRST116') return null;
                console.error(`❌ [Config Error] Fetch failed for ${id}:`, error.message);
                return null;
            }
            return data?.value || null;
        } catch (err) {
            console.error(`❌ [Config Error] Exception:`, err.message);
            return null;
        }
    }

    async updateSetting(id, value) {
        try {
            const { error } = await supabase
                .from(this.settingsTable)
                .upsert({ id, value, updated_at: new Date().toISOString() });

            if (error) {
                console.error(`❌ [Config Error] Update failed for ${id}:`, error.message);
                return false;
            }
            return true;
        } catch (err) {
            console.error(`❌ [Config Error] Update exception:`, err.message);
            return false;
        }
    }

    async incrementStat(key, userId = null) {
        try {
            const statKey = userId ? `global_stats:${userId}` : 'global_stats';
            const stats = await this.getSetting(statKey) || { requests: 0, responses: 0 };
            stats[key] = (stats[key] || 0) + 1;
            await this.updateSetting(statKey, stats);
        } catch (err) {
            console.error(`❌ [Config Error] Increment exception:`, err.message);
        }
    }

    async getSystemPrompt(userId = null) {
        try {
            // 1. Try Specific User Prompt
            if (userId && userId !== 'null' && userId !== 'undefined') {
                const { data: userPrompt, error } = await supabase
                    .from(this.promptsTable)
                    .select('content')
                    .eq('is_active', true)
                    .eq('user_id', userId)
                    .limit(1)
                    .single();

                if (!error && userPrompt) return userPrompt.content;
            }

            // 2. Fallback to Global Prompt (user_id IS NULL)
            const { data: globalPrompt, error: globalError } = await supabase
                .from(this.promptsTable)
                .select('content')
                .eq('is_active', true)
                .is('user_id', null)
                .limit(1)
                .single();

            if (!globalError && globalPrompt) return globalPrompt.content;

            // 3. Setting Table Fallback (Legacy/Simple Mode)
            const config = await this.getSetting(userId && userId !== 'null' ? `system_prompt:${userId}` : 'system_prompt');
            if (config?.text) return config.text;

            // 4. ENV or Hardcoded Default
            return process.env.AI_BOT_SYSTEM_PROMPT || "Anda adalah asisten AI ramah.";
        } catch (err) {
            return process.env.AI_BOT_SYSTEM_PROMPT || "Anda adalah asisten AI ramah.";
        }
    }

    async getAllPrompts(userId = null) {
        let query = supabase.from(this.promptsTable).select('*').order('created_at', { ascending: false });
        if (userId) {
            query = query.eq('user_id', userId);
        } else {
            query = query.is('user_id', null);
        }
        const { data } = await query;
        return data || [];
    }

    async setActivePrompt(id, userId = null) {
        let deactivateQuery = supabase.from(this.promptsTable).update({ is_active: false }).neq('id', id);
        if (userId) {
            deactivateQuery = deactivateQuery.eq('user_id', userId);
        } else {
            deactivateQuery = deactivateQuery.is('user_id', null);
        }
        await deactivateQuery;

        return await supabase.from(this.promptsTable).update({ is_active: true }).eq('id', id);
    }

    async getTargetMode(userId = null) {
        const settingKey = userId ? `target_mode:${userId}` : 'target_mode';
        const setting = await this.getSetting(settingKey);
        return setting?.mode || 'all';
    }

    async isContactAllowed(jid, userId = null) {
        const mode = await this.getTargetMode(userId);
        if (mode === 'all') return true;

        const cleanJid = jid.includes('@') ? jid : `${jid.replace(/\D/g, '')}@s.whatsapp.net`;
        let query = supabase
            .from(this.contactsTable)
            .select('is_allowed')
            .eq('jid', cleanJid);

        if (userId) {
            query = query.eq('user_id', userId);
        } else {
            query = query.is('user_id', null);
        }
        const { data, error } = await query.single();

        if (error || !data) return false;
        return data.is_allowed;
    }

    async getAllowedContacts(userId = null) {
        let query = supabase.from(this.contactsTable).select('*').eq('is_allowed', true);
        if (userId) {
            query = query.eq('user_id', userId);
        } else {
            query = query.is('user_id', null);
        }
        const { data } = await query;
        return data || [];
    }

    async addContact(jid, name, userId = null) {
        // 1. Pastikan userId tidak null karena kolom user_id di DB adalah NOT NULL
        if (!userId) {
            console.error("❌ [ConfigService] Cannot add contact: userId is missing");
            return { error: "User ID is required for multi-user isolation" };
        }

        const cleanJid = jid.includes('@') ? jid : `${jid.replace(/\D/g, '')}@s.whatsapp.net`;

        // 2. Gunakan upsert dengan onConflict yang tepat (jid, user_id)
        return await supabase.from(this.contactsTable).upsert({
            jid: cleanJid,
            push_name: name,
            is_allowed: true,
            user_id: userId
        }, {
            onConflict: 'jid,user_id' // Pastikan tidak ada spasi setelah koma
        });
    }

    async removeContact(jid, userId = null) {
        const cleanJid = jid.includes('@') ? jid : `${jid.replace(/\D/g, '')}@s.whatsapp.net`;
        let query = supabase.from(this.contactsTable).delete().eq('jid', cleanJid);
        if (userId) {
            query = query.eq('user_id', userId);
        } else {
            query = query.is('user_id', null);
        }
        return await query;
    }

    // USER SESSIONS
    async upsertUserSession(userId, waSessionId, isPrimary = false) {
        try {
            const { error } = await supabase
                .from(this.userSessionsTable)
                .upsert({
                    user_id: userId,
                    wa_session_id: waSessionId,
                    is_primary: isPrimary,
                    created_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

            if (error) {
                console.error(`❌ [ConfigService] Error upserting user session:`, error.message);
                return false;
            }
            return true;
        } catch (err) {
            console.error(`❌ [ConfigService] Catch error upserting user session:`, err.message);
            return false;
        }
    }

    async removeUserSession(waSessionId) {
        try {
            const { error } = await supabase
                .from(this.userSessionsTable)
                .delete()
                .eq('wa_session_id', waSessionId);

            if (error) {
                console.error(`❌ [ConfigService] Error removing user session:`, error.message);
                return false;
            }
            return true;
        } catch (err) {
            console.error(`❌ [ConfigService] Catch error removing user session:`, err.message);
            return false;
        }
    }

    async getAllUserSessions() {
        try {
            const { data, error } = await supabase
                .from(this.userSessionsTable)
                .select('user_id');

            if (error) {
                console.error(`❌ [ConfigService] Error getting all user sessions:`, error.message);
                return [];
            }
            return data?.map(s => s.user_id) || [];
        } catch (err) {
            console.error(`❌ [ConfigService] Catch error getting all user sessions:`, err.message);
            return [];
        }
    }

    async getUserDisplay(userId) {
        try {
            if (!userId || userId === 'null' || userId === 'undefined') return 'System';

            const { data, error } = await supabase
                .from('users')
                .select('username, full_name')
                .eq('id', userId)
                .single();

            if (error || !data) return userId;
            return data.username || data.full_name || userId;
        } catch (err) {
            return userId;
        }
    }
}

module.exports = new ConfigService();
