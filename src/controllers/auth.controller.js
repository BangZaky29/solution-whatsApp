const { register } = require('./auth/register.controller');
const { login } = require('./auth/login.controller');
const { verifyOtp, resendOtp } = require('./auth/otp.controller');
const { getProfile, updateProfile } = require('./auth/profile.controller');

module.exports = {
    register,
    login,
    verifyOtp,
    resendOtp,
    getProfile,
    updateProfile
};
