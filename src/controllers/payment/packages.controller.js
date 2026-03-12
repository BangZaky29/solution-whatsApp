const paymentService = require('../../services/payment/payment.service');

const getPackages = async (req, res) => {
    try {
        const userId = req.headers['x-session-id'] || req.headers['X-Session-Id'];
        const packages = await paymentService.getAllPackages(userId);
        res.json({ success: true, packages });
    } catch (error) {
        console.error('❌ [PaymentController] getPackages error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { getPackages };
