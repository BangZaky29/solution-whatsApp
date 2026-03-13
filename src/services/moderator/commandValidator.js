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
    'activate_bot'
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
                            'get_user_info', 'block_contact', 'deactivate_bot', 'activate_bot'];
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
    return `📋 *Daftar Perintah Moderator:*

✅ *hapus media* user [nama/nomor] — Hapus media dari cloud
✅ *aktifkan paket* [nama_paket] untuk [nama/nomor] — Aktifkan paket premium
✅ *tambah [jumlah] token* untuk [nama/nomor] — Tambah token
✅ *reset token* [nama/nomor] jadi [jumlah] — Reset token balance
✅ *info user* [nama/nomor] — Lihat info user
✅ *blokir kontak* [kontak] dari [user] — Blokir kontak
✅ *daftar user* — Tampilkan semua user
✅ *nonaktifkan bot* [nama/nomor] — Nonaktifkan bot user
✅ *aktifkan bot* [nama/nomor] — Aktifkan bot user`;
}

module.exports = {
    validateCommand,
    getAvailableCommands,
    DESTRUCTIVE_ACTIONS,
    BLACKLISTED_ACTIONS
};
