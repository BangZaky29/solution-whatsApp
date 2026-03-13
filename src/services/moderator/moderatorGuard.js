const supabase = require('../../config/supabase');

/**
 * Moderator Guard
 * Validates whether a sender has moderator privileges.
 * Uses two layers: ENV whitelist + DB role check.
 */

// Normalize phone: strip leading 0, ensure 62 prefix
function normalizePhone(phone) {
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('0')) clean = '62' + clean.substring(1);
    return clean;
}

/**
 * Check if a phone number belongs to the env-configured moderator
 */
function isModeratorPhone(senderPhone) {
    const modPhone = process.env.MODERATOR_PHONE;
    if (!modPhone) return false;
    return normalizePhone(senderPhone) === normalizePhone(modPhone);
}

/**
 * Check if sender is a moderator (ENV or DB role)
 * @param {string} senderPhone - raw phone number from WA
 * @returns {Promise<boolean>}
 */
async function isModerator(senderPhone) {
    // Layer 1: ENV whitelist (fastest check)
    if (isModeratorPhone(senderPhone)) return true;

    // Layer 2: DB role check
    const normalized = normalizePhone(senderPhone);
    const { data } = await supabase
        .from('users')
        .select('role')
        .eq('phone', normalized)
        .single();

    return data?.role === 'moderator';
}

/**
 * Get user role by phone
 * @param {string} phone
 * @returns {Promise<string|null>}
 */
async function getUserRole(phone) {
    const normalized = normalizePhone(phone);
    const { data } = await supabase
        .from('users')
        .select('role')
        .eq('phone', normalized)
        .single();

    return data?.role || null;
}

/**
 * Get user role by userId
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
async function getUserRoleById(userId) {
    const { data } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

    return data?.role || null;
}

module.exports = {
    isModerator,
    isModeratorPhone,
    getUserRole,
    getUserRoleById,
    normalizePhone
};
