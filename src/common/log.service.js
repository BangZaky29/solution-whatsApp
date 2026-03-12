const supabase = require('../config/supabase');

/**
 * Log Service
 * Handles saving AI bot execution logs to the database for the Log Monitor UI.
 */
class LogService {
    /**
     * Save a log entry to the database non-blockingly.
     * @param {string} userId - The user's UUID
     * @param {string} sessionId - The WhatsApp session ID
     * @param {string} level - 'info' | 'success' | 'warn' | 'error' | 'system'
     * @param {string} message - The log message text
     */
    log(userId, sessionId, level, message) {
        if (!userId) return; // Silent skip if no user context

        // Fire and forget
        supabase.from('wa_bot_logs').insert([{
            user_id: userId,
            session_id: sessionId,
            level: level,
            message: message,
            created_at: new Date().toISOString()
        }]).then(({ error }) => {
            if (error) {
                console.error(`[LogService] Failed to save log to DB: ${error.message}`);
            }
        });
    }

    /**
     * Helper methods for specific log levels
     */
    info(userId, sessionId, message) { this.log(userId, sessionId, 'info', message); }
    success(userId, sessionId, message) { this.log(userId, sessionId, 'success', message); }
    warn(userId, sessionId, message) { this.log(userId, sessionId, 'warn', message); }
    error(userId, sessionId, message) { this.log(userId, sessionId, 'error', message); }
    system(userId, sessionId, message) { this.log(userId, sessionId, 'system', message); }
}

module.exports = new LogService();
