const supabase = require('../../config/supabase');
const csBotService = require('../../services/ai/csBot.service');
const crypto = require('crypto');
const configService = require('../../services/common/config.service');

const verifyOtp = async (req, res) => {
    try {
        const { userId, code } = req.body;

        const { data: otp, error } = await supabase
            .from(configService.otpCodesTable)
            .select('*')
            .eq('user_id', userId)
            .eq('code', code)
            .eq('is_used', false)
            .gt('expires_at', new Date().toISOString())
            .single();

        if (error || !otp) {
            return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
        }

        // Mark OTP as used
        await supabase.from('otp_codes').update({ is_used: true }).eq('id', otp.id);

        // Fetch user data again to return complete profile
        const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();

        res.json({
            success: true,
            message: 'OTP verified successfully.',
            user: user,
            token: 'dummy-jwt-token-' + userId // In production, generate a real JWT
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const resendOtp = async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ success: false, error: 'User ID is required' });

        const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        // Generate and send OTP
        const otpCodes = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        await supabase.from('otp_codes').insert({ user_id: userId, code: otpCodes, expires_at: expiresAt });

        const message = `?? *KODE OTP BARU*\n\nKode verifikasi baru Anda adalah: *${otpCodes}*\n\nBerlaku selama 5 menit.`;
        const sendResult = await csBotService.sendOTP(user.phone, message);

        if (!sendResult.success) {
            console.error(`? [ResendOTP] Failed to send OTP:`, sendResult.error);
            return res.status(503).json({
                success: false,
                error: 'Gagal mengirim ulang OTP. Pastikan koneksi WhatsApp Server aktif.'
            });
        }

        res.json({ success: true, message: 'OTP resent successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { verifyOtp, resendOtp };
