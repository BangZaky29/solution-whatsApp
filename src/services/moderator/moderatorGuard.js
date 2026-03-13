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
 * Check if a phone number belongs to the env-configured moderator list
 */
function isModeratorPhone(senderPhone) {
    const modPhones = (process.env.MODERATOR_PHONE || '').split(',').map(p => p.trim());
    const normalizedSender = normalizeIdentifier(senderPhone);
    
    return modPhones.some(p => normalizeIdentifier(p) === normalizedSender);
}

/**
 * Check if identifier is a moderator (ENV or DB role)
 * @param {string} identifier - phone or LID
 * @returns {Promise<boolean>}
 */
async function isModerator(identifier) {
    if (!identifier) return false;
    
    // Layer 1: ENV whitelist (multiple allowed via comma)
    const modPhones = (process.env.MODERATOR_PHONE || '').split(',').map(p => p.trim());
    const normalized = normalizeIdentifier(identifier);
    
    if (modPhones.some(p => normalizeIdentifier(p) === normalized)) return true;

    // Layer 2: DB role check
    const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(identifier);
    
    let query = supabase.from('users').select('role');
    
    if (isUUID) {
        query = query.eq('id', identifier);
    } else {
        query = query.eq('phone', normalized);
    }

    const { data } = await query.maybeSingle();

    if (data?.role === 'moderator') return true;
    
    return false;
}

/**
 * Get user role by phone/identifier
 * @param {string} phone
 * @returns {Promise<string|null>}
 */
async function getUserRole(identifier) {
    const normalized = normalizeIdentifier(identifier);
    const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(identifier);

    let query = supabase.from('users').select('role');
    
    if (isUUID) {
        query = query.eq('id', identifier);
    } else {
        query = query.eq('phone', normalized);
    }

    const { data } = await query.maybeSingle();
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
    normalizeIdentifier,
    normalizePhone: normalizeIdentifier // Alias for backward compatibility
};
