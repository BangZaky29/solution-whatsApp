/**
 * SessionManager handles the global state of WhatsApp sessions.
 */
class SessionManager {
    constructor() {
        this.sessions = new Map();
    }

    /**
     * Get session data by ID
     * @param {string} sessionId 
     * @returns {object|null}
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId) || null;
    }

    /**
     * Set session data
     * @param {string} sessionId 
     * @param {object} data 
     */
    setSession(sessionId, data) {
        this.sessions.set(sessionId, data);
    }

    /**
     * Delete a session
     * @param {string} sessionId 
     */
    deleteSession(sessionId) {
        this.sessions.delete(sessionId);
    }

    /**
     * Get all active sessions
     * @returns {Array}
     */
    getAllSessions() {
        const activeSessions = [];
        this.sessions.forEach((val, key) => {
            activeSessions.push({
                id: key,
                status: val.connectionState.connection,
                phone: val.connectionState.phoneNumber
            });
        });
        return activeSessions;
    }

    /**
     * Execute a callback for each session
     * @param {function} callback 
     */
    forEach(callback) {
        this.sessions.forEach(callback);
    }

    /**
     * Get the count of active sessions
     * @returns {number}
     */
    get count() {
        return this.sessions.size;
    }
}

module.exports = new SessionManager();
