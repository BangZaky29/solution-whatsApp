const paymentService = require('../../services/payment/payment.service');

const getUserFeatures = async (req, res) => {
    try {
        const userId = req.userId;
        const features = await paymentService.getUserFeatures(userId);
        res.json({ success: true, features });
    } catch (error) {
        console.error('❌ [getUserFeatures] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { getUserFeatures };
