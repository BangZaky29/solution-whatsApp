const midtransService = require('../../services/payment/midtrans.service');

const getPaymentStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const status = await midtransService.getTransactionStatus(orderId);
        res.json({ success: true, status });
    } catch (error) {
        console.error('? [PaymentController] getPaymentStatus error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { getPaymentStatus };
