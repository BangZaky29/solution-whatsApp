const supabase = require('../../config/supabase');

/**
 * Moderator Guard
 * Validates whether a sender has moderator privileges.
 * Uses two layers: ENV whitelist + DB role check.
 */

// Normalize: strip non-digits, but handle potential LIDs (which are just digits usually)
function normalizeIdentifier(identifier) {
    if (!identifier) return '';
    let clean = identifier.replace(/\D/g, '');
    // If it's a standard phone (9-13 digits) starting with 0, prefix with 62
    if (clean.length >= 9 && clean.length <= 15 && clean.startsWith('0')) {
        clean = '62' + clean.substring(1);
    }
    return clean;
}

/**
 * Check if a phone number belongs to the env-configured moderator
 */
function isModeratorPhone(senderPhone) {
    const modPhone = process.env.MODERATOR_PHONE;
    if (!modPhone) return false;
    return normalizeIdentifier(senderPhone) === normalizeIdentifier(modPhone);
}

/**
 * Check if identifier is a moderator (ENV or DB role)
 * @param {string} identifier - phone or LID
 * @returns {Promise<boolean>}
 */
async function isModerator(identifier) {
    if (!identifier) return false;
    
    // Layer 1: ENV whitelist
    const modPhone = process.env.MODERATOR_PHONE;
    const normalized = normalizeIdentifier(identifier);
    if (modPhone && normalized === normalizeIdentifier(modPhone)) return true;

    // Layer 2: DB role check
    const { data } = await supabase
        .from('users')
        .select('role')
        .or(`phone.eq.${normalized},id.eq.${identifier}`) // Check phone or UUID/LID matching
        .maybeSingle();

    if (data?.role === 'moderator') return true;
    
    // Special fallback: checking if this normalized string exists in users.phone
    if (normalized) {
        const { data: phoneUser } = await supabase
            .from('users')
            .select('role')
            .eq('phone', normalized)
            .maybeSingle();
        if (phoneUser?.role === 'moderator') return true;
    }

    return false;
}

/**
 * Get user role by phone
 * @param {string} phone
 * @returns {Promise<string|null>}
 */
function getUserRole(identifier) {
    const normalized = normalizeIdentifier(identifier);
    return supabase
        .from('users')
        .select('role')
        .or(`phone.eq.${normalized},id.eq.${identifier}`)
        .maybeSingle()
        .then(({ data }) => data?.role || null);
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
    normalizeIdentifier,
    normalizePhone: normalizeIdentifier // Alias for backward compatibility
};
