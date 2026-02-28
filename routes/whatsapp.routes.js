/**
 * ============================================
 * WhatsApp Routes
 * ============================================
 * 
 * API endpoints for WhatsApp operations
 */

const express = require('express');
const router = express.Router();

/**
 * Factory function to create routes with socket access
 * @param {function} getSocket - Function to get current socket instance
 * @param {function} getConnectionState - Function to get connection state
 * @param {function} getClearSession - Function to get clearSession handler
 */
function createWhatsAppRoutes(getSession, connectToWhatsApp) {
    const whatsappService = require('../services/whatsapp.service');

    /**
     * Middleware to validate session
     */
    const validateSession = (req, res, next) => {
        const { sessionId } = req.params;
        const session = getSession(sessionId);

        if (!session && !req.path.endsWith('/init')) {
            return res.status(404).json({
                success: false,
                error: `Session '${sessionId}' not found. Please initialize first at /api/whatsapp/${sessionId}/init (POST)`
            });
        }

        req.whatsappSession = session;
        next();
    };

    /**
     * POST /api/whatsapp/:sessionId/init
     * Initialize or restart a session
     */
    router.post('/:sessionId/init', async (req, res) => {
        try {
            const { sessionId } = req.params;
            await connectToWhatsApp(sessionId);
            res.json({
                success: true,
                message: `Initializing session '${sessionId}'...`
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/whatsapp/:sessionId/status
     * Get current connection status and QR code if available
     */
    router.get('/:sessionId/status', validateSession, (req, res) => {
        try {
            const { sessionId } = req.params;
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
    });

    /**
     * GET /api/whatsapp/:sessionId/qr
     * Get QR code as base64 image for frontend display
     */
    router.get('/:sessionId/qr', validateSession, async (req, res) => {
        try {
            const { connectionState } = req.whatsappSession;

            if (!connectionState.qr) {
                return res.json({
                    success: false,
                    message: connectionState.connection === 'open'
                        ? 'Already connected, no QR needed'
                        : 'QR code not available yet, please wait...'
                });
            }

            // Generate QR code as base64 image
            const QRCode = require('qrcode');
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
    });

    /**
     * POST /api/whatsapp/:sessionId/send
     * Send a text message
     * Body: { number: "628xxx", message: "Hello" }
     */
    router.post('/:sessionId/send', validateSession, async (req, res) => {
        try {
            const { number, message } = req.body;
            const { socket } = req.whatsappSession;

            const result = await whatsappService.sendTextMessage(socket, number, message);

            if (result.success) {
                res.json(result);
            } else {
                res.status(400).json(result);
            }
        } catch (error) {
            console.error('Error in send endpoint:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });

    /**
     * POST /api/whatsapp/:sessionId/send-media
     * Send a media message
     * Body: { number: "628xxx", media: { type: "image|video|document|audio", url: "...", caption: "..." } }
     */
    router.post('/:sessionId/send-media', validateSession, async (req, res) => {
        try {
            const { number, media } = req.body;
            const { socket } = req.whatsappSession;

            if (!media || !media.type || !media.url) {
                return res.status(400).json({
                    success: false,
                    error: 'Media object with type and url is required'
                });
            }

            const result = await whatsappService.sendMediaMessage(socket, number, media);

            if (result.success) {
                res.json(result);
            } else {
                res.status(400).json(result);
            }
        } catch (error) {
            console.error('Error in send-media endpoint:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });

    /**
     * POST /api/whatsapp/:sessionId/send-bulk
     * Send message to multiple numbers
     * Body: { numbers: ["628xxx", "628yyy"], message: "Hello" }
     */
    router.post('/:sessionId/send-bulk', validateSession, async (req, res) => {
        try {
            const { numbers, message } = req.body;
            const { socket } = req.whatsappSession;

            if (!Array.isArray(numbers) || numbers.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Numbers must be a non-empty array'
                });
            }

            if (numbers.length > 100) {
                return res.status(400).json({
                    success: false,
                    error: 'Maximum 100 numbers per request'
                });
            }

            const results = [];
            const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            for (const number of numbers) {
                const result = await whatsappService.sendTextMessage(socket, number, message);
                results.push({ number, ...result });

                // Add delay between messages to avoid rate limiting
                await delay(1000);
            }

            const successCount = results.filter(r => r.success).length;
            const failedCount = results.filter(r => !r.success).length;

            res.json({
                success: true,
                summary: {
                    total: numbers.length,
                    success: successCount,
                    failed: failedCount
                },
                results
            });
        } catch (error) {
            console.error('Error in send-bulk endpoint:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });

    /**
     * POST /api/whatsapp/:sessionId/logout
     * Logout and clear session from Supabase
     */
    router.post('/:sessionId/logout', validateSession, async (req, res) => {
        try {
            const { socket, clearSessionHandler } = req.whatsappSession;

            // Logout from WhatsApp
            if (socket) {
                try {
                    await socket.logout();
                } catch (e) {
                    console.log('Socket logout error:', e.message);
                }
            }

            // Clear session from Supabase
            if (clearSessionHandler) {
                await clearSessionHandler();
            }

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
    });

    /**
     * GET /api/whatsapp/:sessionId/info
     * Get connected device info
     */
    router.get('/:sessionId/info', validateSession, (req, res) => {
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
    });

    /**
     * POST /api/whatsapp/:sessionId/notify/payment-confirmation
     */
    router.post('/:sessionId/notify/payment-confirmation', validateSession, async (req, res) => {
        const ADMIN_NUMBER = '6288294096100'; // Admin Ela
        const ADMIN_DASHBOARD_URL = 'https://admin-controller.nuansasolution.id/';

        try {
            const { user_name, package_name, amount, invoice_id } = req.body;
            const { socket } = req.whatsappSession;

            if (!user_name || !package_name || !amount) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields'
                });
            }

            const formattedAmount = new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                minimumFractionDigits: 0
            }).format(amount);

            const message = `🔔 *Konfirmasi Pembayaran Baru*\n\n` +
                `Halo Admin Arin/Ela, ada pembayaran masuk yang perlu diverifikasi.\n\n` +
                `👤 *User:* ${user_name}\n` +
                `📦 *Paket:* ${package_name}\n` +
                `💰 *Nominal:* ${formattedAmount}\n` +
                `🧾 *Invoice:* ${invoice_id || '-'}\n\n` +
                `Tolong segera kondisikan dan proses aktivasi di dashboard admin.\n` +
                `👇\n${ADMIN_DASHBOARD_URL}`;

            const result = await whatsappService.sendTextMessage(socket, ADMIN_NUMBER, message);

            if (result.success) {
                res.json({ success: true, message: 'Notification sent' });
            } else {
                res.status(500).json({ success: false, error: 'Failed to send WhatsApp message' });
            }
        } catch (error) {
            console.error('Error in payment-confirmation:', error);
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    });

    /**
     * GET /api/whatsapp/stats
     * Get all chat statistics for dashboard
     */
    router.get('/stats/history', async (req, res) => {
        try {
            const historyHelper = require('../helpers/history.helper');
            const stats = await historyHelper.getAllChatStats();

            res.json({
                success: true,
                count: stats.length,
                stats: stats
            });
        } catch (error) {
            console.error('Error getting stats:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get stats'
            });
        }
    });

    return router;
}

module.exports = createWhatsAppRoutes;
