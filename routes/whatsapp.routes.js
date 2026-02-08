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
function createWhatsAppRoutes(getSocket, getConnectionState, getClearSession) {
    const whatsappService = require('../services/whatsapp.service');

    /**
     * GET /api/whatsapp/status
     * Get current connection status and QR code if available
     */
    router.get('/status', (req, res) => {
        try {
            const socket = getSocket();
            const connectionState = getConnectionState();
            const status = whatsappService.getConnectionStatus(socket, connectionState);

            res.json({
                success: true,
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
     * GET /api/whatsapp/qr
     * Get QR code as base64 image for frontend display
     */
    router.get('/qr', async (req, res) => {
        try {
            const connectionState = getConnectionState();

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
     * POST /api/whatsapp/send
     * Send a text message
     * Body: { number: "628xxx", message: "Hello" }
     */
    router.post('/send', async (req, res) => {
        try {
            const { number, message } = req.body;
            const socket = getSocket();

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
     * POST /api/whatsapp/send-media
     * Send a media message
     * Body: { number: "628xxx", media: { type: "image|video|document|audio", url: "...", caption: "..." } }
     */
    router.post('/send-media', async (req, res) => {
        try {
            const { number, media } = req.body;
            const socket = getSocket();

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
     * POST /api/whatsapp/send-bulk
     * Send message to multiple numbers
     * Body: { numbers: ["628xxx", "628yyy"], message: "Hello" }
     */
    router.post('/send-bulk', async (req, res) => {
        try {
            const { numbers, message } = req.body;
            const socket = getSocket();

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
     * POST /api/whatsapp/logout
     * Logout and clear session from Supabase
     */
    router.post('/logout', async (req, res) => {
        try {
            const socket = getSocket();
            const clearSession = getClearSession();

            // Logout from WhatsApp
            if (socket) {
                try {
                    await socket.logout();
                } catch (e) {
                    console.log('Socket logout error (may be already disconnected):', e.message);
                }
            }

            // Clear session from Supabase
            if (clearSession) {
                await clearSession();
            }

            res.json({
                success: true,
                message: 'Logged out successfully. Session cleared from database.'
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
     * GET /api/whatsapp/info
     * Get connected device info
     */
    router.get('/info', (req, res) => {
        try {
            const socket = getSocket();

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
     * POST /api/whatsapp/notify/payment-confirmation
     * Send payment confirmation notification to Admin
     * Body: { user_name, package_name, amount, invoice_id }
     */
    router.post('/notify/payment-confirmation', async (req, res) => {
        const ADMIN_NUMBER = '6288294096100'; // Admin Ela
        const ADMIN_DASHBOARD_URL = 'https://admin-controller.nuansasolution.id/';

        try {
            const { user_name, package_name, amount, invoice_id } = req.body;
            const socket = getSocket();

            // validation
            if (!user_name || !package_name || !amount) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: user_name, package_name, amount'
                });
            }

            // Format amount to IDR
            const formattedAmount = new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                minimumFractionDigits: 0
            }).format(amount);

            // Construct Message
            const message = `🔔 *Konfirmasi Pembayaran Baru*

Halo Admin Arin/Ela, ada pembayaran masuk yang perlu diverifikasi.

👤 *User:* ${user_name}
📦 *Paket:* ${package_name}
💰 *Nominal:* ${formattedAmount}
🧾 *Invoice:* ${invoice_id || '-'}

Tolong segera kondisikan dan proses aktivasi di dashboard admin.
👇
${ADMIN_DASHBOARD_URL}`;

            // Send Message
            const result = await whatsappService.sendTextMessage(socket, ADMIN_NUMBER, message);

            if (result.success) {
                res.json({
                    success: true,
                    message: 'Notification sent to admin',
                    details: result
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: 'Failed to send WhatsApp message',
                    details: result
                });
            }

        } catch (error) {
            console.error('Error in payment-confirmation endpoint:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });

    return router;
}

module.exports = createWhatsAppRoutes;
