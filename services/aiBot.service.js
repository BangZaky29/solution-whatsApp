const geminiHelper = require('../helpers/gemini.helper');
const whatsappService = require('./whatsapp.service');
const historyHelper = require('../helpers/history.helper');
const supabase = require('../helpers/supabase.helper');

/**
 * AI Bot Service
 * Handles automated responses for specific sessions
 */
class AIBotService {
    constructor() {
        const rawTarget = process.env.AI_BOT_TARGET_NUMBER || '6281995770190';
        // Allow multiple targets separated by comma (phone numbers or LID IDs)
        this.targetNumbers = rawTarget.split(',').map(n => n.trim().replace(/\D/g, ''));
        this.botSessionId = 'wa-bot-ai';
        console.log(`🤖 [AI-Bot] Service initialized.`);
        console.log(`   > Session: ${this.botSessionId}`);
        console.log(`   > Targets: ${this.targetNumbers.join(', ')}`);
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
        let systemPrompt = process.env.AI_BOT_SYSTEM_PROMPT || "Anda adalah asisten AI ramah.";

        if (isPacarZaky) {
            console.log(`💖 [AI-Bot] Special person detected! Applying sweet persona.`);
            systemPrompt += " Khusus untuk orang ini, dia adalah pacar Zaky. Kamu harus ekstra ramah, sangat baik, dan perhatian. Jangan terlalu dingin, tapi tetap singkat dan tanpa emoji.";
        }

        // CHAT MEMORY: Fetch history from Supabase
        const history = await historyHelper.getHistory(remoteJid);
        const formattedHistory = historyHelper.formatForPrompt(history);

        // Send 'typing' status
        await socket.sendPresenceUpdate('composing', remoteJid);

        try {
            // Generate AI response with custom prompt and history context
            console.log(`🤖 [AI-Bot] Fetching Gemini response...`);
            const aiResponse = await geminiHelper.generateResponse(fullMessageText, formattedHistory, systemPrompt);
            console.log(`🤖 [AI-Bot] Gemini responded (${aiResponse.length} chars)`);

            // Send response - Use remoteJid to preserve @lid or @s.whatsapp.net format
            await whatsappService.sendTextMessage(socket, remoteJid, aiResponse);
            console.log(`✅ [AI-Bot] Sent AI response to ${cleanSender}`);

            // PERSISTENCE: Save both messages to history
            // Save fullMessageText for user so history has the context too
            await historyHelper.saveMessage(remoteJid, pushName, { role: 'user', content: fullMessageText });
            await historyHelper.saveMessage(remoteJid, pushName, { role: 'model', content: aiResponse });

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
