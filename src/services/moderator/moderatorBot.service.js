const supabase = require('../../config/supabase');
const { parseCommand, parseCommandStatic } = require('./commandParser');
const { validateCommand, getAvailableCommands } = require('./commandValidator');
const { executeCommand } = require('./commandExecutor');
const staticResponses = require('./staticResponses');
const logService = require('../common/log.service');

/**
 * Moderator Bot Service — Main Orchestrator
 * Handles incoming messages from moderator phone numbers.
 * Flow: Parse → Validate → (Confirm if destructive) → Execute → Log → Feedback
 */
class ModeratorBotService {
    constructor() {
        // Pending confirmation for destructive actions: Map<remoteJid, parsedCommand>
        this.pendingConfirm = new Map();
        console.log('🛡️ [ModeratorBot] Service initialized');
    }

    /**
     * Main handler for moderator messages
     * @param {string} sessionId
     * @param {object} socket - WA socket
     * @param {object} msg - WA message object
     */
    async handle(sessionId, socket, msg) {
        const remoteJid = msg.key.remoteJid;
        const messageText = msg.message?.conversation
            || msg.message?.extendedTextMessage?.text
            || '';
        const senderPhone = remoteJid.split('@')[0];

        if (!messageText.trim()) return;

        const lowerText = messageText.trim().toLowerCase();
        console.log(`🛡️ [ModeratorBot] Command from ${senderPhone}: "${messageText}"`);

        // ── CHECK FOR HELP COMMAND ──
        if (lowerText === 'help' || lowerText === 'bantuan' || lowerText === '/help') {
            await socket.sendMessage(remoteJid, {
                text: staticResponses.getHelpMenu()
            });
            return;
        }

        // ── CHECK PENDING CONFIRMATION ──
        if (this.pendingConfirm.has(remoteJid)) {
            await this._handleConfirmation(socket, remoteJid, lowerText, senderPhone);
            return;
        }

        // ── STEP 1: PARSE COMMAND (STATIC FIRST) ──
        // Moderators used pure System Logic now, no AI overhead.
        const parsedCommand = parseCommandStatic(messageText);

        if (parsedCommand.action === 'unknown') {
            // PURE SYSTEM RESPONSES (No AI fallback)
            const response = staticResponses.getResponse(messageText);
            
            await socket.sendMessage(remoteJid, { text: response });
            
            // Log as interaction (optional)
            await this._logAction(senderPhone, messageText, 'static_chat', null, 'success', null, 'Static system response sent');
            return;
        }

        // ── STEP 2: VALIDATE ──
        const validation = validateCommand(parsedCommand);

        if (!validation.allowed) {
            await socket.sendMessage(remoteJid, {
                text: `⛔ *Perintah Ditolak*\n\n${validation.reason}`
            });
            await this._logAction(senderPhone, messageText, parsedCommand.action, parsedCommand.target?.phone || parsedCommand.target?.username, 'blocked', validation.reason);
            return;
        }

        // ── STEP 3: DESTRUCTIVE CONFIRMATION ──
        if (validation.requiresConfirmation) {
            this.pendingConfirm.set(remoteJid, parsedCommand);

            // Auto-expire after 2 minutes
            setTimeout(() => {
                if (this.pendingConfirm.has(remoteJid)) {
                    this.pendingConfirm.delete(remoteJid);
                    socket.sendMessage(remoteJid, {
                        text: '⏰ *Konfirmasi Kedaluwarsa*\nWaktu konfirmasi telah habis. Silakan ulangi perintah.'
                    }).catch(() => { });
                }
            }, 120000);

            await socket.sendMessage(remoteJid, {
                text: `⚠️ *Konfirmasi Diperlukan*\n\n` +
                    `📋 *Aksi:* ${parsedCommand.rawIntent}\n` +
                    `🎯 *Target:* ${parsedCommand.target?.username || parsedCommand.target?.phone || parsedCommand.target?.name || '-'}\n\n` +
                    `Tindakan ini bersifat *destruktif* dan tidak dapat dibatalkan.\n` +
                    `Balas *KONFIRMASI* untuk melanjutkan atau *BATAL* untuk membatalkan.\n\n` +
                    `⏰ _Konfirmasi otomatis kedaluwarsa dalam 2 menit._`
            });
            return;
        }

        // ── STEP 4: EXECUTE ──
        await this._executeAndRespond(socket, remoteJid, senderPhone, messageText, parsedCommand);
    }

    /**
     * Handle confirmation/cancellation response
     */
    async _handleConfirmation(socket, remoteJid, lowerText, senderPhone) {
        const parsedCommand = this.pendingConfirm.get(remoteJid);

        const confirmWords = ['konfirmasi', 'confirm', 'ya', 'yes', 'iya', 'ok', 'lanjut'];
        const cancelWords = ['batal', 'cancel', 'tidak', 'no', 'gak', 'nggak'];

        if (confirmWords.some(w => lowerText.includes(w))) {
            this.pendingConfirm.delete(remoteJid);
            await this._executeAndRespond(socket, remoteJid, senderPhone, parsedCommand.rawIntent, parsedCommand);
        } else if (cancelWords.some(w => lowerText.includes(w))) {
            this.pendingConfirm.delete(remoteJid);
            await socket.sendMessage(remoteJid, {
                text: '❌ *Dibatalkan*\nPerintah telah dibatalkan. Tidak ada perubahan yang dilakukan.'
            });
            await this._logAction(senderPhone, parsedCommand.rawIntent, parsedCommand.action, null, 'cancelled', 'Dibatalkan oleh moderator');
        } else {
            await socket.sendMessage(remoteJid, {
                text: '❓ Balas *KONFIRMASI* untuk melanjutkan atau *BATAL* untuk membatalkan.'
            });
        }
    }

