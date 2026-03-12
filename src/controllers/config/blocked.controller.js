const configService = require('../../services/common/config.service');

const getBlockedAttempts = async (req, res) => {
    try {
        const userId = req.userId;
        const attempts = await configService.getBlockedAttempts(userId);
        res.json({ success: true, attempts });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const whitelistBlockedAttempt = async (req, res) => {
    try {
        const userId = req.userId;
        const { jid, name } = req.body;

        // 1. Add to contacts
        const result = await configService.addContact(jid, name, userId);
        if (result.error) throw result.error;

        // 2. Remove from blocked attempts
        await configService.deleteBlockedAttempt(jid, userId);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const deleteBlockedAttempt = async (req, res) => {
    try {
        const userId = req.userId;
        const { jid } = req.body;

        await configService.deleteBlockedAttempt(jid, userId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    getBlockedAttempts,
    whitelistBlockedAttempt,
    deleteBlockedAttempt
};
