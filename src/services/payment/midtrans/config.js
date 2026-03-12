function buildMidtransConfig(env = process.env) {
    const serverKey = env.MIDTRANS_SERVER_KEY;
    const clientKey = env.MIDTRANS_CLIENT_KEY;
    const isProduction = env.MIDTRANS_IS_PRODUCTION === 'true';
    const merchantId = env.MIDTRANS_MERCHANT_ID;

    const baseUrl = isProduction
        ? 'https://app.midtrans.com/snap/v1'
        : 'https://app.sandbox.midtrans.com/snap/v1';

    const coreApiUrl = isProduction
        ? 'https://api.midtrans.com/v2'
        : 'https://api.sandbox.midtrans.com/v2';

    return {
        serverKey,
        clientKey,
        isProduction,
        merchantId,
        baseUrl,
        coreApiUrl
    };
}

module.exports = {
    buildMidtransConfig
};