const sessionManager = require('../../services/whatsapp/session.manager');
const whatsappService = require('../../services/whatsapp/whatsapp.service');
const { warlokSupabase } = require('../../config/supabase');

exports.notifyManualPayment = async (req, res) => {
    try {
        const { payment_id, username, wa_number, package_name, proof_url } = req.body;

        if (!payment_id || !username || !proof_url) {
            return res.status(400).json({ error: 'Missing required payload: payment_id, username, and proof_url' });
        }

        const session = sessionManager.getSession('main-session');
        if (!session || !session.socket) {
            return res.status(503).json({ error: 'main-session WhatsApp is down.' });
        }

        const adminNumbersEnv = process.env.WA_SUPER_ADMIN_NUMBER || '081995770190';
        const adminList = adminNumbersEnv.split(',').map(n => n.trim());

        const caption = `Halo kak! Ada payment masuk atas nama *${username}* yang membeli paket langganan.\n\nDetail paket: *${package_name}*\nNo. WA Pembeli: *${wa_number}*\n\nMohon dicek bukti pembayarannya. Balas dengan format:\n\n*setuju ${username}*\n\nUntuk mengkonfirmasi pembayaran dan mengirimkan kode referral secara otomatis kepada pembeli.`;

        // Send WhatsApp Image Message to all super admins
        const results = await Promise.all(
            adminList.map(number => 
                whatsappService.sendMediaMessage(session.socket, number, {
                    type: 'image',
                    url: proof_url,
                    caption: caption
                })
            )
        );

        const allFailed = results.every(r => !r.success);

        if (allFailed) {
            console.error('Failed to notify any Super Admin via WA:', results);
            return res.status(500).json({ error: 'Failed to send WhatsApp message', details: results[0].error });
        }

        return res.json({ success: true, message: 'Super admin notified successfully.' });
    } catch (error) {
        console.error('Error in notifyManualPayment:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
};
