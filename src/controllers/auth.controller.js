const supabase = require('../config/supabase');
const csBotService = require('../services/ai/csBot.service');
const crypto = require('crypto');

/**
 * Normalizes Indonesian phone numbers to 62... format
 * @param {string} phone 
 * @returns {string}
 */
const normalizePhone = (phone) => {
    if (!phone) return '';
    let cleaned = phone.replace(/\D/g, ''); // keep only numbers
    if (cleaned.startsWith('0')) {
        cleaned = '62' + cleaned.slice(1);
    } else if (cleaned.startsWith('8')) {
        cleaned = '62' + cleaned;
    }
    return cleaned;
};

/**
 * Auth Controller
 */
const register = async (req, res) => {
    try {
        let { phone, username, full_name, password } = req.body;

        if (!phone || !username) {
            return res.status(400).json({ success: false, error: 'Phone and Username are required' });
        }

        phone = normalizePhone(phone);

        // 1. Create user in Supabase
        const { data: user, error: userError } = await supabase
            .from('users')
            .upsert({ phone, username, full_name, password_hash: password }, { onConflict: 'phone' })
            .select()
            .single();

        if (userError) throw userError;

        // 2. Check for existing valid OTP
        const { data: existingOtp } = await supabase
            .from('otp_codes')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_used', false)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        let otpCodes;
        if (existingOtp) {
            otpCodes = existingOtp.code;
            console.log(`♻️ [OTP] Reusing existing code for ${username}: ${otpCodes}`);
        } else {
            // Generate New OTP
            otpCodes = crypto.randomInt(100000, 999999).toString();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

            const { error: otpError } = await supabase
                .from('otp_codes')
                .insert({ user_id: user.id, code: otpCodes, expires_at: expiresAt });

            if (otpError) throw otpError;
        }

        // 3. Send OTP
        const message = `🔐 *KODE OTP ANDA*\n\nHalo ${full_name || username},\nKode verifikasi Anda adalah: *${otpCodes}*\n\nBerlaku selama 5 menit.`;
        await csBotService.sendOTP(phone, message);

        res.json({
            success: true,
            message: 'Registration successful. OTP sent.',
            userId: user.id
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

const login = async (req, res) => {
    try {
        let { identifier, password } = req.body; // identifier can be phone or username

        // Normalize if it looks like a phone number (only digits)
        if (/^\d+$/.test(identifier)) {
            identifier = normalizePhone(identifier);
        }

        // 1. Find user by phone OR username
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .or(`phone.eq.${identifier},username.eq.${identifier}`)
            .single();

        if (error || !user) {
            return res.status(401).json({ success: false, error: 'User not found' });
        }

        // 2. Check password
        if (user.password_hash !== password) {
            return res.status(401).json({ success: false, error: 'Invalid password' });
        }

        // 3. Check for existing valid OTP
        const { data: existingOtp } = await supabase
            .from('otp_codes')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_used', false)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        let otpCodes;
        if (existingOtp) {
            otpCodes = existingOtp.code;
            console.log(`♻️ [OTP] Reusing existing code for user ${user.id}: ${otpCodes}`);
        } else {
            // Generate and send OTP
            otpCodes = crypto.randomInt(100000, 999999).toString();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

            await supabase.from('otp_codes').insert({ user_id: user.id, code: otpCodes, expires_at: expiresAt });
        }

        const message = `🔐 *KODE LOGIN ANDA*\n\nKode verifikasi login Anda adalah: *${otpCodes}*\n\nBerlaku selama 5 menit.`;
        await csBotService.sendOTP(user.phone, message);

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

const getProfile = async (req, res) => {
    try {
        const { userId } = req.query;
        const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
        if (error) throw error;
        res.json({ success: true, user: data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { userId, ...updates } = req.body;
        const { data, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', userId)
            .select()
            .single();
        if (error) throw error;
        res.json({ success: true, user: data });
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

        const message = `🔐 *KODE OTP BARU*\n\nKode verifikasi baru Anda adalah: *${otpCodes}*\n\nBerlaku selama 5 menit.`;
        await csBotService.sendOTP(user.phone, message);

        res.json({ success: true, message: 'OTP resent successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    register,
    login,
    verifyOtp,
    getProfile,
    updateProfile,
    resendOtp
};
