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

        const cleanMessage = messageText.toLowerCase().trim();
        const senderId = remoteJid.split('@')[0];

        console.log(`🏢 [CS-Bot] Message from ${senderId}: "${messageText}"`);

        // Basic routing logic for CS-BOT
        if (cleanMessage === 'hi' || cleanMessage === 'halo' || cleanMessage === 'menu') {
            await this.sendMenu(socket, remoteJid);
        } else if (cleanMessage.includes('login') || cleanMessage.includes('masuk')) {
            await whatsappService.sendTextMessage(socket, remoteJid, "Silakan masukkan nomor telepon atau email yang terdaftar untuk menerima kode OTP login.");
        } else if (cleanMessage.includes('otp')) {
            await whatsappService.sendTextMessage(socket, remoteJid, "Kode OTP Anda sedang diproses. Mohon tunggu sebentar.");
        } else if (cleanMessage.includes('payment') || cleanMessage.includes('bayar')) {
            await whatsappService.sendTextMessage(socket, remoteJid, "Untuk konfirmasi pembayaran, silakan kirimkan bukti transfer Anda di sini.");
        } else {
            // Default response for CS-BOT
            await whatsappService.sendTextMessage(socket, remoteJid, "Halo! Saya adalah Customer Service Bot. Ada yang bisa saya bantu terkait Login, Register, atau Pembayaran?");
        }
    }

    async sendMenu(socket, remoteJid) {
        const menu = `*CS-BOT MENU*\n\n` +
            `1. *Login* - Bantuan login ke aplikasi\n` +
            `2. *Register* - Pendaftaran akun baru\n` +
            `3. *OTP* - Masalah pengiriman kode OTP\n` +
            `4. *Payment* - Konfirmasi & Masalah pembayaran\n\n` +
            `Silakan ketik kata kunci di atas untuk bantuan.`;
        await whatsappService.sendTextMessage(socket, remoteJid, menu);
    }
}

module.exports = new CSBotService();
