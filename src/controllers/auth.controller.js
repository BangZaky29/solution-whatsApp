const supabase = require('../config/supabase');
const csBotService = require('../services/ai/csBot.service');
const crypto = require('crypto');

/**
 * Auth Controller
 */
const register = async (req, res) => {
    try {
        const { phone, full_name, password } = req.body;

        if (!phone) {
            return res.status(400).json({ success: false, error: 'Phone number is required' });
        }

        // 1. Create user in Supabase (simplified, in real world use password hashing)
        const { data: user, error: userError } = await supabase
            .from('users')
            .upsert({ phone, full_name, password_hash: password }, { onConflict: 'phone' })
            .select()
            .single();

        if (userError) throw userError;

        // 2. Generate OTP
        const otpCodes = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 mins

        const { error: otpError } = await supabase
            .from('otp_codes')
            .insert({ user_id: user.id, code: otpCodes, expires_at: expiresAt });

        if (otpError) throw otpError;

        // 3. Send OTP via CS-BOT
        const message = `🔐 *KODE OTP ANDA*\n\nHalo ${full_name || 'User'},\nKode verifikasi Anda adalah: *${otpCodes}*\n\nBerlaku selama 5 menit. Jangan berikan kode ini kepada siapapun.`;

        // This assumes CS-BOT session is active
        const csBotResult = await csBotService.sendOTP(phone, message);

        res.json({
            success: true,
            message: 'Registration successful. OTP sent to your WhatsApp.',
            userId: user.id
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

const login = async (req, res) => {
    try {
        const { phone, password } = req.body;

        // 1. Find user
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('phone', phone)
            .single();

        if (error || !user) {
            return res.status(401).json({ success: false, error: 'User not found' });
        }

        // 2. Check password (simplified)
        if (user.password_hash !== password) {
            return res.status(401).json({ success: false, error: 'Invalid password' });
        }

        // 3. Generate and send OTP
        const otpCodes = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        await supabase.from('otp_codes').insert({ user_id: user.id, code: otpCodes, expires_at: expiresAt });

        const message = `🔐 *KODE LOGIN ANDA*\n\nKode verifikasi login Anda adalah: *${otpCodes}*\n\nBerlaku selama 5 menit.`;
        await csBotService.sendOTP(phone, message);

        res.json({
            success: true,
            message: 'Login step 1 successful. OTP sent.',
            userId: user.id
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const verifyOtp = async (req, res) => {
    try {
        const { userId, code } = req.body;

        const { data: otp, error } = await supabase
            .from('otp_codes')
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

        res.json({
            success: true,
            message: 'OTP verified successfully.',
            token: 'dummy-jwt-token-' + userId // In production, generate a real JWT
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    register,
    login,
    verifyOtp
};
