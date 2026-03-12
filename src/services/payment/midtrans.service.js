const { buildMidtransConfig } = require('./midtrans/config');
const { buildAuthHeader } = require('./midtrans/auth');
const { buildSubscriptionPayload, buildTopupPayload } = require('./midtrans/payloads');
const { createSnapTransaction } = require('./midtrans/snap');
const { verifySignature } = require('./midtrans/verify');
const { getTransactionStatus } = require('./midtrans/status');
const { getSnapJsUrl } = require('./midtrans/snapjs');

/**
 * Midtrans Service
 * Handles Snap transaction creation and notification verification.
 * Supports both Sandbox and Production modes via .env config.
 */
class MidtransService {
    constructor() {
        const config = buildMidtransConfig();

        this.serverKey = config.serverKey;
        this.clientKey = config.clientKey;
        this.isProduction = config.isProduction;
        this.merchantId = config.merchantId;
        this.baseUrl = config.baseUrl;
        this.coreApiUrl = config.coreApiUrl;

        // ── Validation: Check if keys match environment ──
        if (this.serverKey) {
            const isSandboxKey = this.serverKey.startsWith('SB-');
            if (this.isProduction && isSandboxKey) {
                console.error('❌ [MidtransService] CRITICAL: Using SANDBOX key in PRODUCTION mode!');
            } else if (!this.isProduction && !isSandboxKey) {
                console.error('❌ [MidtransService] CRITICAL: Using PRODUCTION key in SANDBOX mode!');
                console.error('ℹ️ [MidtransService] Sandbox keys must start with "SB-".');
            }
        }

        console.log(`💳 [MidtransService] Initialized (${this.isProduction ? 'PRODUCTION' : 'LIVE'})`);
    }

    /**
     * Get base64 encoded authorization header
     */
    _getAuthHeader() {
        return buildAuthHeader(this.serverKey);
    }

    /**
     * Create a Snap transaction for subscription payment
     */
    async createSubscriptionTransaction(orderId, packageData, userData) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const payload = buildSubscriptionPayload(orderId, packageData, userData, frontendUrl);

        return await createSnapTransaction({
            baseUrl: this.baseUrl,
            authHeader: this._getAuthHeader(),
            payload,
            isDevelopment: process.env.NODE_ENV === 'development',
            serverKey: this.serverKey
        });
    }

    /**
     * Create a Snap transaction for token top-up
     */
    async createTopupTransaction(orderId, tokenAmount, price, userData) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const payload = buildTopupPayload(orderId, tokenAmount, price, userData, frontendUrl);

        return await createSnapTransaction({
            baseUrl: this.baseUrl,
            authHeader: this._getAuthHeader(),
            payload,
            isDevelopment: process.env.NODE_ENV === 'development',
            serverKey: this.serverKey
        });
    }

    /**
     * Verify Midtrans notification signature
     * SHA512(order_id + status_code + gross_amount + server_key)
     */
    verifySignature(notification) {
        return verifySignature({ notification, serverKey: this.serverKey });
    }

    /**
     * Get transaction status from Midtrans Core API
     */
    async getTransactionStatus(orderId) {
        return await getTransactionStatus({
            coreApiUrl: this.coreApiUrl,
            authHeader: this._getAuthHeader(),
            orderId
        });
    }

    /**
     * Get the Snap JS URL based on environment
     */
    getSnapJsUrl() {
        return getSnapJsUrl(this.isProduction);
    }

    /**
     * Get client key for frontend use
     */
    getClientKey() {
        return this.clientKey;
    }
}

module.exports = new MidtransService();
