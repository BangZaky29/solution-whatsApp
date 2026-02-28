const supabase = require('./supabase.helper');

/**
 * History Helper
 * Handles persistence of chat history in Supabase
 */
class HistoryHelper {
    constructor() {
        this.useProduction = process.env.USE_PRODUCTION_DB === 'true';
        this.tableName = this.useProduction ? 'wa_chat_history' : 'wa_chat_history_local';
        this.maxHistory = 20; // Keep last 20 messages
        this.proactiveLimit = 7; // Max nudges per user
    }

    /**
     * Get chat history for a JID
     * @param {string} jid - WhatsApp JID
     * @returns {Promise<Array>} - Array of messages
     */
    async getHistory(jid) {
        try {
            const { data, error } = await supabase
                .from(this.tableName)
                .select('history')
                .eq('jid', jid)
                .single();

            if (error) {
                if (error.code === 'PGRST116') return []; // Not found
                console.error(`❌ [History Error] Fetch failed for ${jid}:`, error.message);
                return [];
            }

            return data?.history || [];
        } catch (err) {
            console.error(`❌ [History Error] Exception:`, err.message);
            return [];
        }
    }

    /**
     * Save/Update chat history
     * @param {string} jid - WhatsApp JID
     * @param {string} pushName - User's WhatsApp name
     * @param {object} newMessage - { role: 'user'|'model', content: string }
     */
    async saveMessage(jid, pushName, newMessage) {
        try {
            // 1. Get current data
            const { data: existing } = await supabase
                .from(this.tableName)
                .select('history, msg_count, proactive_count')
                .eq('jid', jid)
                .single();

            let history = existing?.history || [];
            let msgCount = (existing?.msg_count || 0) + 1;
            let proactiveCount = existing?.proactive_count || 0;

            // If bot sends message without user prompt (nudge)
            if (newMessage.isProactive) {
                proactiveCount += 1;
            }

            // 2. Append and Limit
            history.push({
                role: newMessage.role,
                content: newMessage.content,
                is_proactive: newMessage.isProactive || false,
                timestamp: new Date().toISOString()
            });

            if (history.length > this.maxHistory) {
                history = history.slice(-this.maxHistory);
            }

            // 3. Upsert
            const { error } = await supabase
                .from(this.tableName)
                .upsert({
                    jid: jid,
                    push_name: pushName || 'Unknown User',
                    history: history,
                    msg_count: msgCount,
                    proactive_count: proactiveCount,
                    last_sender: newMessage.role,
                    last_active: new Date().toISOString()
                }, {
                    onConflict: 'jid'
                });

            if (error) {
                console.error(`❌ [History Error] Upsert failed for ${jid}:`, error.message);
            }
        } catch (err) {
            console.error(`❌ [History Error] Save exception:`, err.message);
        }
    }

    /**
     * Format history for Gemini multimodality / chat context
     * @param {Array} history 
     * @returns {string} - Formatted history string
     */
    formatForPrompt(history) {
        if (!history || history.length === 0) return "";

        return history.map(h => {
            const role = h.role === 'user' ? 'Customer' : 'AI Assistant';
            return `${role}: ${h.content}`;
        }).join('\n');
    }

    /**
     * Get statistics for all chats (for dashboard)
     * @returns {Promise<Array>}
     */
    async getAllChatStats() {
        try {
            const { data, error } = await supabase
                .from(this.tableName)
                .select('jid, push_name, msg_count, last_active')
                .order('last_active', { ascending: false });

            if (error) {
                console.error(`❌ [History Error] Stats fetch failed:`, error.message);
                return [];
            }

            return data || [];
        } catch (err) {
            console.error(`❌ [History Error] Stats exception:`, err.message);
            return [];
        }
    }

    /**
     * Clear all history (Storage Cleanup)
     * Resets history to [] for all users every 24 hours
     */
    async clearAllHistory() {
        try {
            console.log(`🧹 [History] Starting 24h storage cleanup...`);
            const { error } = await supabase
                .from(this.tableName)
                .update({
                    history: [],
                    proactive_count: 0
                })
                .neq('jid', ''); // Target all records

            if (error) {
                console.error(`❌ [History Error] Cleanup failed:`, error.message);
            } else {
                console.log(`✅ [History] Storage cleanup successful!`);
            }
        } catch (err) {
            console.error(`❌ [History Error] Cleanup exception:`, err.message);
        }
    }
}

module.exports = new HistoryHelper();
