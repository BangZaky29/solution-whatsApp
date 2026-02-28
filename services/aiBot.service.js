const geminiHelper = require('../helpers/gemini.helper');
const whatsappService = require('./whatsapp.service');

/**
 * AI Bot Service
 * Handles automated responses for specific sessions
 */
class AIBotService {
    constructor() {
        this.targetNumber = process.env.AI_BOT_TARGET_NUMBER || '6281995770190';
        this.botSessionId = process.env.VITE_WA_SESSION_ID || 'wa-bot-ai';
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
        const isGroup = remoteJid.endsWith('@g.us');
        const senderNumber = remoteJid.split('@')[0];
        const pushName = msg.pushName || 'Pelanggan';

        // Filter: Only respond to specific white-listed number and ignore groups
        if (isGroup || senderNumber !== this.targetNumber) {
            console.log(`⏳ [AI-Bot] Ignored message from ${senderNumber} (Not target or Group)`);
            return;
        }

        // Get message text
        const messageText = msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            "";

        if (!messageText) return;

        console.log(`🤖 [AI-Bot] Processing message from ${senderNumber}: "${messageText}"`);

        // Send 'typing' status
        await socket.sendPresenceUpdate('composing', remoteJid);

        // Generate AI response
        const aiResponse = await geminiHelper.generateResponse(messageText);

        // Send response
        await whatsappService.sendTextMessage(socket, senderNumber, aiResponse);

        console.log(`✅ [AI-Bot] Sent AI response to ${senderNumber}`);
    }
}

module.exports = new AIBotService();
