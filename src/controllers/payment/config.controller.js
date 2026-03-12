const midtransService = require('../../services/payment/midtrans.service');

const getMidtransConfig = async (req, res) => {
    res.json({
        success: true,
        clientKey: midtransService.getClientKey(),
        snapJsUrl: midtransService.getSnapJsUrl(),
    });
};

module.exports = { getMidtransConfig };
