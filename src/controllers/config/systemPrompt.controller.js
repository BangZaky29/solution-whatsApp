const configService = require('../../services/common/config.service');
const aiBotService = require('../../services/ai/aiBot.service');

const getSystemPrompt = async (req, res) => {
    try {
        const userId = req.userId;
        const prompt = await configService.getSystemPrompt(userId);
        res.json({
            success: true,
            systemPrompt: prompt
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const updateSystemPrompt = async (req, res) => {
    try {
        const userId = req.userId;
        const { systemPrompt } = req.body;
        if (!systemPrompt) {
            return res.status(400).json({ success: false, error: 'systemPrompt is required' });
        }
        await aiBotService.updateConfig({ systemPrompt }, userId);
        res.json({
            success: true,
            message: 'System prompt updated successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { getSystemPrompt, updateSystemPrompt };
