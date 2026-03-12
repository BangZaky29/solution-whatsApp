const whatsappService = require('../../services/whatsapp/whatsapp.service');

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

        const message = `?? *Konfirmasi Pembayaran Baru*\n\n` +
            `Halo Admin Arin/Ela, ada pembayaran masuk yang perlu diverifikasi.\n\n` +
            `?? *User:* ${user_name}\n` +
            `?? *Paket:* ${package_name}\n` +
            `?? *Nominal:* ${formattedAmount}\n` +
            `?? *Invoice:* ${invoice_id || '-'}\n\n` +
            `Tolong segera kondisikan dan proses aktivasi di dashboard admin.\n` +
            `??\n${ADMIN_DASHBOARD_URL}`;

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

module.exports = { sendPaymentConfirmation };
