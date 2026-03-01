/**
 * ============================================
 * WhatsApp Gateway API - Main Server (Refactored)
 * ============================================
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');

// Configs
const { logger } = require('./src/config/logger');

// Middleware
const { errorHandler, notFoundHandler } = require('./src/middleware/error.middleware');

// Services
const sessionManager = require('./src/services/whatsapp/session.manager');
const connectionService = require('./src/services/whatsapp/connection.service');

// Routes
const whatsappRoutes = require('./src/routes/whatsapp.routes');
const authRoutes = require('./src/routes/auth.routes');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS
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

// Health check
app.get('/', (req, res) => {
    res.json({
        name: 'WhatsApp Gateway API (Multi-Session)',
        version: '1.2.0',
        status: 'running',
        sessionsCount: sessionManager.count,
        sessions: sessionManager.getAllSessions(),
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        sessionsCount: sessionManager.count
    });
});

// Routes
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/auth', authRoutes);

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

// ============================================
// Proactive & Auto-Healing Mechanisms
// ============================================

// Auto-healing: Restart dead sessions every 5 mins
setInterval(() => {
    sessionManager.forEach((session, sessionId) => {
        if (session.connectionState.connection === 'close' ||
            session.connectionState.connection === 'disconnected') {
            console.log(`🩹 [Auto-Healing] Attempting to revive dead session: ${sessionId}`);
            connectionService.connect(sessionId).catch(e =>
                console.error(`❌ [Auto-Healing] Failed to revive ${sessionId}:`, e.message)
            );
        }
    });
}, 5 * 60 * 1000);

// Send presence update periodically
setInterval(() => {
    sessionManager.forEach(({ socket, connectionState }, sessionId) => {
        if (socket && connectionState.connection === 'open') {
            try {
                socket.sendPresenceUpdate('available');
            } catch (err) {
                console.error(`⚠️ [${sessionId}] Keep-alive error:`, err.message);
            }
        }
    });
}, 30000);

// Proactive AI Mechanism
setInterval(async () => {
    const aiBotService = require('./src/services/ai/aiBot.service');
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    sessionManager.forEach(async (session, sessionId) => {
        if ((UUID_REGEX.test(sessionId) || sessionId === 'wa-bot-ai') &&
            session.socket &&
            session.connectionState.connection === 'open') {
            await aiBotService.checkAndSendProactiveMessage(sessionId, session.socket);
        }
    });
}, 15 * 60 * 1000);

// 24h Storage Cleanup
setInterval(async () => {
    const historyService = require('./src/services/common/history.service');
    await historyService.clearAllHistory();
}, 24 * 60 * 60 * 1000);

// ============================================
// Start Server
// ============================================

async function startServer() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        console.error('❌ Missing Supabase credentials!');
        process.exit(1);
    }

    app.listen(PORT, () => {
        console.log(`\n${'='.repeat(50)}`);
        console.log(`  WhatsApp Gateway API (Refactored)`);
        console.log(`  🌐 Server: http://localhost:${PORT}`);
        console.log(`${'='.repeat(50)}\n`);
    });

    const initialSessions = [
        process.env.SESSION_ID || 'main-session',
        'CS-BOT'
    ];

    for (const sessionId of initialSessions) {
        connectionService.connect(sessionId).catch(err =>
            console.error(`❌ Auto-start failed for ${sessionId}: ${err.message}`)
        );
    }
}

// Graceful shutdown
const shutdown = (signal) => {
    console.log(`\n👋 Received ${signal}, shutting down all sessions...`);
    sessionManager.forEach(({ socket }) => {
        if (socket) socket.end();
    });
    process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startServer();
