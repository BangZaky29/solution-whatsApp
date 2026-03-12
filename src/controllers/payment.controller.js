const { getPackages } = require('./payment/packages.controller');
const { subscribe, getMySubscription } = require('./payment/subscriptions.controller');
const { topup, getMyTokens, getTopupTiers } = require('./payment/topup.controller');
const { webhook } = require('./payment/webhook.controller');
const { getPaymentStatus } = require('./payment/status.controller');
const { getMidtransConfig } = require('./payment/config.controller');
const { getUserFeatures } = require('./payment/features.controller');

module.exports = {
    getPackages,
    subscribe,
    getMySubscription,
    topup,
    getMyTokens,
    getTopupTiers,
    webhook,
    getPaymentStatus,
    getMidtransConfig,
    getUserFeatures,
};
