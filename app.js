/**
 * ============================================
 * WhatsApp Gateway API - Main Server
 * ============================================
 * 
 * Production-ready WhatsApp Gateway using:
 * - Express.js for REST API
 * - @whiskeysockets/baileys for WhatsApp connection
 * - Supabase for session persistence
 * 
 * Run with: npm run dev (development) or npm start (production)
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

// Simple file logger for debugging
const logFile = path.join(__dirname, 'debug.log');
const logToFile = (msg) => {
    try {
        const entry = `[${new Date().toISOString()}] ${msg}\n`;
        fs.appendFileSync(logFile, entry);
        console.log(msg);
    } catch (e) { }
};

logToFile('--- Server Started ---');

// Baileys imports
const {
    default: makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');

// QR code library removed - QR only shown in frontend

// Custom Supabase auth state handler
const { useSupabaseAuthState } = require('./helpers/useSupabaseAuthState');

// Routes factory
const createWhatsAppRoutes = require('./routes/whatsapp.routes');

// ============================================
// Logger Configuration
// ============================================
// Simple logger without pino-pretty (avoiding extra dependency)
const logger = pino({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
});

// Baileys logger (silent for cleaner output)
const baileysLogger = pino({ level: 'silent' });

// ============================================
// Global State
// ============================================
// ============================================
// Global State - Multi-Session Support
// ============================================
/**
 * sessions Map stores data for each WhatsApp connection:
 * Key: sessionId (string)
 * Value: { 
 *   socket: WASocket, 
 *   connectionState: { qr, connection, phoneNumber },
 *   clearSessionHandler: Function
 * }
 */
const sessions = new Map();

