const geminiService = require('./gemini.service');
const whatsappService = require('../whatsapp/whatsapp.service');
const historyService = require('../common/history.service');
const configService = require('../common/config.service');
const sessionManager = require('../whatsapp/session.manager');
const supabase = require('../../config/supabase');

// Payment & Token System
const paymentService = require('../payment/payment.service');
const notificationService = require('../payment/notification.service');

// UUID detection regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * AI Bot Service
 */
class AIBotService {
    constructor() {
        this.config = { systemPrompt: "" };
        console.log(`🤖 [AI-Bot] Service initialized for multi-user mode`);
    }

    async init() {
        // No longer a single global init
    }

    async updateConfig(newConfig, userId = null) {
        if (newConfig.systemPrompt) {
            await configService.updateSetting(userId ? `system_prompt:${userId}` : 'system_prompt', { text: newConfig.systemPrompt });
        }
    }

    async handleIncomingMessage(sessionId, socket, msg) {
        const session = sessionManager.getSession(sessionId);
        const userId = UUID_REGEX.test(sessionId) ? sessionId : (session?.userId || null);

        if (!userId && sessionId !== 'wa-bot-ai') return;
        const remoteJid = msg.key.remoteJid;
        if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') return;

        const senderId = remoteJid.split('@')[0].split(':')[0];
        const cleanSender = senderId.replace(/\D/g, '');

        const displayName = session?.displayName || sessionId;

        const isAllowed = await configService.isContactAllowed(remoteJid, userId);
        if (!isAllowed) {
            const pushName = msg.pushName || 'Unknown';
            await configService.logBlockedAttempt(remoteJid, pushName, userId);
            console.log(`🚫 [AI-Bot][${displayName}] Sender ${cleanSender} NOT whitelisted (Full JID: ${remoteJid}). Logged for discovery.`);
            return;
        }

        // ── Item #9: SKIP CS-BOT MESSAGES ──
        // If the sender is CS-BOT's session phone, skip to avoid AI responding to system notifications
        const csBotSession = sessionManager.getSession('CS-BOT');
        if (csBotSession && csBotSession.socket) {
            try {
                const csBotJid = csBotSession.socket.user?.id;
                const csBotNumber = csBotJid ? csBotJid.split('@')[0].split(':')[0].replace(/\D/g, '') : null;
                if (csBotNumber && cleanSender === csBotNumber) {
                    console.log(`🤖 [AI-Bot][${displayName}] Skipping CS-BOT message from ${cleanSender}. No response, no token deduction.`);
                    return;
                }
            } catch (e) {
                // Silently continue if CS-BOT check fails
            }
        }

        const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        if (!messageText) return;

        // NEW: Check for AI enabled and delay
        const controls = await configService.getAIControls(userId);
        if (!controls.is_ai_enabled) {
            console.log(`🔇 [AI-Bot][${displayName}] AI is DISABLED for this user.`);
            return;
        }

        // ── TOKEN ENFORCEMENT ──
        if (userId && UUID_REGEX.test(userId)) {
            const subscription = await paymentService.getActiveSubscription(userId);
            if (!subscription) {
                console.log(`💳 [AI-Bot][${displayName}] No active subscription. Blocking.`);
                await socket.sendMessage(remoteJid, {
                    text: '⚠️ Langganan Anda tidak aktif. Silakan berlangganan di dashboard WA-BOT-AI untuk menggunakan fitur AI.'
                });
                return;
            }

            const hasTokens = await paymentService.hasEnoughTokens(userId, 10);
            if (!hasTokens) {
                console.log(`🎫 [AI-Bot][${displayName}] Insufficient tokens. Blocking.`);
                await socket.sendMessage(remoteJid, {
                    text: '⚠️ Token Anda habis. Silakan top-up token di dashboard WA-BOT-AI.'
                });
                // Notify via CS-BOT
                const { data: user } = await supabase.from('users').select('phone, full_name, username').eq('id', userId).single();
                if (user?.phone) {
                    await notificationService.notifyTokenDepleted(user.phone, user.full_name || user.username || 'User');
                }
                return;
            }
        }

        const pushName = msg.pushName || 'User';
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        let fullMessageText = messageText;
        if (quotedMsg) {
            const contextText = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || "";
            if (contextText) fullMessageText = `(Membalas pesan: "${contextText}") ` + messageText;
        }

        console.log(`🤖 [AI-Bot][${displayName}] Message from ${cleanSender}: "${fullMessageText}"`);

        const isPacarZaky = cleanSender.includes('6288293473765');
        let systemPrompt = await configService.getSystemPrompt(userId);
        if (isPacarZaky && !userId) { // Special logic only for global bot
            systemPrompt += " Khusus untuk orang ini, dia adalah pacar Zaky. Kamu harus ekstra ramah, sangat baik, dan perhatian.";
        }

        const history = await historyService.getHistory(remoteJid, userId);
        const formattedHistory = historyService.formatForPrompt(history);

        await socket.sendPresenceUpdate('composing', remoteJid);
        const startTime = Date.now();
        await configService.incrementStat('requests', userId);

        try {
            const activeKeyConfig = await configService.getGeminiApiKey(userId);
            console.log(`🤖 [AI-Bot][${displayName}] Using API Key model: ${activeKeyConfig.model} (Custom: ${!!activeKeyConfig.key && activeKeyConfig.key !== process.env.GEMINI_API_KEY})`);

            const aiResponse = await geminiService.generateResponse(fullMessageText, formattedHistory, systemPrompt, {
                apiKey: activeKeyConfig.key,
                modelName: activeKeyConfig.config?.model || activeKeyConfig.model,
                apiVersion: activeKeyConfig.config?.version || activeKeyConfig.version
            });
            const latency = Date.now() - startTime;

            // NEW: Implement response delay
            if (controls.response_delay_mins > 0) {
                const delayMs = controls.response_delay_mins * 60 * 1000;
                console.log(`⏱️ [AI-Bot][${displayName}] Delaying response for ${controls.response_delay_mins} mins...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }

            await socket.sendMessage(remoteJid, { text: aiResponse });
            await configService.incrementStat('responses', userId);

            // ── DEDUCT TOKENS ──
            if (userId && UUID_REGEX.test(userId)) {
                const deductResult = await paymentService.deductTokens(userId, 10, 'ai_response', remoteJid);
                if (deductResult.success) {
                    console.log(`🎫 [AI-Bot][${displayName}] Deducted 10 tokens. Remaining: ${deductResult.balance}`);
                    // Item #8: Only warn at milestone 100 exactly
                    if (deductResult.balance > 0 && deductResult.balance <= 100 && deductResult.balance + 10 > 100) {
                        const { data: user } = await supabase.from('users').select('phone, full_name, username').eq('id', userId).single();
                        if (user?.phone) {
                            await notificationService.notifyTokenLow(user.phone, user.full_name || user.username || 'User', deductResult.balance);
                        }
                    }
                }
            }

            // Save to history
            await historyService.saveMessage(remoteJid, pushName, { role: 'user', content: fullMessageText }, userId);
            await historyService.saveMessage(remoteJid, 'AI Assistant', { role: 'model', content: aiResponse, latency }, userId);

        } catch (error) {
            console.error(`❌ [AI-Bot][${displayName}] Error:`, error.message);

            // If API Key error, maybe notify user or fallback gracefully
            if (error.message.includes('API_KEY_INVALID') || error.message.includes('403')) {
                await socket.sendMessage(remoteJid, { text: "Maaf, sepertinya ada masalah dengan konfigurasi AI saya. Mohon hubungi pemilik bot." });
            }
        }
    }

    async checkAndSendProactiveMessage(sessionId, socket) {
        const userId = UUID_REGEX.test(sessionId) ? sessionId : null;
        if (!userId) return;

        try {
            const controls = await configService.getAIControls(userId);
            if (!controls.is_proactive_enabled) return;

            // Check subscription supports proactive & has tokens
            const features = await paymentService.getUserFeatures(userId);
            if (!features.has_subscription || !features.proactive_enabled) return;
            const hasTokens = await paymentService.hasEnoughTokens(userId, 5);
            if (!hasTokens) return;

            const displayName = await configService.getUserDisplay(userId);

            // Get all chats for this user to find candidates
            const chats = await historyService.getAllChatStats(userId);
            const now = new Date();
            let nudgeCount = 0;

            for (const chat of chats) {
                // Item #6: Max 3 nudges per cycle
                if (nudgeCount >= 3) {
                    console.log(`🛑 [AI-Bot][${displayName}] Nudge limit reached (3). Stopping.`);
                    break;
                }

                const lastActive = new Date(chat.last_active);
                const diffMins = (now - lastActive) / (1000 * 60);

                // If last message was from user and it's been more than 60 mins but less than 24h
                if (diffMins > 60 && diffMins < 1440) {
                    const history = await historyService.getHistory(chat.jid, userId);
                    if (history.length > 0 && history[history.length - 1].role === 'user') {
                        // Item #6: Re-check token balance before each nudge
                        const hasTokensNow = await paymentService.hasEnoughTokens(userId, 5);
                        if (!hasTokensNow) {
                            console.log(`🎫 [AI-Bot][${displayName}] Insufficient tokens for nudge. Stopping.`);
                            break;
                        }

                        console.log(`🤖 [AI-Bot][${displayName}] Sending proactive nudge to ${chat.jid}...`);

                        const systemPrompt = await configService.getSystemPrompt(userId) +
                            "\n\nIni adalah pesan follow-up otomatis (proactive nudge). Sapa pengguna dengan ramah dan tanyakan apakah ada hal lain yang bisa dibantu, atau lanjutkan topik pembicaraan sebelumnya dengan cara yang sangat halus dan tidak memaksa.";

                        const formattedHistory = historyService.formatForPrompt(history);
                        const activeKeyConfig = await configService.getGeminiApiKey(userId);

                        // Only if we have an API Key
                        if (!activeKeyConfig.key) continue;

                        const aiResponse = await geminiService.generateResponse(
                            "Berikan sapaan ramah atau follow up singkat berdasarkan konteks percakapan di atas.",
                            formattedHistory,
                            systemPrompt,
                            {
                                apiKey: activeKeyConfig.key,
                                modelName: activeKeyConfig.model
                            }
                        );

                        await socket.sendMessage(chat.jid, { text: aiResponse });

                        // Deduct 5 tokens for proactive nudge
                        await paymentService.deductTokens(userId, 5, 'proactive_nudge', chat.jid);
                        nudgeCount++;

                        // Save as proactive message
                        await historyService.saveMessage(chat.jid, chat.push_name, {
                            role: 'model',
                            content: aiResponse,
                            isProactive: true
                        }, userId);
                    }
                }
            }
        } catch (error) {
            console.error(`❌ [AI-Bot][Proactive] Error for ${sessionId}:`, error.message);
        }
    }
}

module.exports = new AIBotService();
