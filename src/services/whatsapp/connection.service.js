const {
    default: makeWASocket,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const { baileysLogger } = require('../../config/logger');
const sessionManager = require('./session.manager');
const { registerConnectionUpdateHandler, registerMessageUpsertHandler } = require('./connection.handlers');
const { useSupabaseAuthState } = require('./auth.service');
const fs = require('fs');
const path = require('path');

// Use standard logger
const configService = require('../common/config.service');

const connectionLock = new Map();

// UUID detection regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class ConnectionService {
    async connect(sessionId = 'main-session', userId = null, phoneNumber = null) {
        // Guard: Prevent multiple simultaneous connection attempts for the same sessionId
        if (connectionLock.get(sessionId)) {
            console.log(`â„¹ï¸ [${sessionId}] Connection attempt already in progress. skipping.`);
            return;
        }

        try {
            connectionLock.set(sessionId, true);
            const existingSession = sessionManager.getSession(sessionId);

            if (existingSession) {
                if (existingSession.connectionState.connection === 'open') {
                    console.log(`â„¹ï¸ [${sessionId}] Already connected. skipping.`);
                    connectionLock.delete(sessionId);
                    return;
                }

                // If there's an old socket, clean it up aggressively
                if (existingSession.socket) {
                    console.log(`ðŸ§¹ [${sessionId}] Cleaning up old socket before reconnecting...`);
                    try {
                        existingSession.socket.ev.removeAllListeners();
                        existingSession.socket.end();
                    } catch (e) { /* ignore */ }
                    existingSession.socket = null;
                }
            }

            const displayName = await configService.getUserDisplay(userId || sessionId);

            // CONFLICT PREVENTION: Check if phone number is already active in another session
            if (phoneNumber) {
                const cleanRequestPhone = phoneNumber.replace(/\D/g, '');
                const conflict = sessionManager.getSessionByPhone(cleanRequestPhone);
                if (conflict && conflict.id !== sessionId) {
                    console.log(`âš ï¸  [${displayName}] Conflict Detected: Phone ${cleanRequestPhone} is already active on session [${conflict.displayName}] (${conflict.id}). Skipping connection to prevent flapping.`);
                    connectionLock.delete(sessionId);
                    return;
                }
            }

            console.log(`\nðŸš€ [${displayName}] Connecting to WhatsApp...`);

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
                retryRequestDelayMs: 5000,
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
                    console.log(`ðŸŒ€ [${displayName}] Requesting Pairing Code for: ${cleanNumber}`);
                    setTimeout(async () => {
                        try {
                            const code = await socket.requestPairingCode(cleanNumber);
                            sessionData.connectionState.pairingCode = code;
                            console.log(`ðŸ”‘ [${displayName}] Pairing Code Generated: ${code}`);
                        } catch (err) {
                            console.error(`âŒ [${displayName}] Failed to generate pairing code:`, err.message);
                        }
                    }, 3000);
                }
            }

            // connection.update handler
            registerConnectionUpdateHandler({
                socket,
                sessionData,
                sessionId,
                clearSession,
                reconnect: (delay) => setTimeout(() => this.connect(sessionId), delay)
            });
            socket.ev.on('creds.update', saveCreds);

            registerMessageUpsertHandler({ socket, sessionId });

        } catch (error) {
            connectionLock.delete(sessionId);
            console.error(`âŒ [${sessionId}] Critical Connection Error:`, error.message);
            // Retry connection after a delay
            setTimeout(() => this.connect(sessionId), 15000);
        }
    }
}

module.exports = new ConnectionService();



