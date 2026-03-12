function startHistoryCleanupJob() {
    return setInterval(async () => {
        const historyService = require('../services/common/history.service');
        await historyService.clearAllHistory();
    }, 24 * 60 * 60 * 1000);
}

module.exports = { startHistoryCleanupJob };