// ============================================
// Express App Setup
// ============================================
const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS - Allow all origins in development
app.use(cors({
    origin: [
        'https://admin-controller.nuansasolution.id',
        'https://nuansasolution.id',
        'https://new-wa-bot-ai.bangzaky0029.workers.dev',
        'http://localhost:5173',
        'http://localhost:5174'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
}));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ============================================
// Routes
// ============================================

// Health check
app.get('/', (req, res) => {
    const activeSessions = [];
    sessions.forEach((val, key) => {
        activeSessions.push({
            id: key,
            status: val.connectionState.connection,
            phone: val.connectionState.phoneNumber
        });
    });

    res.json({
        name: 'WhatsApp Gateway API (Multi-Session)',
        version: '1.1.0',
        status: 'running',
        sessionsCount: sessions.size,
        sessions: activeSessions,
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        sessionsCount: sessions.size
    });
});

/**
 * Helper to get session data by ID
 */
const getSession = (sessionId) => sessions.get(sessionId) || null;

// WhatsApp routes - modified to handle multi-session
const whatsappRoutes = createWhatsAppRoutes(getSession, connectToWhatsApp);
app.use('/api/whatsapp', whatsappRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Error handler
app.use((err, req, res, next) => {
    logger.error(err);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// ============================================
// WhatsApp Connection Setup
// ============================================

async function connectToWhatsApp(sessionId = 'main-session') {
    try {
        // Prevent multiple simultaneous connection attempts for the same sessionId
        const existingSession = sessions.get(sessionId);

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
        sessions.set(sessionId, sessionData);

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

        // ============================================
        // Connection Event Handlers
        // ============================================

        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            // Handle QR code
            if (qr) {
                sessionData.connectionState.qr = qr;
                sessionData.connectionState.connection = 'waiting_qr';
                console.log(`📱 [${sessionId}] QR Code generated - Waiting for scan...`);
            }

            // Handle Connection State
            if (connection) {
                sessionData.connectionState.connection = connection;

                if (connection === 'open') {
                    sessionData.connectionState.qr = null;
                    sessionData.connectionState.phoneNumber = socket.user?.id?.split(':')[0] || null;

                    console.log(`\n✅ [${sessionId}] Connected! Phone: ${sessionData.connectionState.phoneNumber}\n`);
                }

                if (connection === 'close') {
                    sessionData.connectionState.qr = null;
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const reason = DisconnectReason[statusCode] || 'Unknown';

                    console.log(`\n❌ [${sessionId}] Disconnection: ${reason} (${statusCode})`);

                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                    if (shouldReconnect) {
                        console.log(`🔄 [${sessionId}] Reconnecting in 10s...`);
                        setTimeout(() => connectToWhatsApp(sessionId), 10000);
                    } else {
                        console.log(`👋 [${sessionId}] Logged out. Session data will be cleared.`);
                        if (clearSession) await clearSession();
                        sessions.delete(sessionId);
                    }
                }
            }
        });

        socket.ev.on('creds.update', saveCreds);

        socket.ev.on('messages.upsert', async ({ messages, type }) => {
            logToFile(`📩 [${sessionId}] messages.upsert type=${type}, count=${messages.length}`);

            if (type === 'notify') {
                const aiBotService = require('./services/aiBot.service');
                for (const msg of messages) {
                    const fromMe = msg.key.fromMe;
                    const remoteJid = msg.key.remoteJid;
                    logToFile(`   > Msg from ${remoteJid}, fromMe=${fromMe}`);

                    if (!fromMe) {
                        try {
                            await aiBotService.handleIncomingMessage(sessionId, socket, msg);
                        } catch (err) {
                            console.error(`❌ [${sessionId}] AI Bot Error:`, err.message);
                            logToFile(`❌ [${sessionId}] AI Bot Error: ${err.message}`);
                        }
                    }
                }
            }
        });

    } catch (error) {
        console.error(`❌ [${sessionId}] Critical Connection Error:`, error.message);
        // Retry connection after a delay
        setTimeout(() => connectToWhatsApp(sessionId), 10000);
    }
}

// ============================================
// Proactive & Auto-Healing Mechanisms
// ============================================

// Auto-healing: Restart dead sessions every 5 mins
setInterval(() => {
    sessions.forEach((session, sessionId) => {
        if (session.connectionState.connection === 'close' ||
            session.connectionState.connection === 'disconnected') {
            console.log(`🩹 [Auto-Healing] Attempting to revive dead session: ${sessionId}`);
            connectToWhatsApp(sessionId).catch(e =>
                console.error(`❌ [Auto-Healing] Failed to revive ${sessionId}:`, e.message)
            );
        }
    });
}, 5 * 60 * 1000);

// Send presence update periodically
setInterval(() => {
    sessions.forEach(({ socket, connectionState }, sessionId) => {
        if (socket && connectionState.connection === 'open') {
            try {
                socket.sendPresenceUpdate('available');
            } catch (err) {
                console.error(`⚠️ [${sessionId}] Keep-alive error:`, err.message);
            }
        }
    });
}, 30000); // Every 30 seconds

// ============================================
// Proactive AI Mechanism
// ============================================
// Check for nudge opportunities every 15 minutes
setInterval(async () => {
    const aiBotSession = sessions.get('wa-bot-ai');
    if (aiBotSession && aiBotSession.socket && aiBotSession.connectionState.connection === 'open') {
        const aiBotService = require('./services/aiBot.service');
        await aiBotService.checkAndSendProactiveMessage(aiBotSession.socket);
    }
}, 15 * 60 * 1000);

// 24h Storage Cleanup Mechanism
setInterval(async () => {
    const historyHelper = require('./helpers/history.helper');
    await historyHelper.clearAllHistory();
}, 24 * 60 * 60 * 1000); // Every 24 hours

// ============================================
// Start Server
// ============================================

async function startServer() {
    // Validate environment
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        console.error('❌ Missing Supabase credentials!');
        console.error('Please set SUPABASE_URL and SUPABASE_ANON_KEY in .env file');
        process.exit(1);
    }

    // Start Express server
    app.listen(PORT, () => {
        console.log(`\n${'='.repeat(50)}`);
        console.log(`  WhatsApp Gateway API (Multi-Session)`);
        console.log(`  Targets: ${process.env.AI_BOT_TARGET_NUMBER}`);
        console.log(`${'='.repeat(50)}`);
        console.log(`  🌐 Server: http://localhost:${PORT}`);
        console.log(`  📡 API: http://localhost:${PORT}/api/whatsapp`);
        console.log(`  🏥 Health: http://localhost:${PORT}/health`);
        console.log(`${'='.repeat(50)}\n`);
    });

    // Start initial WhatsApp connections in parallel
    const initialSessions = [
        process.env.SESSION_ID || 'main-session',
        'wa-bot-ai'
    ];

    await Promise.all(
        initialSessions.map(sessionId =>
            connectToWhatsApp(sessionId).catch(err =>
                global.debugLog(`❌ Auto-start failed for ${sessionId}: ${err.message}`)
            )
        )
    );
}

// Graceful shutdown
const shutdown = async (signal) => {
    console.log(`\n👋 Received ${signal}, shutting down all sessions...`);
    for (const [sessionId, sessionData] of sessions) {
        if (sessionData.socket) {
            sessionData.socket.end();
        }
    }
    process.exit(0);
};

// Crash handlers
process.on('uncaughtException', (err) => {
    global.debugLog(`💥 CRITICAL ERROR (uncaughtException): ${err.message}\n${err.stack}`);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    global.debugLog(`💥 UNHANDLED REJECTION: ${reason}`);
});

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Start the server
startServer();
