const supabase = require('../../config/supabase');

/**
 * History Service
 * Handles persistence of chat history in Supabase
 */
class HistoryService {
    constructor() {
        const configService = require('./config.service'); // Note: path might need verification relative to this file
        this.useProduction = configService.useProduction;
        this.tableName = configService.getTableName('wa_chat_history');
        this.maxHistory = 100;
        this.proactiveLimit = 7;
    }

    async getHistory(jid, userId = null) {
        if (!userId || userId === 'null') return [];
        try {
            const { data, error } = await supabase
                .from(this.tableName)
                .select('history')
                .eq('jid', jid)
                .eq('user_id', userId)
                .single();

            if (error) return [];
            return data?.history || [];
        } catch (err) {
            return [];
        }
    }

    async saveMessage(jid, pushName, newMessage, userId = null) {
        if (!userId || userId === 'null') return;
        try {
            const { data: existing } = await supabase
                .from(this.tableName)
                .select('history, msg_count, proactive_count')
                .eq('jid', jid)
                .eq('user_id', userId)
                .single();

            let history = existing?.history || [];
            let msgCount = (existing?.msg_count || 0) + 1;
            let proactiveCount = existing?.proactive_count || 0;

            if (newMessage.isProactive) {
                proactiveCount += 1;
            }

            history.push({
                role: newMessage.role,
                content: newMessage.content,
                media_url: newMessage.mediaUrl || null,
                media_type: newMessage.mediaType || null,
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
                last_active: new Date().toISOString(),
                user_id: userId
            };

            await supabase
                .from(this.tableName)
                .upsert(upsertData, {
                    onConflict: 'jid,user_id'
                });
        } catch (err) {
            console.error(`❌ [History Error] Save exception:`, err.message);
        }
    }

    formatForPrompt(history) {
        if (!history || history.length === 0) return "";

        return history.map(h => {
            const role = h.role === 'user' ? 'Customer' : 'AI Assistant';
            let content = h.content;
            if (h.media_url) {
                content = `[Media ${h.media_type}: ${h.media_url}] ${content || ""}`;
            }
            return `${role}: ${content}`;
        }).join('\n');
    }

    async getAllChatStats(userId = null) {
        if (!userId || userId === 'null') return [];
        try {
            const { data, error } = await supabase
                .from(this.tableName)
                .select('jid, push_name, msg_count, last_active, history')
                .eq('user_id', userId)
                .order('last_active', { ascending: false });

            if (error) return [];

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
            return [];
        }
    }

    async clearAllHistory(userId = null) {
        if (!userId || userId === 'null') return;
        try {
            await supabase
                .from(this.tableName)
                .update({
                    history: [],
                    proactive_count: 0
                })
                .eq('user_id', userId);
        } catch (err) {
            console.error(`❌ [History Error] Cleanup exception:`, err.message);
        }
    }
}

module.exports = new HistoryService();
