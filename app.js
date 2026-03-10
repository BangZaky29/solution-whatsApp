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
// Subscription Expiry Cron (every 1 hour)
// ============================================
setInterval(async () => {
    try {
        const paymentService = require('./src/services/payment/payment.service');
        const notificationService = require('./src/services/payment/notification.service');
        const supabase = require('./src/config/supabase');

        // 1. Expire overdue subscriptions
        const expired = await paymentService.checkAndExpireSubscriptions();
        for (const sub of expired) {
            try {
                const { data: user } = await supabase
                    .from('users')
                    .select('phone, full_name, username')
                    .eq('id', sub.user_id)
                    .single();

                if (user?.phone) {
                    await notificationService.notifySubscriptionExpired(
                        user.phone,
                        user.full_name || user.username || 'User',
                        sub.packages?.display_name || 'Unknown'
                    );
                }
            } catch (e) {
                console.error(`❌ [Cron] Notification error for expired sub:`, e.message);
            }
        }

        // Item #4: Notify subscriptions expiring within 3 days
        const threeDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
        const now = new Date().toISOString();
        const { data: expiringSoon } = await supabase
            .from('subscriptions')
            .select('user_id, expires_at, payment_method, packages(display_name)')
            .eq('status', 'active')
            .gt('expires_at', now)
            .lte('expires_at', threeDaysLater);

        if (expiringSoon) {
            for (const sub of expiringSoon) {
                try {
                    const { data: user } = await supabase
                        .from('users')
                        .select('phone, full_name, username')
                        .eq('id', sub.user_id)
                        .single();

                    if (!user?.phone) continue;

                    const daysLeft = Math.ceil((new Date(sub.expires_at) - new Date()) / (1000 * 60 * 60 * 24));

                    if (sub.payment_method === 'trial') {
                        await notificationService.notifyTrialExpiring(
                            user.phone,
                            user.full_name || user.username || 'User'
                        );
                    } else {
                        await notificationService.notifySubscriptionExpiringSoon(
                            user.phone,
                            user.full_name || user.username || 'User',
                            sub.packages?.display_name || 'Unknown',
                            daysLeft
                        );
                    }
                } catch (e) {
                    console.error(`❌ [Cron] Expiring-soon notification error:`, e.message);
                }
            }
        }
    } catch (err) {
        console.error(`❌ [Cron] Subscription expiry check error:`, err.message);
    }
}, 60 * 60 * 1000); // Every 1 hour


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

    // Auto-restore all active sessions from database (respects NODE_ENV)
    const dbSessions = await configService.getAllUserSessions();
    const uniqueSessions = [...new Set(dbSessions)];
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const singleSessions = uniqueSessions.filter(id => !UUID_REGEX.test(id) && id !== 'wa-bot-ai');
    const multiSessions = uniqueSessions.filter(id => UUID_REGEX.test(id) || id === 'wa-bot-ai');

    console.log(`📡 [Boot] Restoring ${uniqueSessions.length} sessions...`);

    // 1. Single Sessions
    for (const sessionId of singleSessions) {
        connectionService.connect(sessionId).catch(err =>
            console.error(`❌ Auto-start failed for ${sessionId}: ${err.message}`)
        );
    }

    // 2. Multi Sessions
    if (multiSessions.length > 0) {
        console.log(`\n📡 [Boot-multi-session ${multiSessions.length}]`);
        for (const sessionId of multiSessions) {
            connectionService.connect(sessionId).catch(err =>
                console.error(`❌ Auto-start failed for ${sessionId}: ${err.message}`)
            );
        }
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

// Prevent process from crashing on non-critical errors (Always-On)
process.on('uncaughtException', (err) => {
    console.error('🔥 [Critical] Uncaught Exception:', err.message);
    if (err.stack) console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 [Critical] Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer();
