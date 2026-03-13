/**
 * Command Validator
 * Validates parsed moderator commands against whitelist/blacklist rules.
 * Returns whether the command is allowed to execute.
 */

// ─── BLACKLISTED ACTIONS ───
// These actions are NEVER allowed, regardless of who sends them
const BLACKLISTED_ACTIONS = new Set([
    'delete_account',
    'change_password',
    'change_role',
    'view_sensitive',
    'bulk_delete',
    'bypass_payment'
]);

// ─── BLACKLIST REASONS (Indonesian) ───
const BLACKLIST_REASONS = {
    delete_account: '🚫 Menghapus akun user dari sistem tidak diizinkan. Data user harus tetap ada untuk audit trail.',
    change_password: '🔒 Mengubah password user secara langsung tidak diizinkan demi keamanan akun.',
    change_role: '👤 Mengubah role user (termasuk promosi ke moderator) hanya bisa dilakukan langsung di database.',
    view_sensitive: '🔐 Mengakses data sensitif (password_hash, OTP codes) tidak diizinkan melalui command.',
    bulk_delete: '💣 Penghapusan massal tanpa target spesifik tidak diizinkan. Harap sebutkan target user yang jelas.',
    bypass_payment: '💳 Bypass pembayaran atau marking lunas manual tanpa log transaksi tidak diizinkan.'
};

// ─── WHITELISTED ACTIONS ───
const WHITELISTED_ACTIONS = new Set([
    'delete_media',
    'activate_package',
    'add_tokens',
    'reset_tokens',
    'get_user_info',
    'block_contact',
    'list_users',
    'deactivate_bot',
    'activate_bot',
    'view_media'
]);

// ─── DESTRUCTIVE ACTIONS ───
// These require explicit confirmation before executing
const DESTRUCTIVE_ACTIONS = new Set([
    'delete_media',
    'reset_tokens',
    'deactivate_bot',
    'block_contact'
]);

/**
 * Validate a parsed command
 * @param {object} parsedCommand - output from commandParser
 * @returns {{ allowed: boolean, reason?: string, requiresConfirmation?: boolean }}
 */
function validateCommand(parsedCommand) {
    const { action, target, params } = parsedCommand;

    // 1. Check blacklist first
    if (BLACKLISTED_ACTIONS.has(action)) {
        return {
            allowed: false,
            reason: BLACKLIST_REASONS[action] || '⛔ Perintah ini tidak diizinkan oleh kebijakan sistem.'
        };
    }

    // 2. Check if action is recognized
    if (!WHITELISTED_ACTIONS.has(action)) {
        return {
            allowed: false,
            reason: '❓ Perintah tidak dikenali. Gunakan perintah yang tersedia.\n\n' + getAvailableCommands()
        };
    }

    // 3. Validate target is specified for user-specific actions
    const requiresTarget = ['delete_media', 'activate_package', 'add_tokens', 'reset_tokens',
                            'get_user_info', 'block_contact', 'deactivate_bot', 'activate_bot', 'view_media'];
    if (requiresTarget.includes(action)) {
        if (!target?.phone && !target?.username && !target?.name) {
            return {
                allowed: false,
                reason: '🎯 Target user harus disebutkan. Gunakan nomor telepon atau username.\nContoh: "hapus media user bangzaky0029" atau "hapus media 628xxxxxxx"'
            };
        }
    }

    // 4. Validate specific params
    if (action === 'add_tokens' && (!params?.tokenAmount || params.tokenAmount <= 0)) {
        return {
            allowed: false,
            reason: '🔢 Jumlah token harus disebutkan dan lebih dari 0.\nContoh: "tambah 500 token untuk user bangzaky0029"'
        };
    }

    if (action === 'reset_tokens' && (params?.tokenAmount === undefined || params?.tokenAmount === null)) {
        return {
            allowed: false,
            reason: '🔢 Jumlah token baru harus disebutkan (bisa 0).\nContoh: "reset token bangzaky jadi 100" atau "kosongkan token bangzaky"'
        };
    }

    if (action === 'activate_package' && !params?.packageName) {
        return {
            allowed: false,
            reason: '📦 Nama paket harus disebutkan (Basic, Premium, atau Pro).\nContoh: "aktifkan paket premium untuk user bangzaky0029"'
        };
    }

    // 5. Check for SQL injection patterns
    const rawText = JSON.stringify(parsedCommand).toLowerCase();
    const sqlPatterns = ['drop table', 'delete from', 'truncate', 'alter table', '--', ';--', 'union select'];
    for (const pattern of sqlPatterns) {
        if (rawText.includes(pattern)) {
            return {
                allowed: false,
                reason: '🛡️ Terdeteksi pola berbahaya dalam perintah. Perintah ditolak.'
            };
        }
    }

    // 6. Determine if confirmation is needed
    const requiresConfirmation = DESTRUCTIVE_ACTIONS.has(action) || parsedCommand.isDestructive;

    return {
        allowed: true,
        requiresConfirmation
    };
}

/**
 * Get list of available commands for help message
 */
function getAvailableCommands() {
    return `🛡️ *PANDUAN SISTEM MODERATOR*

Saya adalah **System Bot** (Non-AI). Berikut daftar lengkap perintah yang bisa saya lakukan:

💰 *TOKEN & PAKET*
• \`tambah token user [ID] [jumlah]\`
• \`reset token user [ID] jadi [jumlah]\`
• \`kosongkan token user [ID]\` (Set saldo ke 0)
• \`aktifkan paket [premium/pro/basic] user [ID]\`

📸 *MEDIA & DATA*
• \`tampilkan foto user [ID]\` (Kirim file media terbaru)
• \`hapus media user [ID]\` (Hapus dari cloud storage)
• \`info user [ID]\` (Lihat profil, sisa token, & paket)
• \`daftar user\` (Lihat 20 user terbaru sistem)

⚙️ *KONTROL BOT*
• \`matikan bot user [ID]\`
• \`aktifkan bot user [ID]\`
• \`blokir kontak [nomor_kontak] dari [ID_user]\`

💡 *TIPS CEPAT*
- Lu bisa ngetik santai (tanpa "!"): _"reset bangzaky"_
- [ID] bisa berupa **Username** atau **Nomor WA**.
- Media dikirim sebagai *file asli* (bukan link).`;
}

module.exports = {
    validateCommand,
    getAvailableCommands,
    DESTRUCTIVE_ACTIONS,
    BLACKLISTED_ACTIONS
};
