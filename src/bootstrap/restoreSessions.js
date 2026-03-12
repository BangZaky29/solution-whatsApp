async function restoreSessions({ configService, connectionService }) {
    // Auto-restore all active sessions from database (respects NODE_ENV)
    const dbSessions = await configService.getAllUserSessions();
    const uniqueSessions = [...new Set(dbSessions)];
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const singleSessions = uniqueSessions.filter(id => !UUID_REGEX.test(id) && id !== 'wa-bot-ai');
    const multiSessions = uniqueSessions.filter(id => UUID_REGEX.test(id) || id === 'wa-bot-ai');

    console.log(`[Boot] Restoring ${uniqueSessions.length} sessions...`);

    // 1. Single Sessions
    for (const sessionId of singleSessions) {
        connectionService.connect(sessionId).catch(err =>
            console.error(`[Boot] Auto-start failed for ${sessionId}: ${err.message}`)
        );
    }

    // 2. Multi Sessions
    if (multiSessions.length > 0) {
        console.log(`\n[Boot-multi-session ${multiSessions.length}]`);
        for (const sessionId of multiSessions) {
            connectionService.connect(sessionId).catch(err =>
                console.error(`[Boot] Auto-start failed for ${sessionId}: ${err.message}`)
            );
        }
    }
}

module.exports = { restoreSessions };
