const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

const { userAuth } = require('../middleware/userAuth.middleware');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/verify-otp', authController.verifyOtp);
router.post('/resend-otp', authController.resendOtp);
router.get('/me', userAuth, authController.getProfile);
router.put('/profile', userAuth, authController.updateProfile);

module.exports = router;
