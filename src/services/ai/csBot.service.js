const configService = require('../common/config.service');
const whatsappService = require('../whatsapp/whatsapp.service');

/**
 * CS Bot Service
 * Handles administrative tasks like Login, Register, OTP, and Payments.
 */
class CSBotService {
    constructor() {
        this.sessionId = 'CS-BOT';
        console.log(`🏢 [CS-Bot] Service initialized for session: ${this.sessionId}`);
    }

    async handleIncomingMessage(sessionId, socket, msg) {
        if (sessionId !== this.sessionId) return;

        const remoteJid = msg.key.remoteJid;
        if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') return;

        const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        if (!messageText) return;

        const senderId = remoteJid.split('@')[0];
        console.log(`🏢 [CS-Bot] Read-only log for ${senderId}: "${messageText}"`);

        // Auto-replies and proactive messaging disabled as per user request.
        // The bot will only log incoming messages without responding.
    }

    async sendOTP(phone, message) {
        const sessionManager = require('../whatsapp/session.manager');
        const session = sessionManager.getSession(this.sessionId);

        if (!session || !session.socket || session.connectionState.connection !== 'open') {
            throw new Error('CS-BOT session is not active or connected');
        }

        const remoteJid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
        return await whatsappService.sendTextMessage(session.socket, remoteJid, message);
    }
}

module.exports = new CSBotService();
