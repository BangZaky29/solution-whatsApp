const sessionManager = require('../services/whatsapp/session.manager');

/**
 * Middleware to validate WhatsApp session
 */
const validateSession = (req, res, next) => {
    const { sessionId } = req.params;
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
