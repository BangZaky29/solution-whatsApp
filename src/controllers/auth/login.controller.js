const supabase = require('../../config/supabase');
const csBotService = require('../../services/ai/csBot.service');
const crypto = require('crypto');
const configService = require('../../services/common/config.service');
const { normalizePhone } = require('./register.controller');

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
            .from(configService.otpCodesTable)
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
            console.log(`?? [OTP] Reusing existing code for user ${user.id}: ${otpCodes}`);
        } else {
            // Generate and send OTP
            otpCodes = crypto.randomInt(100000, 999999).toString();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

            await supabase.from('otp_codes').insert({ user_id: user.id, code: otpCodes, expires_at: expiresAt });
        }

        const message = `?? *KODE LOGIN ANDA*\n\nKode verifikasi login Anda adalah: *${otpCodes}*\n\nBerlaku selama 5 menit.`;
        const sendResult = await csBotService.sendOTP(user.phone, message);

        if (!sendResult.success) {
            console.error(`? [Login] Failed to send OTP:`, sendResult.error);
            return res.status(503).json({
                success: false,
                error: 'Gagal mengirim OTP WhatsApp. Pastikan koneksi WhatsApp Server aktif.'
            });
        }

        res.json({
            success: true,
            message: 'Login step 1 successful. OTP sent.',
            userId: user.id
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { login };
