const { sendText, sendMedia, sendBulk } = require('./whatsapp/messages.controller');
const { sendPaymentConfirmation } = require('./whatsapp/notifications.controller');
const { getLogs } = require('./whatsapp/logs.controller');

module.exports = {
    sendText,
    sendMedia,
    sendBulk,
    sendPaymentConfirmation,
    getLogs
};
