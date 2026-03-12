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
const configService = require('./src/services/common/config.service');

const { startPresenceJob } = require('./src/jobs/presence.job');
const { startProactiveAiJob } = require('./src/jobs/proactiveAi.job');
const { startHistoryCleanupJob } = require('./src/jobs/historyCleanup.job');
const { startSubscriptionExpiryJob } = require('./src/jobs/subscriptionExpiry.job');
const { restoreSessions } = require('./src/bootstrap/restoreSessions');
const { startSessionWatchdogJob } = require('./src/jobs/sessionWatchdog.job');

// Routes
const whatsappRoutes = require('./src/routes/whatsapp.routes');
const authRoutes = require('./src/routes/auth.routes');
const paymentRoutes = require('./src/routes/payment.routes');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS — MUST be before helmet
app.use(cors({
    origin: [
        'https://admin-controller.nuansasolution.id',
        'https://nuansasolution.id',
        'https://new-wa-bot-ai.bangzaky0029.workers.dev',
        'https://neural-wateway.bangzaky0029.workers.dev',
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:3000'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Id', 'Accept'],
}));

// Handle preflight explicitly
app.options('*', cors());

// Security middleware (after CORS)
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
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
app.use('/api/payment', paymentRoutes);

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

// ============================================
// Proactive Logic
// ============================================

startPresenceJob(sessionManager);
startProactiveAiJob(sessionManager);
startHistoryCleanupJob();
startSubscriptionExpiryJob();
startSessionWatchdogJob(); // Monitor and auto-reconnect WhatsApp sessions

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

    await restoreSessions({ configService, connectionService });
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

// Prevent process from crashing on non-critical errors (Always-On)
process.on('uncaughtException', (err) => {
    console.error('🔥 [Critical] Uncaught Exception:', err.message);
    if (err.stack) console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 [Critical] Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer();









