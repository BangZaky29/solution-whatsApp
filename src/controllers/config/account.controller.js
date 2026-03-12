const supabase = require('../../config/supabase');
const configService = require('../../services/common/config.service');
const csBotService = require('../../services/ai/csBot.service');
const crypto = require('crypto');

const requestWipeOtp = async (req, res) => {
    try {
        const userId = req.userId;
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('phone, full_name, username')
            .eq('id', userId)
            .single();

        if (userError || !user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Generate New OTP
        const otpCodes = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        const { error: otpError } = await supabase
            .from(configService.otpCodesTable)
            .insert({ user_id: userId, code: otpCodes, expires_at: expiresAt });

        if (otpError) throw otpError;

        // Send OTP via CS-BOT
        const message = `?? *KONFIRMASI PENGHAPUSAN AKUN*\n\nHalo ${user.full_name || user.username},\nAnda telah meminta penghapusan SELURUH data akun Anda.\n\nKode verifikasi Anda adalah: *${otpCodes}*\n\n*PENTING:* Masukkan kode ini untuk mengonfirmasi penghapusan permanen. Jika Anda tidak merasa melakukan ini, segera amankan akun Anda.`;

        const sendResult = await csBotService.sendOTP(user.phone, message);

        if (!sendResult.success) {
            console.error(`? [requestWipeOtp] Failed to send OTP:`, sendResult.error);
            return res.status(503).json({
                success: false,
                error: 'Gagal mengirim OTP WhatsApp. Pastikan CS-BOT aktif.'
            });
        }

        res.json({ success: true, message: 'OTP sent to your WhatsApp.' });
    } catch (error) {
        console.error(`? [requestWipeOtp] Catch:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

const wipeAccountData = async (req, res) => {
    const sessionManager = require('../../services/whatsapp/session.manager');

    try {
        const userId = req.userId;
        const { otpCode } = req.body;

        if (!otpCode) {
            return res.status(400).json({ success: false, error: 'OTP code is required' });
        }

        // 1. Verify OTP
        const { data: otp, error: otpErr } = await supabase
            .from(configService.otpCodesTable)
            .select('*')
            .eq('user_id', userId)
            .eq('code', otpCode)
            .eq('is_used', false)
            .gt('expires_at', new Date().toISOString())
            .single();

        if (otpErr || !otp) {
            return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
        }

        // Mark OTP as used
        await supabase.from(configService.otpCodesTable).update({ is_used: true }).eq('id', otp.id);

        const displayName = await configService.getUserDisplay(userId);
        const { data: user } = await supabase.from('users').select('phone').eq('id', userId).single();

        console.log(`\n?? ============================================`);
        console.log(`?? [wipeAccountData] FULL ACCOUNT DELETION`);
        console.log(`?? User: ${displayName} (${userId})`);
        console.log(`?? ============================================\n`);

        //  STEP 1: Disconnect & clear WhatsApp session 
        const session = sessionManager.getSession(userId);
        if (session) {
            console.log(`?? [wipeAccountData] Disconnecting WhatsApp session...`);
            if (session.socket) {
                try {
                    await session.socket.logout();
                    console.log(`? [wipeAccountData] WhatsApp socket logged out.`);
                } catch (e) {
                    console.warn(`?? [wipeAccountData] Socket logout warning: ${e.message}`);
                }
            }
            // Clear WA auth state from database (session keys stored in wa_ai_sessions)
            if (session.clearSessionHandler) {
                try {
                    await session.clearSessionHandler();
                    console.log(`? [wipeAccountData] WA auth state cleared from database.`);
                } catch (e) {
                    console.warn(`?? [wipeAccountData] Clear session warning: ${e.message}`);
                }
            }
            sessionManager.deleteSession(userId);
            console.log(`? [wipeAccountData] In-memory session removed.`);
        }

        //  STEP 2: Delete files from Storage (whatsapp-media) 
        console.log(`?? [wipeAccountData] Cleaning up storage files...`);
        try {
            // List all files in the user's folder
            const { data: files, error: listError } = await supabase.storage
                .from('whatsapp-media')
                .list(userId);

            if (files && files.length > 0) {
                const pathsToDelete = files.map(file => `${userId}/${file.name}`);
                const { error: deleteError } = await supabase.storage
                    .from('whatsapp-media')
                    .remove(pathsToDelete);

                if (deleteError) {
                    console.warn(`?? [wipeAccountData] Storage deletion warning: ${deleteError.message}`);
                } else {
                    console.log(`? [wipeAccountData] Deleted ${files.length} files from storage.`);
                }
            }
        } catch (e) {
            console.warn(`?? [wipeAccountData] Storage cleanup exception: ${e.message}`);
        }

        //  STEP 3: Dynamic Table Deletion based on Environment 
        const tablesToDelete = [
            configService.getTableName('wa_chat_history'),
            configService.getTableName('wa_media'),
            configService.getTableName('wa_bot_logs'),
            configService.getTableName('wa_bot_contacts'),
            configService.getTableName('wa_bot_blocked_attempts'),
            configService.getTableName('wa_bot_api_keys'),
            configService.getTableName('wa_bot_prompts'),
            configService.getTableName('user_sessions'),
            'topup_orders',
            'token_transactions',
            'token_balances',
            'subscriptions',
            configService.otpCodesTable,
            configService.getTableName('wa_sessions') // Primary session record
        ];

        // Also clean the wa_ai_sessions equivalent if it exists
        tablesToDelete.push(configService.getTableName('wa_ai_sessions'));

        for (const table of tablesToDelete) {
            console.log(`???  [wipeAccountData] Wiping table: ${table}...`);
            const { error: tblErr } = await supabase
                .from(table)
                .delete()
                .eq('user_id', userId);

            if (tblErr) {
                // Ignore errors for tables that might not exist in local mode (like subscriptions)
                if (tblErr.code !== '42P01') {
                    console.warn(`?? [wipeAccountData] Warning deleting from ${table}: ${tblErr.message}`);
                }
            }
        }

        //  STEP 4: Delete wa_bot_settings (uses pattern in ID) 
        const settingsTable = configService.settingsTable;
        console.log(`???  [wipeAccountData] Wiping ${settingsTable} pattern...`);
        const { error: settingsErr } = await supabase
            .from(settingsTable)
            .delete()
            .like('id', `%${userId}%`);

        if (settingsErr) {
            console.warn(`?? [wipeAccountData] Warning deleting from ${settingsTable}: ${settingsErr.message}`);
        }

        //  STEP 5: Delete user from public.users 
        console.log(`?? [wipeAccountData] Deleting user record from public.users...`);
        const { error: usersErr } = await supabase
            .from('users')
            .delete()
            .eq('id', userId);

        if (usersErr) {
            console.error(`? [wipeAccountData] Failed to delete from public.users: ${usersErr.message}`);
            throw new Error(`Failed to delete user record: ${usersErr.message}`);
        }

        //  STEP 6: Delete auth identity from Supabase Auth 
        console.log(`?? [wipeAccountData] Deleting Supabase Auth user...`);
        const { error: authError } = await supabase.auth.admin.deleteUser(userId);
        if (authError) {
            console.error(`? [wipeAccountData] Failed to delete auth user: ${authError.message}`);
            // We proceed as public data is already wiped
        } else {
            console.log(`? [wipeAccountData] Supabase Auth user DELETED.`);
        }

        //  STEP 7: Final Notification (If possible) 
        if (user && user.phone) {
            const finalMsg = `? *PENGHAPUSAN AKUN SELESAI*\n\nHalo,\nSeluruh data akun Anda telah dihapus secara permanen dari sistem kami sesuai permintaan.\n\nTerima kasih telah menggunakan layanan kami.`;
            await csBotService.sendOTP(user.phone, finalMsg);
        }

        console.log(`\n?? [wipeAccountData] COMPLETE - Account ${displayName} fully removed.\n`);

        res.json({ success: true, message: 'Account and all data have been permanently deleted.' });
    } catch (error) {
        console.error(`? [wipeAccountData] FATAL ERROR:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    requestWipeOtp,
    wipeAccountData
};

