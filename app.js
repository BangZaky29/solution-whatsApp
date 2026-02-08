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
let socket = null;
let clearSessionHandler = null;
let connectionState = {
    qr: null,
    connection: 'disconnected',
    phoneNumber: null
};

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
        'http://localhost:5173' // Untuk test lokal
    ],
    credentials: true, // Izinkan cookie/session jika perlu
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ============================================
// Routes
// ============================================

// Health check
app.get('/', (req, res) => {
    res.json({
        name: 'WhatsApp Gateway API',
        version: '1.0.0',
        status: 'running',
        connection: connectionState.connection,
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        connection: connectionState.connection
    });
});

// WhatsApp routes
const whatsappRoutes = createWhatsAppRoutes(
    () => socket,
    () => connectionState,
    () => clearSessionHandler
);
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

/**
 * Initialize WhatsApp connection with Baileys
 * Uses Supabase for session persistence
 */
async function connectToWhatsApp() {
    try {
        console.log('\n🚀 Starting WhatsApp Gateway...\n');

        // Get latest Baileys version
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`📦 Using Baileys v${version.join('.')} (latest: ${isLatest})`);

        // Initialize auth state from Supabase
        const sessionId = process.env.SESSION_ID || 'main-session';
        const { state, saveCreds, clearSession } = await useSupabaseAuthState(sessionId);

        // Store clearSession handler for logout functionality
        clearSessionHandler = clearSession;

        // Create socket
        socket = makeWASocket({
            version,
            logger: baileysLogger,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, baileysLogger)
            },
            printQRInTerminal: false, // We'll handle QR manually
            generateHighQualityLinkPreview: true,
            // Browser identification
            browser: ['WhatsApp Gateway', 'Chrome', '120.0.0'],
            // Link preview settings
            getMessage: async (key) => {
                // If you have message history, return it here
                return { conversation: 'Message not found' };
            }
        });

        // ============================================
        // Connection Event Handlers
        // ============================================

        // Handle connection updates
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            // Store QR code for API access (frontend only)
            if (qr) {
                connectionState.qr = qr;
                connectionState.connection = 'waiting_qr';

                console.log('📱 QR Code generated - scan via frontend at /api/whatsapp/qr');
            }

            // Connection state changed
            if (connection) {
                connectionState.connection = connection;

                if (connection === 'open') {
                    connectionState.qr = null;
                    connectionState.phoneNumber = socket.user?.id?.split(':')[0] || null;

                    console.log('\n✅ Connected successfully!');
                    console.log(`📞 Phone: ${connectionState.phoneNumber}`);
                    console.log(`👤 Name: ${socket.user?.name || 'Unknown'}\n`);
                }

                if (connection === 'close') {
                    connectionState.qr = null;

                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const reason = DisconnectReason[statusCode] || 'Unknown';

                    console.log(`\n❌ Disconnected: ${reason} (${statusCode})`);

                    // Smart reconnection logic
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                    if (shouldReconnect) {
                        console.log('🔄 Reconnecting in 10 seconds...\n');
                        setTimeout(() => {
                            connectToWhatsApp();
                        }, 10000);
                    } else {
                        console.log('👋 Session ended. Scan QR code to login again.\n');
                        // Clear session if logged out
                        if (clearSession) {
                            await clearSession();
                        }
                        // Restart to show new QR (slower to avoid fast reload)
                        setTimeout(() => {
                            connectToWhatsApp();
                        }, 5000);
                    }
                }
            }
        });

        // Handle credential updates (save to Supabase)
        socket.ev.on('creds.update', saveCreds);

        // Handle messages (for logging/debugging)
        socket.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type === 'notify') {
                for (const msg of messages) {
                    if (!msg.key.fromMe) {
                        const sender = msg.key.remoteJid?.replace('@s.whatsapp.net', '') || 'Unknown';
                        const content = msg.message?.conversation ||
                            msg.message?.extendedTextMessage?.text ||
                            '[Media/Other]';
                        console.log(`📩 New message from ${sender}: ${content.substring(0, 50)}...`);
                    }
                }
            }
        });

        // ============================================
        // Keep-Alive Mechanism
        // ============================================
        // Send presence update periodically to prevent disconnection
        setInterval(() => {
            if (socket && connectionState.connection === 'open') {
                socket.sendPresenceUpdate('available');
            }
        }, 30000); // Every 30 seconds

    } catch (error) {
        console.error('❌ Error connecting to WhatsApp:', error);
        console.log('🔄 Retrying in 5 seconds...\n');
        setTimeout(connectToWhatsApp, 5000);
    }
}

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
        console.log(`  WhatsApp Gateway API`);
        console.log(`${'='.repeat(50)}`);
        console.log(`  🌐 Server: http://localhost:${PORT}`);
        console.log(`  📡 API: http://localhost:${PORT}/api/whatsapp`);
        console.log(`  🏥 Health: http://localhost:${PORT}/health`);
        console.log(`${'='.repeat(50)}\n`);
    });

    // Start WhatsApp connection
    await connectToWhatsApp();
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down gracefully...');
    if (socket) {
        socket.end();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n👋 Received SIGTERM, shutting down...');
    if (socket) {
        socket.end();
    }
    process.exit(0);
});

// Start the server
startServer();
