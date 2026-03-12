const historyService = require('../../services/common/history.service');
const configService = require('../../services/common/config.service');

const getStats = async (req, res) => {
    try {
        const userId = req.userId; // Guaranteed by middleware
        const chats = await historyService.getAllChatStats(userId);
        const globalStats = await configService.getSetting(`global_stats:${userId}`) || { requests: 0, responses: 0 };

        const displayName = await configService.getUserDisplay(userId);
        console.log(`✅ [getStats] User: ${displayName} | Chats found: ${chats.length}`);

        res.json({
            success: true,
            stats: chats,
            global: globalStats
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { getStats };
