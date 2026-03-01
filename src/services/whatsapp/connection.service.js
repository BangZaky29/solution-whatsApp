const {
    default: makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const { baileysLogger } = require('../../config/logger');
const sessionManager = require('./session.manager');
const { useSupabaseAuthState } = require('./auth.service');
const fs = require('fs');
const path = require('path');

// Use standard logger
const { logger } = require('../../config/logger');
const configService = require('../common/config.service');

// UUID detection regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class ConnectionService {
    async connect(sessionId = 'main-session') {
        try {
            // Prevent multiple simultaneous connection attempts for the same sessionId
            const existingSession = sessionManager.getSession(sessionId);

            if (existingSession) {
                if (existingSession.connectionState.connection === 'open') {
                    console.log(`ℹ️ [${sessionId}] Already connected. skipping.`);
                    return;
                }
                if (existingSession.connectionState.connection === 'connecting') {
                    console.log(`ℹ️ [${sessionId}] Connection already in progress. skipping.`);
                    return;
                }
                // If there's an old socket that isn't connected, clean it up
                if (existingSession.socket) {
                    console.log(`🧹 [${sessionId}] Cleaning up old socket before reconnecting...`);
                    try {
                        existingSession.socket.ev.removeAllListeners();
                        existingSession.socket.end();
                    } catch (e) { /* ignore */ }
                    existingSession.socket = null;
                }
            }

            console.log(`\n🚀 [${sessionId}] Connecting to WhatsApp...`);

            // Initialize or reset session data
            const sessionData = {
                socket: null,
                clearSessionHandler: null,
                connectionState: {
                    qr: null,
                    connection: 'connecting',
                    phoneNumber: existingSession?.connectionState?.phoneNumber || null
                }
            };
            sessionManager.setSession(sessionId, sessionData);

            // Get latest Baileys version
            const { version } = await fetchLatestBaileysVersion();

            // Initialize auth state from Supabase
            const { state, saveCreds, clearSession } = await useSupabaseAuthState(sessionId);
            sessionData.clearSessionHandler = clearSession;

            // Create socket
            const socket = makeWASocket({
                version,
                logger: baileysLogger,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, baileysLogger)
                },
                printQRInTerminal: false,
                generateHighQualityLinkPreview: true,
                browser: ['WhatsApp Gateway', 'Chrome', '120.0.0'],
                getMessage: async (key) => ({ conversation: 'Message not found' })
            });

            sessionData.socket = socket;

            // connection.update handler
            socket.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    sessionData.connectionState.qr = qr;
                    sessionData.connectionState.connection = 'waiting_qr';
                    console.log(`📱 [${sessionId}] QR Code generated - Waiting for scan...`);
                }

                if (connection) {
                    sessionData.connectionState.connection = connection;

                    if (connection === 'open') {
                        sessionData.connectionState.qr = null;
                        sessionData.connectionState.phoneNumber = socket.user?.id?.split(':')[0] || null;
                        sessionData.connectionState.name = socket.user?.name || null;
                        console.log(`\n✅ [${sessionId}] Connected! Phone: ${sessionData.connectionState.phoneNumber}\n`);

                        // PERSISTENCE: If sessionId is a UUID, record it in user_sessions
                        if (UUID_REGEX.test(sessionId)) {
                            console.log(`💾 [${sessionId}] Recording session for user in database...`);
                            await configService.upsertUserSession(sessionId, socket.user.id);
                        }
                    }

                    if (connection === 'close') {
                        sessionData.connectionState.qr = null;
                        const statusCode = lastDisconnect?.error?.output?.statusCode;
                        const reason = DisconnectReason[statusCode] || 'Unknown';

                        console.log(`\n❌ [${sessionId}] Disconnection: ${reason} (${statusCode})`);

                        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                        if (shouldReconnect) {
                            console.log(`🔄 [${sessionId}] Reconnecting in 10s...`);
                            setTimeout(() => this.connect(sessionId), 10000);
                        } else {
                            console.log(`👋 [${sessionId}] Logged out. Session data will be cleared.`);

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

            socket.ev.on('creds.update', saveCreds);

            socket.ev.on('messages.upsert', async ({ messages, type }) => {
                logger.info(`📩 [${sessionId}] messages.upsert type=${type}, count=${messages.length}`);

                if (type === 'notify') {
                    const aiBotService = require('../ai/aiBot.service');
                    const csBotService = require('../ai/csBot.service');

                    for (const msg of messages) {
                        const fromMe = msg.key.fromMe;
                        if (!fromMe) {
                            try {
                                if (sessionId === 'wa-bot-ai') {
                                    await aiBotService.handleIncomingMessage(sessionId, socket, msg);
                                } else if (sessionId === 'CS-BOT') {
                                    await csBotService.handleIncomingMessage(sessionId, socket, msg);
                                }
                            } catch (err) {
                                console.error(`❌ [${sessionId}] Bot Error:`, err.message);
                                logger.error(`❌ [${sessionId}] Bot Error: ${err.message}`);
                            }
                        }
                    }
                }
            });

        } catch (error) {
            console.error(`❌ [${sessionId}] Critical Connection Error:`, error.message);
            // Retry connection after a delay
            setTimeout(() => this.connect(sessionId), 10000);
        }
    }
}

module.exports = new ConnectionService();
