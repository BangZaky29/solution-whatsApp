const geminiService = require('./gemini.service');
const whatsappService = require('../whatsapp/whatsapp.service');
const historyService = require('../common/history.service');
const configService = require('../common/config.service');
const supabase = require('../../config/supabase');

// UUID detection regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * AI Bot Service
 */
class AIBotService {
    constructor() {
        this.config = { systemPrompt: "" };
        console.log(`🤖 [AI-Bot] Service initialized for multi-user mode`);
    }

    async init() {
        // No longer a single global init
    }

    async updateConfig(newConfig, userId = null) {
        if (newConfig.systemPrompt) {
            await configService.updateSetting(userId ? `system_prompt:${userId}` : 'system_prompt', { text: newConfig.systemPrompt });
        }
    }

    async handleIncomingMessage(sessionId, socket, msg) {
        // GUIDED: If sessionId is a UUID, it's a user-specific AI session
        if (!UUID_REGEX.test(sessionId) && sessionId !== 'wa-bot-ai') return;

        const userId = UUID_REGEX.test(sessionId) ? sessionId : null;
        const remoteJid = msg.key.remoteJid;
        if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') return;

        const senderId = remoteJid.split('@')[0].split(':')[0];
        const cleanSender = senderId.replace(/\D/g, '');

        const isAllowed = await configService.isContactAllowed(remoteJid, userId);
        if (!isAllowed) {
            console.log(`🚫 [AI-Bot][${sessionId}] Sender ${cleanSender} not whitelisted.`);
            return;
        }

        const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        if (!messageText) return;

        const pushName = msg.pushName || 'User';
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        let fullMessageText = messageText;
        if (quotedMsg) {
            const contextText = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || "";
            if (contextText) fullMessageText = `(Membalas pesan: "${contextText}") ` + messageText;
        }

        console.log(`🤖 [AI-Bot][${sessionId}] Message from ${cleanSender}: "${fullMessageText}"`);

        const isPacarZaky = cleanSender.includes('6288293473765');
        let systemPrompt = await configService.getSystemPrompt(userId);
        if (isPacarZaky && !userId) { // Special logic only for global bot
            systemPrompt += " Khusus untuk orang ini, dia adalah pacar Zaky. Kamu harus ekstra ramah, sangat baik, dan perhatian.";
        }

        const history = await historyService.getHistory(remoteJid, userId);
        const formattedHistory = historyService.formatForPrompt(history);

        await socket.sendPresenceUpdate('composing', remoteJid);
        const startTime = Date.now();
        await configService.incrementStat('requests', userId);

        try {
            const activeKeyConfig = await configService.getGeminiApiKey(userId);
            const aiResponse = await geminiService.generateResponse(fullMessageText, formattedHistory, systemPrompt, {
                apiKey: activeKeyConfig.key,
                modelName: activeKeyConfig.config?.model || activeKeyConfig.model,
                apiVersion: activeKeyConfig.config?.version || activeKeyConfig.version
            });
            const latency = Date.now() - startTime;

            await whatsappService.sendTextMessage(socket, remoteJid, aiResponse);
            await configService.incrementStat('responses', userId);

            await historyService.saveMessage(remoteJid, pushName, { role: 'user', content: fullMessageText }, userId);
            await historyService.saveMessage(remoteJid, pushName, { role: 'model', content: aiResponse, latency }, userId);
            console.log(`✅ [AI-Bot][${sessionId}] Sent response to ${cleanSender}`);
        } catch (error) {
            console.error(`❌ [AI-Bot] Error:`, error.message);
        }
    }

    async checkAndSendProactiveMessage(sessionId, socket) {
        const userId = UUID_REGEX.test(sessionId) ? sessionId : null;

        try {
            let query = supabase
                .from(historyService.tableName)
                .select('*')
                .eq('last_sender', 'model')
                .lt('proactive_count', historyService.proactiveLimit);

            if (userId) query = query.eq('user_id', userId);

            const { data: candidates, error } = await query;

            if (error || !candidates) return;

            for (const session of candidates) {
                const diffMins = (new Date() - new Date(session.last_active)) / 1000 / 60;
                if (diffMins >= 10 && diffMins <= 60) {
                    const customPrompt = "Pesan otomatis nudge/percikan obrolan. " + (session.jid.includes('6288293473765') ? "Pacar Zaky, buat baper/manja." : "AI Ramah.");

                    const activeKeyConfig = await configService.getGeminiApiKey(userId);
                    const aiResponse = await geminiService.generateResponse("...", historyService.formatForPrompt(session.history), customPrompt, {
                        apiKey: activeKeyConfig.key,
                        modelName: activeKeyConfig.model,
                        apiVersion: activeKeyConfig.version
                    });

                    await whatsappService.sendTextMessage(socket, session.jid, aiResponse);
                    await historyService.saveMessage(session.jid, session.push_name, { role: 'model', content: aiResponse, isProactive: true }, userId);
                }
            }
        } catch (err) {
            console.error(`❌ [AI-Bot] Proactive error:`, err.message);
        }
    }
}

module.exports = new AIBotService();
