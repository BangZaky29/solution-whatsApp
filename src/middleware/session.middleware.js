const sessionManager = require('../services/whatsapp/session.manager');

/**
 * Middleware to validate WhatsApp session
 */
const validateSession = (req, res, next) => {
    const { sessionId } = req.params;
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Ownership check: If it's a UUID session, it MUST belong to the authenticated user
    // EXCEPT for status and qr routes which are intended to be accessible for polling
    const isPublicRoute = req.path.endsWith('/status') || req.path.endsWith('/qr');

    if (UUID_REGEX.test(sessionId) && req.userId !== sessionId && !isPublicRoute) {
        return res.status(403).json({
            success: false,
            error: "Forbidden: You do not own this session."
        });
    }

    const session = sessionManager.getSession(sessionId);

    if (!session && !req.path.endsWith('/init') && !req.path.endsWith('/status') && !req.path.endsWith('/qr')) {
        return res.status(404).json({
            success: false,
            error: `Session '${sessionId}' not found. Please initialize first at /api/whatsapp/${sessionId}/init (POST)`
        });
    }

    req.whatsappSession = session;
    next();
};

module.exports = {
    validateSession
};
