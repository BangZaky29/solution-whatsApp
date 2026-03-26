const whatsappService = require('../whatsapp/whatsapp.service');
const supabase = require('../../config/supabase');

/**
 * MainSession Bot Service
 * Handles Administrative approvals mechanism like Payment Confirmations.
 */
class MainBotService {
    constructor() {
        this.sessionId = 'main-session';
        // Only accept commands from Super Admin
        const envAdmin = process.env.WA_SUPER_ADMIN_NUMBER || '6281995770190';
        this.adminNumbers = envAdmin.split(',').map(num => num.trim()); 
    }

    async handleIncomingMessage(sessionId, socket, msg) {
        if (sessionId !== this.sessionId) return;

        const remoteJid = msg.key.remoteJid;
        if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') return;

        // Clean JID to get just the number (handles Baileys '628xx:1@s.whatsapp.net' device IDs)
        const senderNum = remoteJid.split('@')[0].split(':')[0];
        console.log(`[Main-Bot] Incoming message from: ${senderNum}`);

        // Verify if sender is an admin
        if (!this.adminNumbers.includes(senderNum)) {
            console.log(`[Main-Bot] Ignoring message from non-admin: ${senderNum}`);
            return;
        }

        const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        if (!messageText) return;

        const senderId = remoteJid.split('@')[0];
        console.log(`✨ [Main-Bot] Read from Admin ${senderId}: "${messageText}"`);

        const lowerMsg = messageText.toLowerCase().trim();

        // Detect "setuju [username]" signature
        if (lowerMsg.startsWith('setuju ')) {
            const targetUsername = lowerMsg.substring(7).trim(); // Remove "setuju "
            await this.handlePaymentApproval(socket, remoteJid, targetUsername);
        }
    }

    generateReferralCode(planName) {
        const prefix = planName.includes('Gratis') ? 'FREE' : 'PRO';
        const randomString = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `WLK-${prefix}-${randomString}`;
    }

    getPlanMetrics(planName) {
        const lName = planName.toLowerCase();
        let max_warga = 30;
        let has_laporan = false;
        let has_chat = false;
        let has_panic_button = false;

        if (lName.includes('50.000')) {
            max_warga = 50;
            has_laporan = true;
            has_panic_button = true;
        } else if (lName.includes('80.000')) {
            max_warga = 100;
            has_laporan = true;
            has_chat = true;
            has_panic_button = true;
        } else if (lName.includes('150.000')) {
            max_warga = 150;
            has_laporan = true;
            has_chat = true;
            has_panic_button = true;
        } else if (lName.includes('180.000')) {
            max_warga = 200;
            has_laporan = true;
            has_chat = true;
            has_panic_button = true;
        }

        return { max_warga, has_laporan, has_chat, has_panic_button };
    }

    async handlePaymentApproval(socket, adminJid, username) {
        console.log(`[Main-Bot] Processing admin approval for user: ${username}`);
        try {
            // 1. Find the pending payment (Case-Insensitive using ilike)
            const { data: payments, error: fetchErr } = await supabase
                .from('warlok_web_payments')
                .select('*')
                .ilike('username', username)
                .eq('status', 'pending')
                .order('created_at', { ascending: true })
                .limit(1);

            if (fetchErr) throw fetchErr;

            if (!payments || payments.length === 0) {
                await whatsappService.sendTextMessage(socket, adminJid, 
                    `❌ Tidak ditemukan konfirmasi pembayaran dengan status 'pending' untuk username: *${username}*. Mungkin sudah dikonfirmasi atau salah penulisan username.`);
                return;
            }

            const payment = payments[0];

            // 2. Generate limits based on package name
            const planMetrics = this.getPlanMetrics(payment.package_name);
            const refCode = this.generateReferralCode(payment.package_name);

            // 3. Insert into subscription_codes
            const { error: insertCodeErr } = await supabase
                .from('subscription_codes')
                .insert({
                    code: refCode,
                    plan_name: payment.package_name,
                    max_warga: planMetrics.max_warga,
                    has_laporan: planMetrics.has_laporan,
                    has_chat: planMetrics.has_chat,
                    has_panic_button: planMetrics.has_panic_button,
                    is_used: false
                });

            if (insertCodeErr) throw insertCodeErr;

            // 4. Update warlok_web_payments to 'verified'
            const { error: updatePayErr } = await supabase
                .from('warlok_web_payments')
                .update({ status: 'verified' })
                .eq('id', payment.id);

            if (updatePayErr) throw updatePayErr;

            // 5. Tell Admin it was successful
            await whatsappService.sendTextMessage(socket, adminJid, 
                `✅ Pembayaran user *${username}* berhasil dikonfirmasi!\n\nKode Referral: *${refCode}* telah disiapkan dan WA otomatis sedang dikirim ke pembeli.`);

            // 6. Notify Buyer
            let cleanWa = payment.wa_number.replace(/\D/g, '');
            if (cleanWa.startsWith('0')) cleanWa = '62' + cleanWa.substring(1);

            const buyerMsg = `Halo *${username}*! Kami dari Tim Layanan WARLOK Administratif. 👋\n\nSelamat! Pembayaran langganan *${payment.package_name}* Anda telah *BERHASIL DIKONFIRMASI*.\n\nBerikut adalah Kode Langganan Anda (Referral Code):\n\n🔥 *${refCode}*\n\n_Silakan masuk ke aplikasi Warlok Anda -> Menu Profil -> Klaim Kode Langganan, dan masukkan kode di atas untuk membuka fitur premium kompleks perumahan Anda._\n\nTerima kasih telah bersama Warlok Nusantara!`;

            await whatsappService.sendTextMessage(socket, cleanWa, buyerMsg);
            console.log(`[Main-Bot] Approval complete. Notification sent to buyer (${cleanWa}).`);

        } catch (error) {
            console.error('[Main-Bot] Error in handlePaymentApproval:', error);
            await whatsappService.sendTextMessage(socket, adminJid, 
                `⚠️ Maaf kak, terjadi kesalahan sistem saat memproses konfirmasi:\n_${error.message}_`);
        }
    }
}

module.exports = new MainBotService();
