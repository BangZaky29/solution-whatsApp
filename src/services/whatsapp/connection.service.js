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

const connectionLock = new Map();

// UUID detection regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class ConnectionService {
    async connect(sessionId = 'main-session', userId = null, phoneNumber = null) {
        // Guard: Prevent multiple simultaneous connection attempts for the same sessionId
        if (connectionLock.get(sessionId)) {
            console.log(`ℹ️ [${sessionId}] Connection attempt already in progress. skipping.`);
            return;
        }

        try {
            connectionLock.set(sessionId, true);
            const existingSession = sessionManager.getSession(sessionId);

            if (existingSession) {
                if (existingSession.connectionState.connection === 'open') {
                    console.log(`ℹ️ [${sessionId}] Already connected. skipping.`);
                    connectionLock.delete(sessionId);
                    return;
                }

                // If there's an old socket, clean it up aggressively
                if (existingSession.socket) {
                    console.log(`🧹 [${sessionId}] Cleaning up old socket before reconnecting...`);
                    try {
                        existingSession.socket.ev.removeAllListeners();
                        existingSession.socket.end();
                    } catch (e) { /* ignore */ }
                    existingSession.socket = null;
                }
            }

            const displayName = await configService.getUserDisplay(userId || sessionId);
            console.log(`\n🚀 [${displayName}] Connecting to WhatsApp...`);

            // Initialize or reset session data
            const sessionData = {
                socket: null,
                displayName,
                userId: userId || existingSession?.userId || null,
                clearSessionHandler: null,
                connectionState: {
                    qr: null,
                    connection: 'connecting',
                    phoneNumber: phoneNumber || existingSession?.connectionState?.phoneNumber || null,
                    pairingCode: null
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
                getMessage: async (key) => {
                    return undefined;
                }
            });

            // Mark as lock released since socket is created (listeners handles the rest)
            connectionLock.delete(sessionId);

            sessionData.socket = socket;

            // Pairing Code Logic
            if (phoneNumber) {
                const cleanNumber = phoneNumber.replace(/\D/g, '');
                if (cleanNumber) {
                    console.log(`🌀 [${displayName}] Requesting Pairing Code for: ${cleanNumber}`);
                    setTimeout(async () => {
                        try {
                            const code = await socket.requestPairingCode(cleanNumber);
                            sessionData.connectionState.pairingCode = code;
                            console.log(`🔑 [${displayName}] Pairing Code Generated: ${code}`);
                        } catch (err) {
                            console.error(`❌ [${displayName}] Failed to generate pairing code:`, err.message);
                        }
                    }, 3000);
                }
            }

            // connection.update handler
            socket.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    sessionData.connectionState.qr = qr;
                    sessionData.connectionState.connection = 'waiting_qr';
                    console.log(`📱 [${sessionData.displayName}] QR Code generated - Waiting for scan...`);
                }

                if (connection) {
                    sessionData.connectionState.connection = connection;

                    if (connection === 'open') {
                        sessionData.connectionState.qr = null;
                        sessionData.connectionState.phoneNumber = socket.user?.id?.split(':')[0] || null;
                        sessionData.connectionState.name = socket.user?.name || null;

                        const isMulti = UUID_REGEX.test(sessionId) || sessionId === 'wa-bot-ai';
                        const category = isMulti ? '[ACTIVATION WA MULTI]' : '[ACTIVATION WA TUNGGAL]';

                        console.log(`\n${category} :\n✅ [${sessionData.displayName}] Connected! Phone: ${sessionData.connectionState.phoneNumber}\n`);

                        // PERSISTENCE: Record success in session registry so it can be restored on boot
                        console.log(`💾 [${sessionData.displayName}] Recording session registry...`);
                        await configService.upsertUserSession(sessionId, socket.user.id);
                    }

                    if (connection === 'close') {
                        sessionData.connectionState.qr = null;
                        const statusCode = lastDisconnect?.error?.output?.statusCode;
                        const reason = DisconnectReason[statusCode] || 'Unknown';

                        console.log(`\n❌ [${sessionData.displayName}] Disconnection: ${reason} (${statusCode})`);

                        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                        if (shouldReconnect) {
                            const isReplaced = statusCode === 440 || statusCode === DisconnectReason.connectionReplaced;
                            const delay = isReplaced ? 25000 : 10000; // 25s for replaced, 10s otherwise

                            if (isReplaced) {
                                console.log(`⚠️ [${sessionData.displayName}] Session was replaced elsewhere. Waiting ${delay / 1000}s to avoid conflict.`);
                            }

                            // Cautious: Mark as connecting NOW so auto-healing in app.js skips it during delay
                            sessionData.connectionState.connection = 'connecting';

                            console.log(`🔄 [${sessionData.displayName}] Reconnecting in ${delay / 1000}s...`);
                            setTimeout(() => this.connect(sessionId), delay);
                        } else {
                            console.log(`👋 [${sessionData.displayName}] Logged out. Session data will be cleared.`);

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
                            // Don't await here to allow concurrent handling (especially with delays)
                            if (sessionId === 'wa-bot-ai' || UUID_REGEX.test(sessionId)) {
                                aiBotService.handleIncomingMessage(sessionId, socket, msg).catch(err => {
                                    console.error(`❌ [${sessionId}] AI Bot Error:`, err.message);
                                });
                            } else if (sessionId === 'CS-BOT') {
                                csBotService.handleIncomingMessage(sessionId, socket, msg).catch(err => {
                                    console.error(`❌ [${sessionId}] CS Bot Error:`, err.message);
                                });
                            }
                        }
                    }
                }
            });

        } catch (error) {
            connectionLock.delete(sessionId);
            console.error(`❌ [${sessionId}] Critical Connection Error:`, error.message);
            // Retry connection after a delay
            setTimeout(() => this.connect(sessionId), 15000);
        }
    }
}

module.exports = new ConnectionService();
