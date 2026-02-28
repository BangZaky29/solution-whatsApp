const geminiHelper = require('../helpers/gemini.helper');
const whatsappService = require('./whatsapp.service');
const historyHelper = require('../helpers/history.helper');
const supabase = require('../helpers/supabase.helper');
const configHelper = require('../helpers/config.helper');

/**
 * AI Bot Service
 * Handles automated responses for specific sessions
 */
class AIBotService {
    constructor() {
        this.botSessionId = 'wa-bot-ai';

        // Initial config state
        this.config = {
            systemPrompt: "" // Loaded from DB asynchronously
        };

        this.init();

        console.log(`🤖 [AI-Bot] Service initialized.`);
        console.log(`   > Session: ${this.botSessionId}`);
    }

    async init() {
        this.config.systemPrompt = await configHelper.getSystemPrompt();
        console.log(`🤖 [AI-Bot] Loaded prompt from DB: ${this.config.systemPrompt.substring(0, 30)}...`);
    }

    /**
     * Update runtime configuration
     * @param {object} newConfig 
     */
    async updateConfig(newConfig) {
        if (newConfig.systemPrompt) {
            this.config.systemPrompt = newConfig.systemPrompt;
            await configHelper.updateSystemPrompt(newConfig.systemPrompt);
            console.log(`⚙️ [AI-Bot] System prompt updated and saved to DB.`);
        }
    }

    /**
     * Handle incoming message
     * @param {string} sessionId - Session ID of the connection
     * @param {object} socket - Baileys socket instance
     * @param {object} msg - Incoming message object
     */
    async handleIncomingMessage(sessionId, socket, msg) {
        // Only handle messages for the AI Bot session
        if (sessionId !== this.botSessionId) return;

        // Message details
        const remoteJid = msg.key.remoteJid;
        if (!remoteJid) return;

        const isGroup = remoteJid.endsWith('@g.us');
        const isStatus = remoteJid === 'status@broadcast';

        // MSG TYPE FILTER: Ignore groups and status updates
        if (isGroup || isStatus) return;

        // Extract base number (handling linked devices/multi-device suffix)
        const senderId = remoteJid.split('@')[0].split(':')[0];

        // Clean number for comparison (remove any non-digits)
        const cleanSender = senderId.replace(/\D/g, '');

        // CHECK IF ALLOWED
        const isAllowed = await configHelper.isContactAllowed(remoteJid);
        if (!isAllowed) {
            console.log(`🚫 [AI-Bot] Sender ${cleanSender} is not in whitelist, ignored.`);
            return;
        }

        // Get message text
        const messageText = msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.ephemeralMessage?.message?.conversation ||
            msg.message?.ephemeralMessage?.message?.extendedTextMessage?.text ||
            "";

        if (!messageText) {
            console.log(`ℹ️ [AI-Bot] Empty message text from ${cleanSender}, ignored.`);
            return;
        }

        // Extract pushName (WhatsApp user name)
        const pushName = msg.pushName || 'User';

        // Extract quoted message context (if any)
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        let contextText = "";
        if (quotedMsg) {
            contextText = quotedMsg.conversation ||
                quotedMsg.extendedTextMessage?.text ||
                "";
            if (contextText) {
                console.log(`💬 [AI-Bot] Quoted Context detected: "${contextText}"`);
                // Prepend to message text for AI understanding
                // Use a standard format so AI knows it's a reference
                contextText = `(Membalas pesan: "${contextText}") `;
            }
        }

        const fullMessageText = contextText + messageText;

        console.log(`🤖 [AI-Bot] Processing message from ${cleanSender} (${pushName}): "${fullMessageText}"`);

        // SPECIAL PERSON LOGIC: Pacar Zaky
        const isPacarZaky = cleanSender.includes('6288293473765');

        // Refresh prompt from DB to ensure latest
        let systemPrompt = await configHelper.getSystemPrompt();

        if (isPacarZaky) {
            console.log(`💖 [AI-Bot] Special person detected! Applying sweet persona.`);
            systemPrompt += " Khusus untuk orang ini, dia adalah pacar Zaky. Kamu harus ekstra ramah, sangat baik, dan perhatian. Jangan terlalu dingin, tapi tetap singkat dan tanpa emoji.";
        }

        // CHAT MEMORY: Fetch history from Supabase
        const history = await historyHelper.getHistory(remoteJid);
        const formattedHistory = historyHelper.formatForPrompt(history);

        // Send 'typing' status
        await socket.sendPresenceUpdate('composing', remoteJid);

        const startTime = Date.now();
        await configHelper.incrementStat('requests');

        try {
            // Generate AI response with custom prompt and history context
            console.log(`🤖 [AI-Bot] Fetching Gemini response...`);
            const aiResponse = await geminiHelper.generateResponse(fullMessageText, formattedHistory, systemPrompt);

            const endTime = Date.now();
            const latency = endTime - startTime;

            console.log(`🤖 [AI-Bot] Gemini responded (${aiResponse.length} chars) in ${latency}ms`);

            // Send response - Use remoteJid to preserve @lid or @s.whatsapp.net format
            await whatsappService.sendTextMessage(socket, remoteJid, aiResponse);
            console.log(`✅ [AI-Bot] Sent AI response to ${cleanSender}`);
            await configHelper.incrementStat('responses');

            // PERSISTENCE: Save both messages to history
            // Save fullMessageText for user so history has the context too
            await historyHelper.saveMessage(remoteJid, pushName, { role: 'user', content: fullMessageText });
            await historyHelper.saveMessage(remoteJid, pushName, {
                role: 'model',
                content: aiResponse,
                latency: latency
            });

        } catch (error) {
            console.error(`❌ [AI-Bot] Execution failed:`, error.message);
        }
    }

