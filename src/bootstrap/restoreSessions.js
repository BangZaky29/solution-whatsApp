async function restoreSessions({ configService, connectionService }) {
    // Auto-restore all active sessions from database (respects NODE_ENV)
    let dbSessions = await configService.getAllUserSessions();
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Force include core system sessions if not in DB
    if (!dbSessions.includes('CS-BOT')) dbSessions.push('CS-BOT');

    const uniqueSessions = [...new Set(dbSessions)];

    const singleSessions = uniqueSessions.filter(id => !UUID_REGEX.test(id) && id !== 'wa-bot-ai');
    const multiSessions = uniqueSessions.filter(id => UUID_REGEX.test(id) || id === 'wa-bot-ai');

    console.log(`[Boot] Restoring ${uniqueSessions.length} sessions...`);

    // 1. Single Sessions (High Priority: CS-BOT, main-session)
    for (const sessionId of singleSessions) {
        console.log(`🚀 [Boot] Restoring System Session: ${sessionId}`);
        connectionService.connect(sessionId).catch(err =>
            console.error(`[Boot] Auto-start failed for ${sessionId}: ${err.message}`)
        );
    }

    // 2. Multi Sessions (User AI Bots)
    if (multiSessions.length > 0) {
        console.log(`\n[Boot] Restoring ${multiSessions.length} AI User Sessions...`);
        for (const sessionId of multiSessions) {
            connectionService.connect(sessionId).catch(err =>
                console.error(`[Boot] Auto-start failed for ${sessionId}: ${err.message}`)
            );
        }
    }
}

module.exports = { restoreSessions };
