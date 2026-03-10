/**
 * Midtrans Service
 * Handles Snap transaction creation and notification verification.
 * Supports both Sandbox and Production modes via .env config.
 */
class MidtransService {
    constructor() {
        this.serverKey = process.env.MIDTRANS_SERVER_KEY;
        this.clientKey = process.env.MIDTRANS_CLIENT_KEY;
        this.isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';
        this.merchantId = process.env.MIDTRANS_MERCHANT_ID;

        this.baseUrl = this.isProduction
            ? 'https://app.midtrans.com/snap/v1'
            : 'https://app.sandbox.midtrans.com/snap/v1';

        this.coreApiUrl = this.isProduction
            ? 'https://api.midtrans.com/v2'
            : 'https://api.sandbox.midtrans.com/v2';

        console.log(`💳 [MidtransService] Initialized (${this.isProduction ? 'PRODUCTION' : 'SANDBOX'})`);
    }

    /**
     * Get base64 encoded authorization header
     */
    _getAuthHeader() {
        const encoded = Buffer.from(`${this.serverKey}:`).toString('base64');
        return `Basic ${encoded}`;
    }

    /**
     * Create a Snap transaction for subscription payment
     */
    async createSubscriptionTransaction(orderId, packageData, userData) {
        const payload = {
            transaction_details: {
                order_id: orderId,
                gross_amount: packageData.price,
            },
            item_details: [
                {
                    id: packageData.id,
                    price: packageData.price,
                    quantity: 1,
                    name: `Paket ${packageData.display_name} - ${packageData.token_amount} Token`,
                },
            ],
            customer_details: {
                first_name: userData.full_name || userData.username || 'User',
                phone: userData.phone || '',
                email: userData.email || '',
            },
            callbacks: {
                finish: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/billing?status=finish`,
                error: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/billing?status=error`,
                pending: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/billing?status=pending`,
            },
        };

        return await this._createSnapTransaction(payload);
    }

    /**
     * Create a Snap transaction for token top-up
     */
    async createTopupTransaction(orderId, tokenAmount, price, userData) {
        const payload = {
            transaction_details: {
                order_id: orderId,
                gross_amount: price,
            },
            item_details: [
                {
                    id: `topup-${tokenAmount}`,
                    price: price,
                    quantity: 1,
                    name: `Top-up ${tokenAmount} Token`,
                },
            ],
            customer_details: {
                first_name: userData.full_name || userData.username || 'User',
                phone: userData.phone || '',
                email: userData.email || '',
            },
            callbacks: {
                finish: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/billing?status=finish`,
                error: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/billing?status=error`,
                pending: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/billing?status=pending`,
            },
        };

        return await this._createSnapTransaction(payload);
    }

    /**
     * Internal: call Midtrans Snap API
     */
    async _createSnapTransaction(payload) {
        try {
            if (!this.serverKey) {
                if (process.env.NODE_ENV === 'development') {
                    console.log('🧪 [MidtransService] Mocking transaction for development (No Server Key)');
                    return {
                        token: `mock-snap-token-${Date.now()}`,
                        redirect_url: `https://app.sandbox.midtrans.com/snap/v1/transactions/mock-redirect-${Date.now()}`,
                        is_mock: true
                    };
                }
                throw new Error('Midtrans Server Key is missing');
            }

            const response = await fetch(`${this.baseUrl}/transactions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': this._getAuthHeader(),
                },
                body: JSON.stringify(payload),
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('❌ [MidtransService] Snap API Error:', data);
                throw new Error(data.error_messages?.join(', ') || 'Midtrans API error');
            }

            console.log(`✅ [MidtransService] Snap token created for order: ${payload.transaction_details.order_id}`);
            return {
                token: data.token,
                redirect_url: data.redirect_url,
            };
        } catch (error) {
            console.error('❌ [MidtransService] Transaction creation failed:', error.message);
            throw error;
        }
    }

    /**
     * Verify Midtrans notification signature
     * SHA512(order_id + status_code + gross_amount + server_key)
     */
    verifySignature(notification) {
        const crypto = require('crypto');
        const { order_id, status_code, gross_amount, signature_key } = notification;

        const payload = `${order_id}${status_code}${gross_amount}${this.serverKey}`;
        const expectedSignature = crypto.createHash('sha512').update(payload).digest('hex');

        return expectedSignature === signature_key;
    }

    /**
     * Get transaction status from Midtrans Core API
     */
    async getTransactionStatus(orderId) {
        try {
            const response = await fetch(`${this.coreApiUrl}/${orderId}/status`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': this._getAuthHeader(),
                },
            });

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('❌ [MidtransService] Status check failed:', error.message);
            throw error;
        }
    }

    /**
     * Get the Snap JS URL based on environment
     */
    getSnapJsUrl() {
        return this.isProduction
            ? 'https://app.midtrans.com/snap/snap.js'
            : 'https://app.sandbox.midtrans.com/snap/snap.js';
    }

    /**
     * Get client key for frontend use
     */
    getClientKey() {
        return this.clientKey;
    }
}

module.exports = new MidtransService();
