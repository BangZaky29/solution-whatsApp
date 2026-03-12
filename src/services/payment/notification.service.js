const whatsappService = require('../whatsapp/whatsapp.service');
const {
    buildPaymentPendingMessage,
    buildPaymentSuccessMessage,
    buildPaymentFailedMessage
} = require('./notification/payment.messages');
const { buildTopupSuccessMessage } = require('./notification/topup.messages');
const {
    buildTokenLowMessage,
    buildTokenDepletedMessage,
    buildSubscriptionExpiredMessage,
    buildSubscriptionExpiringSoonMessage
} = require('./notification/token.messages');
const {
    buildRegistrationMessage,
    buildLoginMessage
} = require('./notification/auth.messages');
const { buildTrialExpiringMessage } = require('./notification/trial.messages');

/**
 * Notification Service
 * Sends WhatsApp notifications to users via CS-BOT session.
 * Handles payment status, token alerts, login/register, and system notifications.
 */
class NotificationService {
    constructor() {
        this.csSessionId = 'CS-BOT';
        console.log(`🔔 [NotificationService] Initialized with session: ${this.csSessionId}`);
    }

    /*
     * Get CS-BOT socket (lazy-loaded to avoid circular dependency)
     */
    _getSocket() {
        const sessionManager = require('../whatsapp/session.manager');
        const session = sessionManager.getSession(this.csSessionId);
        if (!session || !session.socket || session.connectionState.connection !== 'open') {
            console.warn(`⚠️ [NotificationService] CS-BOT session is not available`);
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
            console.warn(`⚠️ [NotificationService] Cannot send notification: CS-BOT offline`);
            return { success: false, error: 'CS-BOT is offline' };
        }
        return await whatsappService.sendTextMessage(socket, phone, message);
    }

    // ═══════════════════════════════════════════
    // PAYMENT NOTIFICATIONS
    // ═══════════════════════════════════════════

    async notifyPaymentPending(phone, userName, packageName, orderId) {
        const message = buildPaymentPendingMessage(userName, packageName, orderId);
        return await this._send(phone, message);
    }

    async notifyPaymentSuccess(phone, userName, packageName, tokenAmount, expiresAt) {
        const message = buildPaymentSuccessMessage(userName, packageName, tokenAmount, expiresAt);
        return await this._send(phone, message);
    }

    async notifyPaymentFailed(phone, userName, packageName) {
        const message = buildPaymentFailedMessage(userName, packageName);
        return await this._send(phone, message);
    }

    // ═══════════════════════════════════════════
    // TOP-UP NOTIFICATIONS
    // ═══════════════════════════════════════════

    async notifyTopupSuccess(phone, userName, tokenAmount, newBalance) {
        const message = buildTopupSuccessMessage(userName, tokenAmount, newBalance);
        return await this._send(phone, message);
    }

    // ═══════════════════════════════════════════
    // TOKEN & SUBSCRIPTION ALERTS
    // ═══════════════════════════════════════════

    async notifyTokenLow(phone, userName, balance) {
        const message = buildTokenLowMessage(userName, balance);
        return await this._send(phone, message);
    }

    async notifyTokenDepleted(phone, userName) {
        const message = buildTokenDepletedMessage(userName);
        return await this._send(phone, message);
    }

    async notifySubscriptionExpired(phone, userName, packageName) {
        const message = buildSubscriptionExpiredMessage(userName, packageName);
        return await this._send(phone, message);
    }

    async notifySubscriptionExpiringSoon(phone, userName, packageName, daysLeft) {
        const message = buildSubscriptionExpiringSoonMessage(userName, packageName, daysLeft);
        return await this._send(phone, message);
    }

    // ═══════════════════════════════════════════
    // AUTH NOTIFICATIONS
    // ═══════════════════════════════════════════

    async notifyRegistration(phone, userName) {
        const message = buildRegistrationMessage(userName);
        return await this._send(phone, message);
    }

    async notifyLogin(phone, userName) {
        const message = buildLoginMessage(userName);
        return await this._send(phone, message);
    }

    // ═══════════════════════════════════════════
    // TRIAL NOTIFICATIONS
    // ═══════════════════════════════════════════

    async notifyTrialExpiring(phone, userName) {
        const message = buildTrialExpiringMessage(userName);
        return await this._send(phone, message);
    }
}

module.exports = new NotificationService();
