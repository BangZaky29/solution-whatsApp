const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/session.controller');
const whatsappController = require('../controllers/whatsapp.controller');
const configController = require('../controllers/config.controller');
const { validateSession } = require('../middleware/session.middleware');

// Session Routes
router.post('/:sessionId/init', sessionController.initSession);
router.get('/:sessionId/status', validateSession, sessionController.getStatus);
router.get('/:sessionId/qr', validateSession, sessionController.getQrCode);
router.post('/:sessionId/logout', validateSession, sessionController.logout);
router.get('/:sessionId/info', validateSession, sessionController.getInfo);

// Messaging Routes
router.post('/:sessionId/send', validateSession, whatsappController.sendText);
router.post('/:sessionId/send-media', validateSession, whatsappController.sendMedia);
router.post('/:sessionId/send-bulk', validateSession, whatsappController.sendBulk);
router.post('/:sessionId/notify/payment-confirmation', validateSession, whatsappController.sendPaymentConfirmation);

// Config & Stats Routes
router.get('/stats/history', configController.getStats);
router.get('/config/prompts', configController.getPrompts);
router.post('/config/prompts', configController.upsertPrompt);
router.post('/config/prompts/activate', configController.activatePrompt);
router.put('/config/prompts/:id', configController.updatePrompt);
router.delete('/config/prompts/:id', configController.deletePrompt);

router.get('/config/contacts', configController.getContacts);
router.post('/config/contacts', configController.addContact);
router.put('/config/contacts/:jid', configController.updateContact);
router.delete('/config/contacts/:jid', configController.deleteContact);
router.post('/config/target-mode', configController.setTargetMode);

router.get('/history/:jid', configController.getHistory);
router.get('/config/prompt', configController.getSystemPrompt);
router.post('/config/prompt', configController.updateSystemPrompt);

// API Keys Routes
router.get('/config/keys', configController.getKeys);
router.post('/config/keys', configController.addKey);
router.put('/config/keys/:id', configController.updateKey);
router.delete('/config/keys/:id', configController.deleteKey);
router.patch('/config/keys/:id/activate', configController.activateKey);

module.exports = router;
