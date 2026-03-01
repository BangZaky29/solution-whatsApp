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
    }

    async getGeminiApiKey() {
        try {
            const { data, error } = await supabase
                .from(this.apiKeysTable)
                .select('key_value')
                .eq('is_active', true)
                .limit(1)
                .single();

            if (error) {
                if (error.code !== 'PGRST116') {
                    console.error(`❌ [ConfigService] Error getting API key:`, error.message);
                }
                return process.env.GEMINI_API_KEY || null;
            }

            return data?.key_value || process.env.GEMINI_API_KEY || null;
        } catch (err) {
            console.error(`❌ [ConfigService] Catch error getting API key:`, err.message);
            return process.env.GEMINI_API_KEY || null;
        }
    }

    async getAllApiKeys() {
        try {
            const { data, error } = await supabase
                .from(this.apiKeysTable)
                .select('*')
                .order('created_at', { ascending: false });

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

    async addApiKey(name, key) {
        return await supabase.from(this.apiKeysTable).insert({
            name,
            key_value: key,
            is_active: false
        });
    }

    async updateApiKey(id, name, key) {
        const updateData = { name };
        if (key) updateData.key_value = key;
        return await supabase.from(this.apiKeysTable).update(updateData).eq('id', id);
    }

    async removeApiKey(id) {
        return await supabase.from(this.apiKeysTable).delete().eq('id', id);
    }

    async activateApiKey(id) {
        await supabase.from(this.apiKeysTable).update({ is_active: false }).neq('id', id);
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

    async incrementStat(key) {
        try {
            const stats = await this.getSetting('global_stats') || { requests: 0, responses: 0 };
            stats[key] = (stats[key] || 0) + 1;
            await this.updateSetting('global_stats', stats);
        } catch (err) {
            console.error(`❌ [Config Error] Increment exception:`, err.message);
        }
    }

    async getSystemPrompt() {
        try {
            const { data: activePrompt, error } = await supabase
                .from(this.promptsTable)
                .select('content')
                .eq('is_active', true)
                .limit(1)
                .single();

            if (!error && activePrompt) return activePrompt.content;

            const config = await this.getSetting('system_prompt');
            return config?.text || process.env.AI_BOT_SYSTEM_PROMPT || "Anda adalah asisten AI ramah.";
        } catch (err) {
            return process.env.AI_BOT_SYSTEM_PROMPT || "Anda adalah asisten AI ramah.";
        }
    }

    async getAllPrompts() {
        const { data } = await supabase.from(this.promptsTable).select('*').order('created_at', { ascending: false });
        return data || [];
    }

    async setActivePrompt(id) {
        await supabase.from(this.promptsTable).update({ is_active: false }).neq('id', id);
        await supabase.from(this.promptsTable).update({ is_active: true }).eq('id', id);
    }

    async getTargetMode() {
        const setting = await this.getSetting('target_mode');
        return setting?.mode || 'all';
    }

    async isContactAllowed(jid) {
        const mode = await this.getTargetMode();
        if (mode === 'all') return true;

        const cleanJid = jid.includes('@') ? jid : `${jid.replace(/\D/g, '')}@s.whatsapp.net`;
        const { data, error } = await supabase
            .from(this.contactsTable)
            .select('is_allowed')
            .eq('jid', cleanJid)
            .single();

        if (error || !data) return false;
        return data.is_allowed;
    }

    async getAllowedContacts() {
        const { data } = await supabase.from(this.contactsTable).select('*').eq('is_allowed', true);
        return data || [];
    }

    async addContact(jid, name) {
        const cleanJid = jid.includes('@') ? jid : `${jid.replace(/\D/g, '')}@s.whatsapp.net`;
        return await supabase.from(this.contactsTable).upsert({ jid: cleanJid, push_name: name, is_allowed: true });
    }

    async removeContact(jid) {
        const cleanJid = jid.includes('@') ? jid : `${jid.replace(/\D/g, '')}@s.whatsapp.net`;
        return await supabase.from(this.contactsTable).delete().eq('jid', cleanJid);
    }
}

module.exports = new ConfigService();
