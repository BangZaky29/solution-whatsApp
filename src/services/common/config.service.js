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
            // Strictly filter by userId
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
                        model: data.model_name || 'gemini-2.5-flash',
                        version: data.api_version || 'v1beta'
                    };
                }
            }

            // Disable fallback to global key for strict isolation
            return {
                key: process.env.GEMINI_API_KEY || null,
                model: 'gemini-2.5-flash',
                version: 'v1beta'
            };
        } catch (err) {
            console.error(`❌ [ConfigService] Exception getting API key:`, err.message);
            return {
                key: process.env.GEMINI_API_KEY || null,
                model: 'gemini-2.5-flash',
                version: 'v1beta'
            };
        }
    }

    async getAllApiKeys(userId = null) {
        try {
            if (!userId || userId === 'null') return [];
            const { data, error } = await supabase
                .from(this.apiKeysTable)
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error(`❌ [ConfigService] Error fetching API keys:`, err.message);
            return [];
        }
    }

    async addApiKey(name, key, model = 'gemini-2.5-flash', version = 'v1beta', userId = null) {
        if (!userId || userId === 'null') return { error: "User ID required" };
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
        if (!userId || userId === 'null') return { error: "User ID required" };
        const updateData = { name };
        if (key) updateData.key_value = key;
        if (model) updateData.model_name = model;
        if (version !== undefined) updateData.api_version = version;

        return await supabase.from(this.apiKeysTable).update(updateData).eq('id', id).eq('user_id', userId);
    }

    async removeApiKey(id, userId = null) {
        if (!userId || userId === 'null') return { error: "User ID required" };
        return await supabase.from(this.apiKeysTable).delete().eq('id', id).eq('user_id', userId);
    }

    async activateApiKey(id, userId = null) {
        if (!userId || userId === 'null') return { error: "User ID required" };

        await supabase.from(this.apiKeysTable).update({ is_active: false }).neq('id', id).eq('user_id', userId);
        return await supabase.from(this.apiKeysTable).update({ is_active: true }).eq('id', id).eq('user_id', userId);
    }

    async getSetting(id) {
        try {
            const { data, error } = await supabase
                .from(this.settingsTable)
                .select('value')
                .eq('id', id)
                .single();

            if (error) return null;
            return data?.value || null;
        } catch (err) {
            return null;
        }
    }

    async updateSetting(id, value) {
        try {
            const { error } = await supabase
                .from(this.settingsTable)
                .upsert({ id, value, updated_at: new Date().toISOString() });
            return !error;
        } catch (err) {
            return false;
        }
    }

    async incrementStat(key, userId = null) {
        if (!userId || userId === 'null') return;
        try {
            const statKey = `global_stats:${userId}`;
            const stats = await this.getSetting(statKey) || { requests: 0, responses: 0 };
            stats[key] = (stats[key] || 0) + 1;
            await this.updateSetting(statKey, stats);
        } catch (err) { /* ignore */ }
    }

    async getSystemPrompt(userId = null) {
        try {
            if (!userId || userId === 'null') return process.env.AI_BOT_SYSTEM_PROMPT || "Anda adalah asisten AI ramah.";

            const { data: userPrompt, error } = await supabase
                .from(this.promptsTable)
                .select('content')
                .eq('is_active', true)
                .eq('user_id', userId)
                .limit(1)
                .single();

            if (!error && userPrompt) return userPrompt.content;

            const config = await this.getSetting(`system_prompt:${userId}`);
            return config?.text || process.env.AI_BOT_SYSTEM_PROMPT || "Anda adalah asisten AI ramah.";
        } catch (err) {
            return process.env.AI_BOT_SYSTEM_PROMPT || "Anda adalah asisten AI ramah.";
        }
    }

    async getAllPrompts(userId = null) {
        if (!userId || userId === 'null') return [];
        const { data } = await supabase.from(this.promptsTable).select('*').eq('user_id', userId).order('created_at', { ascending: false });
        return data || [];
    }

    async setActivePrompt(id, userId = null) {
        if (!userId || userId === 'null') return { error: "User ID required" };
        await supabase.from(this.promptsTable).update({ is_active: false }).neq('id', id).eq('user_id', userId);
        return await supabase.from(this.promptsTable).update({ is_active: true }).eq('id', id).eq('user_id', userId);
    }

    async getTargetMode(userId = null) {
        if (!userId || userId === 'null') return 'all';
        const settingKey = `target_mode:${userId}`;
        const setting = await this.getSetting(settingKey);
        return setting?.mode || 'all';
    }

    async isContactAllowed(jid, userId = null) {
        if (!userId || userId === 'null') return false;
        const mode = await this.getTargetMode(userId);
        if (mode === 'all') return true;

        const cleanJid = jid.includes('@') ? jid : `${jid.replace(/\D/g, '')}@s.whatsapp.net`;
        const { data, error } = await supabase
            .from(this.contactsTable)
            .select('is_allowed')
            .eq('jid', cleanJid)
            .eq('user_id', userId)
            .single();

        return !error && data?.is_allowed;
    }

    async getAllowedContacts(userId = null) {
        if (!userId || userId === 'null') return [];
        const { data } = await supabase.from(this.contactsTable).select('*').eq('is_allowed', true).eq('user_id', userId);
        return data || [];
    }

    async addContact(jid, name, userId = null) {
        if (!userId || userId === 'null') return { error: "User ID required" };
        const cleanJid = jid.includes('@') ? jid : `${jid.replace(/\D/g, '')}@s.whatsapp.net`;
        return await supabase.from(this.contactsTable).upsert({
            jid: cleanJid,
            push_name: name,
            is_allowed: true,
            user_id: userId
        }, { onConflict: 'jid,user_id' });
    }

    async removeContact(jid, userId = null) {
        if (!userId || userId === 'null') return { error: "User ID required" };
        const cleanJid = jid.includes('@') ? jid : `${jid.replace(/\D/g, '')}@s.whatsapp.net`;
        return await supabase.from(this.contactsTable).delete().eq('jid', cleanJid).eq('user_id', userId);
    }

    async upsertUserSession(userId, waSessionId, isPrimary = false) {
        try {
            return await supabase.from(this.userSessionsTable).upsert({
                user_id: userId,
                wa_session_id: waSessionId,
                is_primary: isPrimary,
                created_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
        } catch (err) { return false; }
    }

    async removeUserSession(waSessionId) {
        try {
            return await supabase.from(this.userSessionsTable).delete().eq('wa_session_id', waSessionId);
        } catch (err) { return false; }
    }

    async getAllUserSessions() {
        try {
            const { data } = await supabase.from(this.userSessionsTable).select('user_id');
            return data?.map(s => s.user_id) || [];
        } catch (err) { return []; }
    }

    async getUserDisplay(userId) {
        try {
            if (!userId || userId === 'null' || userId === 'undefined') return 'System';
            const { data } = await supabase.from('users').select('username, full_name').eq('id', userId).single();
            if (!data) return userId;
            return data.username || data.full_name || userId;
        } catch (err) { return userId; }
    }

    async getAIControls(userId = null) {
        if (!userId || userId === 'null') return { is_ai_enabled: false, is_proactive_enabled: false, response_delay_mins: 0 };
        const key = `ai_controls:${userId}`;
        const settings = await this.getSetting(key);
        return {
            is_ai_enabled: true,
            is_proactive_enabled: true,
            response_delay_mins: 0,
            ...(settings || {})
        };
    }

    async updateAIControls(userId, controls) {
        if (!userId || userId === 'null') return false;
        const key = `ai_controls:${userId}`;
        return await this.updateSetting(key, controls);
    }
}

module.exports = new ConfigService();
