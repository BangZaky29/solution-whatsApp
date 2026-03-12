const supabase = require('../../config/supabase');
const csBotService = require('../../services/ai/csBot.service');
const crypto = require('crypto');
const notificationService = require('../../services/payment/notification.service');
const configService = require('../../services/common/config.service');

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

const register = async (req, res) => {
    try {
        let { phone, username, full_name, password, email } = req.body;

        if (!phone || !username || !email) {
            return res.status(400).json({ success: false, error: 'Phone, Username, and Email are required' });
        }

        // Basic Email Validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, error: 'Invalid email format' });
        }

        phone = normalizePhone(phone);

        // 1. Create user in Supabase
        const { data: user, error: userError } = await supabase
            .from('users')
            .upsert({ phone, username, full_name, password_hash: password, email }, { onConflict: 'phone' })
            .select()
            .single();

        if (userError) throw userError;

        // 2. Check for existing valid OTP
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
            console.log(`?? [OTP] Reusing existing code for ${username}: ${otpCodes}`);
        } else {
            // Generate New OTP
            otpCodes = crypto.randomInt(100000, 999999).toString();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

            const { error: otpError } = await supabase
                .from(configService.otpCodesTable)
                .insert({ user_id: user.id, code: otpCodes, expires_at: expiresAt });

            if (otpError) throw otpError;
        }

        // 3. Send OTP
        const message = `?? *KODE OTP ANDA*\n\nHalo ${full_name || username},\nKode verifikasi Anda adalah: *${otpCodes}*\n\nBerlaku selama 5 menit.`;
        const sendResult = await csBotService.sendOTP(phone, message);

        if (!sendResult.success) {
            console.error(`? [Register] Failed to send OTP:`, sendResult.error);
            return res.status(503).json({
                success: false,
                error: 'Pendaftaran berhasil disimpan, namun gagal mengirim OTP WhatsApp. Hubungi admin untuk aktivasi manual.'
            });
        }

        res.json({
            success: true,
            message: 'Registration successful. OTP sent.',
            userId: user.id
        });

        // Notify registration (async)
        notificationService.notifyRegistration(phone, full_name || username || 'User');
        console.log(`?? [Register] User registered: ${username}`);

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { register, normalizePhone };
