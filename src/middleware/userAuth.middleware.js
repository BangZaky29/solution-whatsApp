/**
 * User Auth Middleware
 * Verifies the x-session-id header for data isolation.
 */
const userAuth = (req, res, next) => {
    const userId = req.headers['x-session-id'] || req.headers['X-Session-Id'];

    if (!userId || userId === 'null' || userId === 'undefined') {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized: Session ID (user_id) is required for this operation.'
        });
    }

    // UUID Format Validation (System sessions are allowed to bypass this)
    const SYSTEM_SESSIONS = ['wa-bot-ai', 'CS-BOT', 'main-session'];
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const isSystemOrBot = SYSTEM_SESSIONS.includes(userId) || userId.startsWith('wa-bot-ai');

    if (!UUID_REGEX.test(userId) && !isSystemOrBot) {
        return res.status(400).json({
            success: false,
            error: 'Invalid Session ID: Must be a valid UUID or registered system session.'
        });
    }

    // Attach to request for easier access in controllers
    req.userId = userId;
    next();
};

module.exports = { userAuth };
