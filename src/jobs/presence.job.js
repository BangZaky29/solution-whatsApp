function startPresenceJob(sessionManager) {
    return setInterval(() => {
        sessionManager.forEach(({ socket, connectionState }, sessionId) => {
            if (socket && connectionState.connection === 'open') {
                try {
                    socket.sendPresenceUpdate('available');
                } catch (err) {
                    console.error(`[${sessionId}] Keep-alive error:`, err.message);
                }
            }
        });
    }, 30000);
}

module.exports = { startPresenceJob };
