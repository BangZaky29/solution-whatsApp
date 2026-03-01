const supabase = require('../../config/supabase');

/**
 * History Service
 * Handles persistence of chat history in Supabase
 */
class HistoryService {
    constructor() {
        this.useProduction = process.env.USE_PRODUCTION_DB === 'true';
        this.tableName = this.useProduction ? 'wa_chat_history' : 'wa_chat_history_local';
        this.maxHistory = 100;
        this.proactiveLimit = 7;
    }

    async getHistory(jid, userId = null) {
        try {
            let query = supabase
                .from(this.tableName)
                .select('history')
                .eq('jid', jid);

            if (userId) query = query.eq('user_id', userId);

            const { data, error } = await query.single();

            if (error) {
                if (error.code === 'PGRST116') return [];
                console.error(`❌ [History Error] Fetch failed for ${jid}${userId ? ` (User: ${userId})` : ''}:`, error.message);
                return [];
            }
            return data?.history || [];
        } catch (err) {
            console.error(`❌ [History Error] Exception:`, err.message);
            return [];
        }
    }

    async saveMessage(jid, pushName, newMessage, userId = null) {
        try {
            let query = supabase
                .from(this.tableName)
                .select('history, msg_count, proactive_count')
                .eq('jid', jid);

            if (userId) query = query.eq('user_id', userId);

            const { data: existing } = await query.single();

            let history = existing?.history || [];
            let msgCount = (existing?.msg_count || 0) + 1;
            let proactiveCount = existing?.proactive_count || 0;

            if (newMessage.isProactive) {
                proactiveCount += 1;
            }

            history.push({
                role: newMessage.role,
                content: newMessage.content,
                is_proactive: newMessage.isProactive || false,
                latency: newMessage.latency || null,
                timestamp: new Date().toISOString()
            });

            if (history.length > this.maxHistory) {
                history = history.slice(-this.maxHistory);
            }

            const upsertData = {
                jid: jid,
                push_name: pushName || 'Unknown User',
                history: history,
                msg_count: msgCount,
                proactive_count: proactiveCount,
                last_sender: newMessage.role,
                last_active: new Date().toISOString()
            };

            if (userId) upsertData.user_id = userId;

            const { error } = await supabase
                .from(this.tableName)
                .upsert(upsertData, {
                    onConflict: userId ? 'jid, user_id' : 'jid'
                });

            if (error) {
                console.error(`❌ [History Error] Upsert failed for ${jid}:`, error.message);
            }
        } catch (err) {
            console.error(`❌ [History Error] Save exception:`, err.message);
        }
    }

    formatForPrompt(history) {
        if (!history || history.length === 0) return "";

        return history.map(h => {
            const role = h.role === 'user' ? 'Customer' : 'AI Assistant';
            return `${role}: ${h.content}`;
        }).join('\n');
    }

    async getAllChatStats(userId = null) {
        try {
            let query = supabase
                .from(this.tableName)
                .select('jid, push_name, msg_count, last_active, history')
                .order('last_active', { ascending: false });

            if (userId) query = query.eq('user_id', userId);

            const { data, error } = await query;

            if (error) {
                console.error(`❌ [History Error] Stats fetch failed:`, error.message);
                return [];
            }

            return (data || []).map(chat => {
                const history = chat.history || [];
                const lastModelMsg = [...history].reverse().find(h => h.role === 'model');

                return {
                    jid: chat.jid,
                    push_name: chat.push_name,
                    msg_count: chat.msg_count,
                    last_active: chat.last_active,
                    last_latency: lastModelMsg?.latency || null
                };
            });
        } catch (err) {
            console.error(`❌ [History Error] Stats exception:`, err.message);
            return [];
        }
    }

    async clearAllHistory(userId = null) {
        try {
            console.log(`🧹 [History] Starting cleanup...`);
            let query = supabase
                .from(this.tableName)
                .update({
                    history: [],
                    proactive_count: 0
                })
                .neq('jid', '');

            if (userId) query = query.eq('user_id', userId);

            const { error } = await query;

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

module.exports = new HistoryService();
