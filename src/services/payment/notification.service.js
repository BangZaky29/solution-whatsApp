const whatsappService = require('../whatsapp/whatsapp.service');

/**
 * Notification Service
 * Sends WhatsApp notifications to users via CS-BOT session.
 * Handles payment status, token alerts, login/register, and system notifications.
 */
class NotificationService {
    constructor() {
        this.csSessionId = process.env.SESSION_ID || 'main-session';
        console.log(`🔔 [NotificationService] Initialized with session: ${this.csSessionId}`);
    }

    /*
     * Get CS-BOT socket (lazy-loaded to avoid circular dependency)
     */
    _getSocket() {
        const sessionManager = require('../whatsapp/session.manager');
        const session = sessionManager.getSession(this.csSessionId);
        if (!session || !session.socket || session.connectionState.connection !== 'open') {
            console.warn(`⚠️ [NotificationService] CS-BOT session is not available`);
            return null;
        }
        return session.socket;
    }

    /**
     * Send a WhatsApp message via CS-BOT
     */
    async _send(phone, message) {
        const socket = this._getSocket();
        if (!socket) {
            console.warn(`⚠️ [NotificationService] Cannot send notification: CS-BOT offline`);
            return { success: false, error: 'CS-BOT is offline' };
        }
        return await whatsappService.sendTextMessage(socket, phone, message);
    }

    // ═══════════════════════════════════════════
    // PAYMENT NOTIFICATIONS
    // ═══════════════════════════════════════════

    async notifyPaymentPending(phone, userName, packageName, orderId) {
        const message = [
            `💳 *PEMBAYARAN MENUNGGU*`,
            ``,
            `Halo ${userName},`,
            `Pesanan Anda sedang menunggu pembayaran.`,
            ``,
            `📦 Paket: *${packageName}*`,
            `🆔 Order ID: \`${orderId}\``,
            ``,
            `Silakan selesaikan pembayaran Anda segera.`,
            `Terima kasih! 🙏`,
        ].join('\n');

        return await this._send(phone, message);
    }

    async notifyPaymentSuccess(phone, userName, packageName, tokenAmount, expiresAt) {
        const expDate = new Date(expiresAt).toLocaleDateString('id-ID', {
            day: 'numeric', month: 'long', year: 'numeric'
        });

        const message = [
            `✅ *PEMBAYARAN BERHASIL!*`,
            ``,
            `Halo ${userName},`,
            `Pembayaran Anda telah berhasil diproses.`,
            ``,
            `📦 Paket: *${packageName}*`,
            `🎫 Token: *${tokenAmount.toLocaleString()} token*`,
            `📅 Berlaku hingga: *${expDate}*`,
            ``,
            `Selamat menggunakan WA-BOT-AI! 🤖✨`,
        ].join('\n');

        return await this._send(phone, message);
    }

    async notifyPaymentFailed(phone, userName, packageName) {
        const message = [
            `❌ *PEMBAYARAN GAGAL*`,
            ``,
            `Halo ${userName},`,
            `Pembayaran untuk paket *${packageName}* gagal atau dibatalkan.`,
            ``,
            `Silakan coba lagi melalui dashboard.`,
            `Jika ada kendala, hubungi admin.`,
        ].join('\n');

        return await this._send(phone, message);
    }

    // ═══════════════════════════════════════════
    // TOP-UP NOTIFICATIONS
    // ═══════════════════════════════════════════

    async notifyTopupSuccess(phone, userName, tokenAmount, newBalance) {
        const message = [
            `✅ *TOP-UP TOKEN BERHASIL!*`,
            ``,
            `Halo ${userName},`,
            `Top-up token Anda telah berhasil.`,
            ``,
            `🎫 Token ditambahkan: *+${tokenAmount.toLocaleString()}*`,
            `💰 Saldo saat ini: *${newBalance.toLocaleString()} token*`,
            ``,
            `Terima kasih! 🙏`,
        ].join('\n');

        return await this._send(phone, message);
    }

