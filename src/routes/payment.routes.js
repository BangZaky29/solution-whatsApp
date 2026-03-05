const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { userAuth } = require('../middleware/userAuth.middleware');

/**
 * Payment Routes
 * All routes prefixed with /api/payment
 */

// ── Public (no auth needed) ──
router.get('/packages', paymentController.getPackages);
router.get('/config', paymentController.getMidtransConfig);
router.get('/topup-tiers', paymentController.getTopupTiers);

// ── Midtrans Webhook (server-to-server, no auth) ──
router.post('/webhook', paymentController.webhook);

// ── Protected (user auth required) ──
router.post('/subscribe', userAuth, paymentController.subscribe);
router.post('/topup', userAuth, paymentController.topup);
router.get('/my-subscription', userAuth, paymentController.getMySubscription);
router.get('/my-tokens', userAuth, paymentController.getMyTokens);
router.get('/status/:orderId', userAuth, paymentController.getPaymentStatus);

module.exports = router;
