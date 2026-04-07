const whatsappService = require('../../services/whatsapp/whatsapp.service');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const sendPaymentConfirmation = async (req, res) => {
    const ADMIN_NUMBER = process.env.DEVELOPER_WA_NUMBER || '6288294096100';
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
            `🔗\n${ADMIN_DASHBOARD_URL}`;

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
};

/**
 * Broadcast notification to all developers and groups
 * POST /api/whatsapp/:sessionId/notify/developer
 */
const notifyDeveloper = async (req, res) => {
    const { message } = req.body;
    const { socket } = req.whatsappSession;
    const devNumbers = (process.env.DEVELOPER_WA_NUMBER || '').split(',').map(n => n.trim()).filter(n => n);

    if (!message) {
        return res.status(400).json({ success: false, error: 'Message is required' });
    }

    if (devNumbers.length === 0) {
        return res.status(400).json({ success: false, error: 'No developer numbers configured' });
    }

    // Response early to acknowledge the request
    res.json({ success: true, message: `Broadcasting to ${devNumbers.length} recipients...` });

    // Sequential broadcast with delay
    for (let i = 0; i < devNumbers.length; i++) {
        const number = devNumbers[i];
        try {
            console.log(`[BROADCAST] Sending to ${number} (${i + 1}/${devNumbers.length})...`);
            await whatsappService.sendTextMessage(socket, number, message);
            
            // Delay 5 seconds between messages (except the last one)
            if (i < devNumbers.length - 1) {
                await sleep(5000);
            }
        } catch (err) {
            console.error(`[BROADCAST] Failed to send to ${number}:`, err);
        }
    }
};

module.exports = { 
    sendPaymentConfirmation,
    notifyDeveloper
};
