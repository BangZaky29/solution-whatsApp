const configService = require('../../services/common/config.service');

const getAIControls = async (req, res) => {
    try {
        const userId = req.userId;
        const controls = await configService.getAIControls(userId);
        res.json({ success: true, controls });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const updateAIControls = async (req, res) => {
    try {
        const userId = req.userId;
        const { controls } = req.body;
        const success = await configService.updateAIControls(userId, controls);

        if (success) {
            const displayName = await configService.getUserDisplay(userId);
            console.log(`\n[CONFIGURATION-User]:\n? [Config] AI Controls updated for user: ${displayName}`);
        }

        res.json({ success });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { getAIControls, updateAIControls };
