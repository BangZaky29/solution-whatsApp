const supabase = require('../../config/supabase');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    
    const normalized = normalizeIdentifier(identifier);
    const isUUID = UUID_REGEX.test(identifier);

    // Layer 1: Direct DB Check
    let query = supabase.from('users').select('role');
    if (isUUID) {
        query = query.eq('id', identifier);
    } else {
        query = query.or(`phone.eq.${normalized},username.eq.${identifier}`);
    }
    const { data } = await query.maybeSingle();

    if (data) {
        // Registered user: follow their role strictly.
        return data.role === 'moderator';
    }

    // Layer 2: Whitelist Fallback with Linked Identity Check
    const modPhones = (process.env.MODERATOR_PHONE || '').split(',').map(p => p.trim());
    const isWhitelisted = modPhones.some(p => normalizeIdentifier(p) === normalized);
    
    if (!isWhitelisted) return false;

    // If whitelisted but not individually in DB, check if ANY other whitelisted identity is in DB as 'user'.
    // This handles multi-device LIDs that aren't registered yet but are linked to a registered account in .env.
    const normalizedWhites = modPhones.map(p => normalizeIdentifier(p)).filter(p => p !== normalized);
    
    if (normalizedWhites.length > 0) {
        const { data: linkedUsers } = await supabase
            .from('users')
            .select('role')
            .in('phone', normalizedWhites);
            
        if (linkedUsers && linkedUsers.length > 0) {
            // If any linked identity says 'user', then we follow that demotion.
            const hasDemotedAlias = linkedUsers.some(u => u.role === 'user');
            if (hasDemotedAlias) return false;
        }
    }
    
    return true; 
}

/**
 * Get user role by phone/identifier
 * @param {string} phone
 * @returns {Promise<string|null>}
 */
async function getUserRole(identifier) {
    const normalized = normalizeIdentifier(identifier);
    const isUUID = UUID_REGEX.test(identifier);

    let query = supabase.from('users').select('role');
    if (isUUID) {
        query = query.eq('id', identifier);
    } else {
        query = query.or(`phone.eq.${normalized},username.eq.${identifier}`);
    }
    const { data } = await query.maybeSingle();

    if (data) return data.role;

    // Fallback: Check whitelist collective
    const modPhones = (process.env.MODERATOR_PHONE || '').split(',').map(p => p.trim());
    const isWhitelisted = modPhones.some(p => normalizeIdentifier(p) === normalized);
    
    if (!isWhitelisted) return 'user';

    const normalizedWhites = modPhones.map(p => normalizeIdentifier(p)).filter(p => p !== normalized);
    if (normalizedWhites.length > 0) {
        const { data: linkedUsers } = await supabase.from('users').select('role').in('phone', normalizedWhites);
        if (linkedUsers?.some(u => u.role === 'user')) return 'user';
    }
    
    return 'moderator';
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
