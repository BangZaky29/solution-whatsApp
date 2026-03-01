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
            let query = supabase
                .from(this.apiKeysTable)
                .select('key_value, model_name, api_version')
                .eq('is_active', true);

            if (userId) query = query.eq('user_id', userId);

            const { data, error } = await query.limit(1).single();

            if (error) {
                if (error.code !== 'PGRST116') {
                    console.error(`❌ [ConfigService] Error getting API key for ${userId || 'global'}:`, error.message);
                }
                return {
                    key: process.env.GEMINI_API_KEY || null,
                    model: 'gemini-1.5-flash',
                    version: 'v1beta'
                };
            }

            return {
                key: data?.key_value || process.env.GEMINI_API_KEY || null,
                model: data?.model_name || 'gemini-1.5-flash',
                version: data?.api_version || 'v1beta'
            };
        } catch (err) {
            console.error(`❌ [ConfigService] Catch error getting API key:`, err.message);
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

            if (userId) query = query.eq('user_id', userId);

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
            let query = supabase
                .from(this.promptsTable)
                .select('content')
                .eq('is_active', true);

            if (userId) query = query.eq('user_id', userId);

            const { data: activePrompt, error } = await query.limit(1).single();

            if (!error && activePrompt) return activePrompt.content;

            const config = await this.getSetting(userId ? `system_prompt:${userId}` : 'system_prompt');
            return config?.text || process.env.AI_BOT_SYSTEM_PROMPT || "Anda adalah asisten AI ramah.";
        } catch (err) {
            return process.env.AI_BOT_SYSTEM_PROMPT || "Anda adalah asisten AI ramah.";
        }
    }

    async getAllPrompts(userId = null) {
        let query = supabase.from(this.promptsTable).select('*').order('created_at', { ascending: false });
        if (userId) query = query.eq('user_id', userId);
        const { data } = await query;
        return data || [];
    }

    async setActivePrompt(id, userId = null) {
        let deactivateQuery = supabase.from(this.promptsTable).update({ is_active: false }).neq('id', id);
        if (userId) deactivateQuery = deactivateQuery.eq('user_id', userId);
        await deactivateQuery;

        return await supabase.from(this.promptsTable).update({ is_active: true }).eq('id', id);
    }

    async getTargetMode() {
        const setting = await this.getSetting('target_mode');
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

        if (userId) query = query.eq('user_id', userId);

        const { data, error } = await query.single();

        if (error || !data) return false;
        return data.is_allowed;
    }

    async getAllowedContacts(userId = null) {
        let query = supabase.from(this.contactsTable).select('*').eq('is_allowed', true);
        if (userId) query = query.eq('user_id', userId);
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
        if (userId) query = query.eq('user_id', userId);
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
                }, { onConflict: 'user_id, wa_session_id' });

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
}

module.exports = new ConfigService();
