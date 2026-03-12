const packages = require('./packages.service');
const subscriptions = require('./subscriptions.service');
const tokens = require('./tokens.service');
const topup = require('./topup.service');
const features = require('./features.service');

/**
 * Payment Service
 * Handles subscription, token balance, and package management logic.
 * Clean OOP structure for maintainability.
 */
class PaymentService {
    constructor() {
        this.packagesTable = 'packages';
        this.subscriptionsTable = 'subscriptions';
        this.tokenBalancesTable = 'token_balances';
        this.tokenTransactionsTable = 'token_transactions';
        this.topupOrdersTable = 'topup_orders';
        console.log('[PaymentService] Initialized');
    }

    // TRIAL (New User) - DEPRECATED in favor of 80% discount
    async grantTrial(userId) {
        console.log(`[PaymentService] grantTrial called for ${userId}, but trials are now disabled in favor of discounts.`);
        return null;
        /*
        // Original logic preserved in comments
        // ... (rest of old code)
        */
    }
}

Object.assign(
    PaymentService.prototype,
    packages,
    subscriptions,
    tokens,
    topup,
    features
);

module.exports = new PaymentService();

