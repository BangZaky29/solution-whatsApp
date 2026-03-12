const crypto = require('crypto');

function verifySignature({ notification, serverKey }) {
    const { order_id, status_code, gross_amount, signature_key } = notification;

    const payload = `${order_id}${status_code}${gross_amount}${serverKey}`;
    const expectedSignature = crypto.createHash('sha512').update(payload).digest('hex');

    return expectedSignature === signature_key;
}

module.exports = {
    verifySignature
};
