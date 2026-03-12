const connectionService = require('../../services/whatsapp/connection.service');

const initSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.userId;
        const { phoneNumber } = req.body; // New: pairing code support
        await connectionService.connect(sessionId, userId, phoneNumber);
        res.json({
            success: true,
            message: `Initializing session '${sessionId}' for user ${userId}...`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const logout = async (req, res) => {
    try {
        const { socket, clearSessionHandler } = req.whatsappSession;

        if (socket) {
            try {
                await socket.logout();
            } catch (e) {
                console.log('Socket logout error:', e.message);
            }
        }

        if (clearSessionHandler) {
            await clearSessionHandler();
        }

        const sessionManager = require('../../services/whatsapp/session.manager');
        sessionManager.deleteSession(req.params.sessionId);

        res.json({
            success: true,
            message: `Session '${req.params.sessionId}' logged out successfully.`
        });
    } catch (error) {
        console.error('Error during logout:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to logout'
        });
    }
};

module.exports = { initSession, logout };