    /**
     * PROACTIVE AI: AI wa duluan (Nudging)
     * Logic: Cek sesi chat yang "intens" tapi mendadak diam.
     */
    async checkAndSendProactiveMessage(socket) {
        try {
            console.log(`🔍 [AI-Bot] Routine check for proactive opportunities...`);

            // Fetch potential candidates: Last sender was 'model' and was active recently
            const { data: candidates, error } = await supabase
                .from(historyHelper.tableName)
                .select('*')
                .eq('last_sender', 'model')
                .lt('proactive_count', historyHelper.proactiveLimit);

            if (error || !candidates) return;

            for (const session of candidates) {
                const lastActive = new Date(session.last_active);
                const now = new Date();
                const diffMs = now - lastActive;
                const diffMins = diffMs / 1000 / 60;

                // Condition: Diam selama 10-30 menit
                if (diffMins >= 10 && diffMins <= 60) {
                    console.log(`💖 [AI-Bot] Nudging ${session.push_name} (${session.jid})...`);

                    const customPrompt = "Ini adalah pesan otomatis untuk memulai percakapan kembali karena pengguna sudah lama tidak membalas. " +
                        (session.jid.includes('6288293473765') ? "Dia adalah pacar Zaky, buatlah pesan pendek baper atau manja yang greget." : "Gunakan gaya asisten AI ramah.");

                    const aiResponse = await geminiHelper.generateResponse("...", historyHelper.formatForPrompt(session.history), customPrompt);

                    // Send nudge
                    await whatsappService.sendTextMessage(socket, session.jid, aiResponse);

                    // Save history as proactive
                    await historyHelper.saveMessage(session.jid, session.push_name, {
                        role: 'model',
                        content: aiResponse,
                        isProactive: true
                    });

                    console.log(`✅ [AI-Bot] Proactive nudge sent to ${session.push_name}`);
                }
            }
        } catch (err) {
            console.error(`❌ [AI-Bot] Proactive check error:`, err.message);
        }
    }
}

module.exports = new AIBotService();