    // ═══════════════════════════════════════════
    // TOKEN & SUBSCRIPTION ALERTS
    // ═══════════════════════════════════════════

    async notifyTokenLow(phone, userName, balance) {
        const message = [
            `⚠️ *PERINGATAN: TOKEN HAMPIR HABIS*`,
            ``,
            `Halo ${userName},`,
            `Sisa token Anda tinggal *${balance} token*.`,
            ``,
            `Segera lakukan top-up agar bot AI tetap aktif.`,
            `Buka dashboard → Billing → Top-up Token`,
        ].join('\n');

        return await this._send(phone, message);
    }

    async notifyTokenDepleted(phone, userName) {
        const message = [
            `🚫 *TOKEN HABIS*`,
            ``,
            `Halo ${userName},`,
            `Token Anda telah habis. Bot AI tidak dapat membalas pesan.`,
            ``,
            `Silakan top-up token melalui dashboard.`,
        ].join('\n');

        return await this._send(phone, message);
    }

    async notifySubscriptionExpired(phone, userName, packageName) {
        const message = [
            `⏰ *LANGGANAN BERAKHIR*`,
            ``,
            `Halo ${userName},`,
            `Paket *${packageName}* Anda telah berakhir.`,
            ``,
            `Bot AI Anda sekarang dalam mode non-aktif.`,
            `Perpanjang langganan di dashboard → Billing.`,
        ].join('\n');

        return await this._send(phone, message);
    }

    async notifySubscriptionExpiringSoon(phone, userName, packageName, daysLeft) {
        const message = [
            `📢 *LANGGANAN SEGERA BERAKHIR*`,
            ``,
            `Halo ${userName},`,
            `Paket *${packageName}* Anda akan berakhir dalam *${daysLeft} hari*.`,
            ``,
            `Perpanjang segera agar layanan bot tidak terputus.`,
            `Buka dashboard → Billing → Perpanjang Paket`,
        ].join('\n');

        return await this._send(phone, message);
    }

    // ═══════════════════════════════════════════
    // AUTH NOTIFICATIONS
    // ═══════════════════════════════════════════

    async notifyRegistration(phone, userName) {
        const message = [
            `🎉 *SELAMAT DATANG DI WA-BOT-AI!*`,
            ``,
            `Halo ${userName},`,
            `Akun Anda berhasil didaftarkan.`,
            ``,
            `🎁 Anda mendapat *TRIAL GRATIS 3 HARI*`,
            `📦 Paket: *Pro (Full Feature)*`,
            `🎫 Token: *1.500 token*`,
            ``,
            `Selamat mencoba! 🚀`,
        ].join('\n');

        return await this._send(phone, message);
    }

    async notifyLogin(phone, userName) {
        const message = [
            `🔐 *LOGIN BERHASIL*`,
            ``,
            `Halo ${userName},`,
            `Anda baru saja login ke WA-BOT-AI.`,
            ``,
            `Jika bukan Anda, segera hubungi admin.`,
        ].join('\n');

        return await this._send(phone, message);
    }

    // ═══════════════════════════════════════════
    // TRIAL NOTIFICATIONS
    // ═══════════════════════════════════════════

    async notifyTrialExpiring(phone, userName) {
        const message = [
            `⏳ *TRIAL HAMPIR BERAKHIR*`,
            ``,
            `Halo ${userName},`,
            `Trial gratis 3 hari Anda akan segera berakhir.`,
            ``,
            `Berlangganan sekarang untuk terus menggunakan WA-BOT-AI:`,
            `🟢 Basic — Rp 49.000/bln`,
            `🔵 Premium — Rp 99.000/bln`,
            `🟣 Pro — Rp 199.000/bln`,
            ``,
            `Buka dashboard → Billing untuk berlangganan.`,
        ].join('\n');

        return await this._send(phone, message);
    }
}

module.exports = new NotificationService();
