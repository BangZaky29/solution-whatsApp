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
        if (sessionId !== this.sessionId) {
            console.log(`⚠️ [CS-Bot] Received message for WRONG session: ${sessionId}. Expected: ${this.sessionId}`);
            return;
        }

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
            const status = session?.connectionState?.connection || 'NOT_FOUND';
            console.warn(`⚠️ [CS-Bot] Cannot send OTP: Session is ${status}`);
            return {
                success: false,
                error: `CS-BOT session is ${status}. Please ensure the bot is connected.`
            };
        }

        const remoteJid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
        const sender = phone.split('@')[0];

        console.log(`\n[OTP-Service]:\n🚀 Sending OTP to ${sender}...`);

        const result = await whatsappService.sendTextMessage(session.socket, remoteJid, message);

        if (result.success) {
            console.log(`✅ [OTP-Service] Success! OTP sent to ${sender}`);
        } else {
            console.error(`❌ [OTP-Service] Failed to send to ${sender}: ${result.error}`);
        }

        return result;
    }
}

module.exports = new CSBotService();
