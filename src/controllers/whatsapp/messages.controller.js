const whatsappService = require('../../services/whatsapp/whatsapp.service');

const sendText = async (req, res) => {
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
};

const sendMedia = async (req, res) => {
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
};

const sendBulk = async (req, res) => {
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
};

module.exports = { sendText, sendMedia, sendBulk };
