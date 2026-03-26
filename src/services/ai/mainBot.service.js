const whatsappService = require('../whatsapp/whatsapp.service');
const { warlokSupabase } = require('../../config/supabase');

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

        // Robustly extract text
        let messageText = "";
        const m = msg.message;
        if (m) {
            messageText = m.conversation || 
                          m.extendedTextMessage?.text || 
                          m.ephemeralMessage?.message?.extendedTextMessage?.text || 
                          m.ephemeralMessage?.message?.conversation || 
                          "";
        }

        if (!messageText) return;

        const senderId = remoteJid.split('@')[0];
        console.log(`✨ [Main-Bot] Read from Admin ${senderId}: "${messageText}"`);

        const lowerMsg = messageText.toLowerCase().trim();

        // Detect "setuju [username]" or just "setuju"
        if (lowerMsg.startsWith('setuju')) {
            let targetUsername = null;
            if (lowerMsg.length > 6) {
                targetUsername = lowerMsg.substring(6).trim(); // Remove "setuju"
            }
            await this.handlePaymentApproval(socket, remoteJid, targetUsername);
        }
    }

    generateReferralCode(planName) {
        const prefix = planName.includes('Gratis') ? 'FREE' : 'PRO';
        const randomString = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `WLK-${prefix}-${randomString}`;
    }

    async handlePaymentApproval(socket, adminJid, username) {
        console.log(`[Main-Bot] Processing admin approval for user: ${username || 'OLDEST_PENDING'}`);
        try {
            // 1. Find the pending payment
            let query = warlokSupabase
                .from('warlok_web_payments')
                .select('*')
                .eq('status', 'pending');
            
            if (username && username.length > 0) {
                query = query.ilike('username', username);
            }

            const { data: payments, error: fetchErr } = await query
                .order('created_at', { ascending: true })
                .limit(1);

            if (fetchErr) throw fetchErr;

            if (!payments || payments.length === 0) {
                await whatsappService.sendTextMessage(socket, adminJid, 
                    `❌ Tidak ditemukan konfirmasi pembayaran dengan status 'pending'. Mungkin sudah dikonfirmasi semua, atau username salah ketik.`);
                return;
            }

            const payment = payments[0];
            const actualUsername = payment.username;

            // 2. Fetch plan metrics from database (Dynamic!)
            const { data: planData, error: planErr } = await warlokSupabase
                .from('subscription_plans')
                .select('*')
                .eq('name', payment.package_name)
                .single();

            // Fallback limits if plan not found in database
            const planMetrics = planData || {
                max_warga: 15,
                has_laporan: false,
                has_chat: false,
                has_panic_button: false
            };

            const refCode = this.generateReferralCode(payment.package_name);

            // 3. Insert into subscription_codes
            const { error: insertCodeErr } = await warlokSupabase
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
            const { error: updatePayErr } = await warlokSupabase
                .from('warlok_web_payments')
                .update({ status: 'verified' })
                .eq('id', payment.id);

            if (updatePayErr) throw updatePayErr;

            // 5. Tell Admin it was successful
            await whatsappService.sendTextMessage(socket, adminJid, 
                `✅ Pembayaran atas nama *${actualUsername}* berhasil dikonfirmasi!\n\nKode Referral: *${refCode}* telah disiapkan dan WA otomatis sedang dikirim ke pembeli.`);

            // 6. Notify Buyer
            let cleanWa = payment.wa_number.replace(/\D/g, '');
            if (cleanWa.startsWith('0')) cleanWa = '62' + cleanWa.substring(1);

            const buyerMsg = `Halo *${actualUsername}*! Kami dari Tim Layanan WARLOK Administratif. 👋\n\nSelamat! Pembayaran langganan *${payment.package_name}* Anda telah *BERHASIL DIKONFIRMASI*.\n\nBerikut adalah Kode Langganan Anda (Referral Code):\n\n🔥 *${refCode}*\n\n_Silakan masuk ke aplikasi Warlok Anda -> Menu Profil -> Klaim Kode Langganan, dan masukkan kode di atas untuk membuka fitur premium kompleks perumahan Anda._\n\nTerima kasih telah bersama Warlok Nusantara!`;

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