    /**
     * Execute command and send feedback
     */
    async _executeAndRespond(socket, remoteJid, senderPhone, rawCommand, parsedCommand) {
        await socket.sendPresenceUpdate('composing', remoteJid);

        const startTime = Date.now();
        const result = await executeCommand(parsedCommand);
        const latency = Date.now() - startTime;

        const targetId = parsedCommand.target?.username || parsedCommand.target?.phone || parsedCommand.target?.name || '-';
        const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

        if (result.success) {
            const feedback = `✅ *Aksi Berhasil*\n\n` +
                `📋 *Perintah:* ${parsedCommand.rawIntent}\n` +
                `🎯 *Target:* ${result.targetUser?.full_name || result.targetUser?.username || targetId}\n` +
                `📊 *Hasil:* ${result.result}\n` +
                `⚡ *Latency:* ${latency}ms\n` +
                `🕐 *Waktu:* ${now}`;

            // ── IF MEDIA PRESENT, SEND AS ONE MESSAGE ──
            if (result.mediaPayload) {
                const { url, type, fileName } = result.mediaPayload;
                let mediaMessage = {};
                const mime = type || 'application/octet-stream';
                
                if (mime.startsWith('image/')) {
                    mediaMessage = { image: { url }, mimetype: mime, caption: feedback };
                } else if (mime.startsWith('video/')) {
                    mediaMessage = { video: { url }, mimetype: mime, caption: feedback };
                } else if (mime.startsWith('audio/')) {
                    mediaMessage = { audio: { url }, mimetype: mime, ptt: false };
                    // For audio, we might still send text separately as audio doesn't support captions in all clients
                    await socket.sendMessage(remoteJid, { text: feedback });
                } else {
                    mediaMessage = { document: { url }, fileName: fileName, mimetype: mime, caption: feedback };
                }
                
                if (Object.keys(mediaMessage).length > 0) {
                    console.log(`📤 [ModeratorBot] Sending media (${mime}) for ${targetId}`);
                    await socket.sendMessage(remoteJid, mediaMessage);
                } else {
                    await socket.sendMessage(remoteJid, { text: feedback });
                }
            } else {
                // Regular text response
                await socket.sendMessage(remoteJid, { text: feedback });
            }

            // ── NOTIFY TARGET USER VIA CS-BOT ──
            if (result.targetUser?.phone) {
                await this._notifyTargetUser(result.targetUser, parsedCommand);
            }
        } else {
            await socket.sendMessage(remoteJid, {
                text: `❌ *Gagal Eksekusi*\n\n📋 *Perintah:* ${parsedCommand.rawIntent}\n📊 *Error:* ${result.result}\n🕐 *Waktu:* ${now}`
            });
        }

        // ── LOG TO DB ──
        await this._logAction(
            senderPhone,
            rawCommand,
            parsedCommand.action,
            targetId,
            result.success ? 'success' : 'failed',
            result.success ? null : result.result,
            result.result
        );
    }

    /**
     * Notify target user via CS-BOT session about moderator action
     */
    async _notifyTargetUser(targetUser, parsedCommand) {
        try {
            const sessionManager = require('../whatsapp/session.manager');
            const csSession = sessionManager.getSession('CS-BOT');

            if (!csSession || !csSession.socket || csSession.connectionState?.connection !== 'open') {
                console.warn('⚠️ [ModeratorBot] CS-BOT not available for notification');
                return;
            }

            const targetJid = targetUser.phone + '@s.whatsapp.net';
            const actionLabels = {
                delete_media: '🗑️ Beberapa media Anda telah dihapus dari cloud oleh administrator.',
                activate_package: '🎉 Paket premium Anda telah diaktifkan oleh administrator!',
                add_tokens: '💰 Token telah ditambahkan ke akun Anda oleh administrator.',
                reset_tokens: '🔄 Saldo token Anda telah direset oleh administrator.',
                block_contact: '🚫 Sebuah kontak telah diblokir dari bot Anda oleh administrator.',
                deactivate_bot: '⏸️ Bot AI Anda telah dinonaktifkan oleh administrator.',
                activate_bot: '▶️ Bot AI Anda telah diaktifkan oleh administrator.'
            };

            const notifText = actionLabels[parsedCommand.action];
            if (!notifText) return;

            const whatsappService = require('../whatsapp/whatsapp.service');
            const message = `🔔 *Notifikasi Sistem*\n\n${notifText}\n\nJika ada pertanyaan, hubungi admin.`;

            await whatsappService.sendTextMessage(csSession.socket, targetJid, message);
            console.log(`📨 [ModeratorBot] Notification sent to ${targetUser.phone} via CS-BOT`);

        } catch (error) {
            console.error(`❌ [ModeratorBot] Failed to notify target user: ${error.message}`);
        }
    }

    /**
     * Log moderator action to DB
     */
    async _logAction(moderatorPhone, rawCommand, action, targetId, status, reason = null, resultSummary = null) {
        try {
            await supabase.from('moderator_logs').insert({
                moderator_phone: moderatorPhone,
                raw_command: rawCommand.substring(0, 500),
                parsed_action: action,
                target_identifier: targetId,
                status,
                reason,
                result_summary: resultSummary?.substring(0, 1000)
            });
        } catch (error) {
            console.error(`❌ [ModeratorBot] Failed to log action: ${error.message}`);
        }
    }
}

module.exports = new ModeratorBotService();
