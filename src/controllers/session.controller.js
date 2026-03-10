const sessionManager = require('../services/whatsapp/session.manager');
const connectionService = require('../services/whatsapp/connection.service');
const whatsappService = require('../services/whatsapp/whatsapp.service');
const QRCode = require('qrcode');

/**
 * POST /api/whatsapp/:sessionId/init
 */
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

/**
 * GET /api/whatsapp/:sessionId/status
 */
const getStatus = (req, res) => {
    try {
        const { sessionId } = req.params;

        if (!req.whatsappSession) {
            return res.json({
                success: true,
                sessionId,
                status: 'disconnected',
                isConnected: false,
                phoneNumber: null,
                hasQR: false
            });
        }

        const { socket, connectionState } = req.whatsappSession;
        const status = whatsappService.getConnectionStatus(socket, connectionState);

        res.json({
            success: true,
            sessionId,
            ...status
        });
    } catch (error) {
        console.error('Error getting status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get status'
        });
    }
};

/**
 * GET /api/whatsapp/:sessionId/qr
 */
const getQrCode = async (req, res) => {
    try {
        if (!req.whatsappSession) {
            return res.json({
                success: false,
                message: 'Session not initialized'
            });
        }
        const { connectionState } = req.whatsappSession;

        if (!connectionState.qr) {
            return res.json({
                success: false,
                message: connectionState.connection === 'open'
                    ? 'Already connected, no QR needed'
                    : 'QR code not available yet, please wait...'
            });
        }

        const qrBase64 = await QRCode.toDataURL(connectionState.qr);

        res.json({
            success: true,
            qr: connectionState.qr,
            qrImage: qrBase64,
            message: 'Scan this QR code with WhatsApp'
        });
    } catch (error) {
        console.error('Error generating QR:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate QR code'
        });
    }
};

/**
 * POST /api/whatsapp/:sessionId/logout
 */
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

/**
 * GET /api/whatsapp/:sessionId/info
 */
const getInfo = (req, res) => {
    try {
        const { socket } = req.whatsappSession;

        if (!socket || !socket.user) {
            return res.status(400).json({
                success: false,
                error: 'WhatsApp not connected'
            });
        }

        res.json({
            success: true,
            user: {
                id: socket.user.id,
                name: socket.user.name,
                phone: socket.user.id.split(':')[0]
            }
        });
    } catch (error) {
        console.error('Error getting info:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get device info'
        });
    }
};

/**
 * GET /api/whatsapp/:sessionId/pairing-code
 */
const getPairingCode = (req, res) => {
    try {
        if (!req.whatsappSession) {
            return res.json({ success: false, message: 'Session not initialized' });
        }
        const { connectionState } = req.whatsappSession;

        if (!connectionState.pairingCode) {
            return res.json({
                success: false,
                message: connectionState.connection === 'open'
                    ? 'Already connected'
                    : 'Pairing code not available yet, please wait...'
            });
        }

        res.json({
            success: true,
            pairingCode: connectionState.pairingCode,
            message: 'Pair your device using this code'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * GET /api/whatsapp/instances/enriched
 * Returns all user-mapped sessions with joined user data and real-time status
 */
const getEnrichedInstances = async (req, res) => {
    try {
        const configService = require('../services/common/config.service');
        const enrichedData = await configService.getEnrichedAIInstances();

        const results = enrichedData.map(item => {
            const sessionId = item.user_id; // Recall: we store sessionId in user_id column for user_sessions
            const liveSession = sessionManager.getSession(sessionId);

            return {
                id: sessionId,
                waSessionId: item.wa_session_id,
                isPrimary: item.is_primary,
                createdAt: item.created_at,
                user: item.users,
                isConnected: liveSession ? liveSession.connectionState.connection === 'open' : false,
                status: liveSession ? liveSession.connectionState.connection : 'disconnected',
                phone: liveSession ? liveSession.connectionState.phoneNumber : null
            };
        });

        res.json({
            success: true,
            instances: results
        });
    } catch (error) {
        console.error('Error getting enriched instances:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch enriched instances' });
    }
};

module.exports = {
    initSession,
    getStatus,
    getQrCode,
    logout,
    getInfo,
    getPairingCode,
    getEnrichedInstances
};
