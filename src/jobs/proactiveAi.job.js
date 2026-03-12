const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function startProactiveAiJob(sessionManager) {
    return setInterval(async () => {
        const aiBotService = require('../services/ai/aiBot.service');

        sessionManager.forEach(async (session, sessionId) => {
            if ((UUID_REGEX.test(sessionId) || sessionId === 'wa-bot-ai') &&
                session.socket &&
                session.connectionState.connection === 'open') {
                await aiBotService.checkAndSendProactiveMessage(sessionId, session.socket);
            }
        });
    }, 15 * 60 * 1000);
}

module.exports = { startProactiveAiJob };
