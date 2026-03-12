const sessionManager = require('../../services/whatsapp/session.manager');
const configService = require('../../services/common/config.service');

const getEnrichedInstances = async (req, res) => {
    try {
        const enrichedData = await configService.getEnrichedAIInstances();

        const results = enrichedData.map(item => {
            const sessionId = item.user_id; // Recall: we store sessionId in user_id column for user_sessions
            const liveSession = sessionManager.getSession(sessionId);

            return {
                id: sessionId,
                waSessionId: item.wa_session_id,
                isPrimary: item.is_primary,
                createdAt: item.created_at,
                user: item.users,
                isConnected: liveSession ? liveSession.connectionState.connection === 'open' : false,
                status: liveSession ? liveSession.connectionState.connection : 'disconnected',
                phone: liveSession ? liveSession.connectionState.phoneNumber : null
            };
        });

        res.json({
            success: true,
            instances: results
        });
    } catch (error) {
        console.error('Error getting enriched instances:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch enriched instances' });
    }
};

module.exports = { getEnrichedInstances };
