const { DisconnectReason } = require('@whiskeysockets/baileys');
const sessionManager = require('./session.manager');
const configService = require('../common/config.service');
const { logger } = require('../../config/logger');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function registerConnectionUpdateHandler({ socket, sessionData, sessionId, clearSession, reconnect }) {
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            sessionData.connectionState.qr = qr;
            sessionData.connectionState.connection = 'waiting_qr';
            console.log(`[${sessionData.displayName}] QR Code generated - Waiting for scan...`);
        }

        if (connection) {
            sessionData.connectionState.connection = connection;

            if (connection === 'open') {
                sessionData.connectionState.qr = null;
                sessionData.connectionState.phoneNumber = socket.user?.id?.split(':')[0] || null;
                sessionData.connectionState.name = socket.user?.name || null;

                const isMulti = UUID_REGEX.test(sessionId) || sessionId === 'wa-bot-ai';
                const category = isMulti ? '[ACTIVATION WA MULTI]' : '[ACTIVATION WA TUNGGAL]';

                console.log(`\n${category} :\n[${sessionData.displayName}] Connected! Phone: ${sessionData.connectionState.phoneNumber}\n`);

                // PERSISTENCE: Record success in session registry so it can be restored on boot
                console.log(`[${sessionData.displayName}] Recording session registry...`);
                await configService.upsertUserSession(sessionId, socket.user.id);
            }

            if (connection === 'close') {
                sessionData.connectionState.qr = null;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = DisconnectReason[statusCode] || 'Unknown';

                console.log(`\n[${sessionData.displayName}] Disconnection: ${reason} (${statusCode})`);

                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                if (shouldReconnect) {
                    const isReplaced = statusCode === 440 || statusCode === DisconnectReason.connectionReplaced;
                    const currentPhone = sessionData.connectionState.phoneNumber;

                    // If replaced, check if ANOTHER session in THIS server now owns the phone
                    if (isReplaced && currentPhone) {
                        const conflict = sessionManager.getSessionByPhone(currentPhone);
                        if (conflict && conflict.id !== sessionId) {
                            console.log(`[${sessionData.displayName}] Session was replaced by [${conflict.displayName}] (${conflict.id}). Stopping reconnection to avoid flapping.`);
                            return; // STOP reconnect loop
                        }
                    }

                    const delay = isReplaced ? 25000 : 10000;

                    if (isReplaced) {
                        console.log(`[${sessionData.displayName}] Session was replaced elsewhere. Waiting ${delay / 1000}s to avoid conflict.`);
                    }

                    sessionData.connectionState.connection = 'connecting';
                    console.log(`[${sessionData.displayName}] Reconnecting in ${delay / 1000}s...`);
                    reconnect(delay);
                } else {
                    console.log(`[${sessionData.displayName}] Logged out. Session data will be cleared.`);

                    // PERSISTENCE: Remove session from user_sessions on logout
                    if (UUID_REGEX.test(sessionId)) {
                        await configService.removeUserSession(sessionId);
                    }

                    if (clearSession) await clearSession();
                    sessionManager.deleteSession(sessionId);
                }
            }
        }
    });
}

function registerMessageUpsertHandler({ socket, sessionId }) {
    socket.ev.on('messages.upsert', async ({ messages, type }) => {
        logger.info(`[${sessionId}] messages.upsert type=${type}, count=${messages.length}`);

        if (type === 'notify') {
            const aiBotService = require('../ai/aiBot.service');
            const csBotService = require('../ai/csBot.service');

            for (const msg of messages) {
                const fromMe = msg.key.fromMe;
                if (!fromMe) {
                    // Don't await here to allow concurrent handling (especially with delays)
                    if (sessionId === 'wa-bot-ai' || UUID_REGEX.test(sessionId)) {
                        aiBotService.handleIncomingMessage(sessionId, socket, msg).catch(err => {
                            console.error(`[${sessionId}] AI Bot Error:`, err.message);
                        });
                    } else if (sessionId === 'CS-BOT') {
                        csBotService.handleIncomingMessage(sessionId, socket, msg).catch(err => {
                            console.error(`[${sessionId}] CS Bot Error:`, err.message);
                        });
                    }
                }
            }
        }
    });
}

module.exports = {
    registerConnectionUpdateHandler,
    registerMessageUpsertHandler
};
