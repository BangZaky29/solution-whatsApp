function getSnapJsUrl(isProduction) {
    return isProduction
        ? 'https://app.midtrans.com/snap/snap.js'
        : 'https://app.sandbox.midtrans.com/snap/snap.js';
}

module.exports = {
    getSnapJsUrl
};