const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/session.controller');
const whatsappController = require('../controllers/whatsapp.controller');
const configController = require('../controllers/config.controller');
const { validateSession } = require('../middleware/session.middleware');
const { userAuth } = require('../middleware/userAuth.middleware');

// Session Routes
router.post('/:sessionId/init', userAuth, sessionController.initSession);
router.get('/:sessionId/status', userAuth, validateSession, sessionController.getStatus);
router.get('/:sessionId/qr', userAuth, validateSession, sessionController.getQrCode);
router.post('/:sessionId/logout', userAuth, validateSession, sessionController.logout);
router.get('/:sessionId/info', userAuth, validateSession, sessionController.getInfo);

// Messaging Routes
router.post('/:sessionId/send', userAuth, validateSession, whatsappController.sendText);
router.post('/:sessionId/send-media', userAuth, validateSession, whatsappController.sendMedia);
router.post('/:sessionId/send-bulk', userAuth, validateSession, whatsappController.sendBulk);
router.post('/:sessionId/notify/payment-confirmation', userAuth, validateSession, whatsappController.sendPaymentConfirmation);

// Config & Stats Routes (PROTECTED BY USER AUTH)
router.get('/stats/history', userAuth, configController.getStats);
router.get('/config/prompts', userAuth, configController.getPrompts);
router.post('/config/prompts', userAuth, configController.upsertPrompt);
router.post('/config/prompts/activate', userAuth, configController.activatePrompt);
router.put('/config/prompts/:id', userAuth, configController.updatePrompt);
router.delete('/config/prompts/:id', userAuth, configController.deletePrompt);

router.get('/config/contacts', userAuth, configController.getContacts);
router.post('/config/contacts', userAuth, configController.addContact);
router.put('/config/contacts/:jid', userAuth, configController.updateContact);
router.delete('/config/contacts/:jid', userAuth, configController.deleteContact);
router.post('/config/target-mode', userAuth, configController.updateTargetMode);

// Blocked Attempts Routes
router.get('/config/blocked', userAuth, configController.getBlockedAttempts);
router.post('/config/blocked/whitelist', userAuth, configController.whitelistBlockedAttempt);

router.get('/history/:jid', userAuth, configController.getHistory);
router.post('/history/delete', userAuth, configController.deleteHistory);
router.post('/account/wipe', userAuth, configController.wipeAccountData);
router.get('/config/prompt', userAuth, configController.getSystemPrompt);
router.post('/config/prompt', userAuth, configController.updateSystemPrompt);

// API Keys Routes (PROTECTED BY USER AUTH)
router.get('/config/keys', userAuth, configController.getKeys);
router.post('/config/keys', userAuth, configController.addKey);
router.put('/config/keys/:id', userAuth, configController.updateKey);
router.delete('/config/keys/:id', userAuth, configController.deleteKey);
router.patch('/config/keys/:id/activate', userAuth, configController.activateKey);
router.get('/config/ai-controls', userAuth, configController.getAIControls);
router.put('/config/ai-controls', userAuth, configController.updateAIControls);

module.exports = router;
