const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { userAuth } = require('../middleware/userAuth.middleware');

/**
 * Payment Routes
 * All routes prefixed with /api/payment
 */

// â”€â”€ Public (no auth needed) â”€â”€
router.get('/packages', paymentController.getPackages);
router.get('/config', paymentController.getMidtransConfig);
router.get('/topup-tiers', paymentController.getTopupTiers);

// â”€â”€ Midtrans Webhook (server-to-server, no auth) â”€â”€
router.post('/webhook', paymentController.webhook);
router.get('/webhook', (req, res) => res.json({ success: true, message: 'Midtrans Webhook is UP and ready for POST notifications' }));

// â”€â”€ Protected (user auth required) â”€â”€
router.post('/subscribe', userAuth, paymentController.subscribe);
router.post('/topup', userAuth, paymentController.topup);
router.get('/my-subscription', userAuth, paymentController.getMySubscription);
router.get('/my-tokens', userAuth, paymentController.getMyTokens);
router.get('/status/:orderId', userAuth, paymentController.getPaymentStatus);
router.get('/my-features', userAuth, paymentController.getUserFeatures);

module.exports = router;
