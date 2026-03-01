const geminiService = require('./gemini.service');
const whatsappService = require('../whatsapp/whatsapp.service');
const historyService = require('../common/history.service');
const configService = require('../common/config.service');
const supabase = require('../../config/supabase');

/**
 * AI Bot Service
 */
class AIBotService {
    constructor() {
        this.botSessionId = 'wa-bot-ai';
        this.config = { systemPrompt: "" };
        this.init();
        console.log(`🤖 [AI-Bot] Service initialized for session: ${this.botSessionId}`);
    }

    async init() {
        this.config.systemPrompt = await configService.getSystemPrompt();
    }

    async updateConfig(newConfig) {
        if (newConfig.systemPrompt) {
            this.config.systemPrompt = newConfig.systemPrompt;
            await configService.updateSetting('system_prompt', { text: newConfig.systemPrompt });
        }
    }

    async handleIncomingMessage(sessionId, socket, msg) {
        if (sessionId !== this.botSessionId) return;
        const remoteJid = msg.key.remoteJid;
        if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') return;

        const senderId = remoteJid.split('@')[0].split(':')[0];
        const cleanSender = senderId.replace(/\D/g, '');

        const isAllowed = await configService.isContactAllowed(remoteJid);
        if (!isAllowed) {
            console.log(`🚫 [AI-Bot] Sender ${cleanSender} not whitelisted.`);
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

        console.log(`🤖 [AI-Bot] Message from ${cleanSender}: "${fullMessageText}"`);

        const isPacarZaky = cleanSender.includes('6288293473765');
        let systemPrompt = await configService.getSystemPrompt();
        if (isPacarZaky) {
            systemPrompt += " Khusus untuk orang ini, dia adalah pacar Zaky. Kamu harus ekstra ramah, sangat baik, dan perhatian.";
        }

        const history = await historyService.getHistory(remoteJid);
        const formattedHistory = historyService.formatForPrompt(history);

        await socket.sendPresenceUpdate('composing', remoteJid);
        const startTime = Date.now();
        await configService.incrementStat('requests');

        try {
            const activeKey = await configService.getGeminiApiKey();
            const aiResponse = await geminiService.generateResponse(fullMessageText, formattedHistory, systemPrompt, activeKey);
            const latency = Date.now() - startTime;

            await whatsappService.sendTextMessage(socket, remoteJid, aiResponse);
            await configService.incrementStat('responses');

            await historyService.saveMessage(remoteJid, pushName, { role: 'user', content: fullMessageText });
            await historyService.saveMessage(remoteJid, pushName, { role: 'model', content: aiResponse, latency });
            console.log(`✅ [AI-Bot] Sent response to ${cleanSender}`);
        } catch (error) {
            console.error(`❌ [AI-Bot] Error:`, error.message);
        }
    }

    async checkAndSendProactiveMessage(socket) {
        try {
            const { data: candidates, error } = await supabase
                .from(historyService.tableName)
                .select('*')
                .eq('last_sender', 'model')
                .lt('proactive_count', historyService.proactiveLimit);

            if (error || !candidates) return;

            for (const session of candidates) {
                const diffMins = (new Date() - new Date(session.last_active)) / 1000 / 60;
                if (diffMins >= 10 && diffMins <= 60) {
                    const customPrompt = "Pesan otomatis nudge/percikan obrolan. " + (session.jid.includes('6288293473765') ? "Pacar Zaky, buat baper/manja." : "AI Ramah.");
                    const aiResponse = await geminiService.generateResponse("...", historyService.formatForPrompt(session.history), customPrompt);

                    await whatsappService.sendTextMessage(socket, session.jid, aiResponse);
                    await historyService.saveMessage(session.jid, session.push_name, { role: 'model', content: aiResponse, isProactive: true });
                }
            }
        } catch (err) {
            console.error(`❌ [AI-Bot] Proactive error:`, err.message);
        }
    }
}

module.exports = new AIBotService();
