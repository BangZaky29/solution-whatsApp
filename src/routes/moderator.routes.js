const express = require('express');
const router = express.Router();
const moderatorController = require('../controllers/moderator.controller');

/**
 * Moderator Routes
 * All routes prefixed with /api/moderator
 */

router.get('/users', moderatorController.getUsers);
router.get('/logs', moderatorController.getLogs);
router.get('/stats', moderatorController.getStats);
router.get('/role/:phone', moderatorController.getUserRole);

module.exports = router;
