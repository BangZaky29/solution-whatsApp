function buildAuthHeader(serverKey) {
    const encoded = Buffer.from(`${serverKey}:`).toString('base64');
    return `Basic ${encoded}`;
}

module.exports = {
    buildAuthHeader
};
