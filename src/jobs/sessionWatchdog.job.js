const sessionManager = require('../services/whatsapp/session.manager');
const connectionService = require('../services/whatsapp/connection.service');
const configService = require('../services/common/config.service');

/**
 * Session Watchdog Job
 * Periodically checks all registered sessions and reconnects them if they are offline.
 * Ensures CS-BOT and other bots stay active even if they crash or disconnect.
 */
function startSessionWatchdogJob(intervalMs = 300000) { // Default 5 minutes
    console.log(`📡 [Watchdog] Session monitor job started (Interval: ${intervalMs / 60000}m)`);

    setInterval(async () => {
        try {
            // 1. Get all sessions that SHOULD be online from DB
            const registeredSessions = await configService.getAllUserSessions();
            
            // Core system sessions that must ALWAYS be online
            const mandatorySessions = ['CS-BOT'];
            const allTargetSessions = [...new Set([...registeredSessions, ...mandatorySessions])];

            for (const sessionId of allTargetSessions) {
                const session = sessionManager.getSession(sessionId);
                
                // 2. Check current status
                const isOffline = !session || session.connectionState.connection !== 'open';
                
                // 3. Reconnect if needed
                if (isOffline) {
                    const status = session ? session.connectionState.connection : 'MISSING';
                    console.log(`⚠️  [Watchdog] Session [${sessionId}] is ${status}. Attempting reconnection...`);
                    
                    // Trigger reconnection
                    connectionService.connect(sessionId).catch(err => {
                        console.error(`❌ [Watchdog] Failed to restart session ${sessionId}:`, err.message);
                    });
                }
            }
        } catch (error) {
            console.error(`🔥 [Watchdog] Job Error:`, error.message);
        }
    }, intervalMs);
}

module.exports = { startSessionWatchdogJob };
