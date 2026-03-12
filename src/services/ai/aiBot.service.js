const geminiService = require('./gemini.service');
const whatsappService = require('../whatsapp/whatsapp.service');
const historyService = require('../common/history.service');
const configService = require('../common/config.service');
const sessionManager = require('../whatsapp/session.manager');
const supabase = require('../../config/supabase');
const logService = require('../common/log.service');
const { checkAndSendProactiveMessage } = require('./aiBot.proactive');
const {
    getMessageText,
    getGroupTriggerInfo,
    getMediaHandlingState,
    parseMediaTags
} = require('./aiBot.helpers');

// Payment & Token System
const paymentService = require('../payment/payment.service');
const notificationService = require('../payment/notification.service');

// UUID detection regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROACTIVE_SYSTEM_PROMPT_SUFFIX = "\n\nIni adalah pesan follow-up otomatis (proactive nudge). Sapa pengguna dengan ramah dan tanyakan apakah ada hal lain yang bisa dibantu, atau lanjutkan topik pembicaraan sebelumnya dengan cara yang sangat halus dan tidak memaksa.";
const PROACTIVE_NUDGE_PROMPT = "Berikan sapaan ramah atau follow up singkat berdasarkan konteks percakapan di atas.";

/**
 * AI Bot Service
 */
class AIBotService {
    constructor() {
        this.config = { systemPrompt: "" };
        this.pendingMedia = new Map(); // Store { remoteJid: msg }
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
        if (msg.key.fromMe) return;

        const remoteJid = msg.key.remoteJid;
        if (!remoteJid || remoteJid === 'status@broadcast') return;

        const session = sessionManager.getSession(sessionId);
        const userId = UUID_REGEX.test(sessionId) ? sessionId : (session?.userId || null);

        if (!userId && sessionId !== 'wa-bot-ai') return;

        const isGroup = remoteJid.endsWith('@g.us');
        const myJid = (socket.user?.id?.split(':')[0] || '').split('@')[0] + '@s.whatsapp.net';
        const myNumber = myJid.split('@')[0];
        const myLid = socket.user?.lid || socket.authState?.creds?.me?.lid || '';
        const myLidBase = myLid ? myLid.split(':')[0].split('@')[0] : '';
        const displayName = session?.displayName || sessionId;

        // ── ROBUST TEXT EXTRACTION ──
        const messageText = getMessageText(msg.message);
        const lowerText = messageText.toLowerCase();
        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

        // ── TOP-LEVEL LOGGING ──
        if (isGroup) {
            console.log(`📩 [AI-Bot][${displayName}] Incoming group message: ${remoteJid}`);
            console.log(`   - Sender: ${msg.key.participant || 'unknown'}`);
            console.log(`   - MyBaseJid: ${myJid} | MyLid: ${myLid}`);
            console.log(`   - Mentions in msg: ${JSON.stringify(mentions)}`);
            console.log(`   - Raw Text: "${messageText}"`);
        }

        // ── Item #X: GROUP MENTION, REPLY & KEYWORD DETECTION ──
        if (isGroup) {
            const { shouldProcess, triggerType, quotedParticipant } = getGroupTriggerInfo({
                message: msg.message,
                messageText,
                mentions,
                myJid,
                myLid,
                myNumber,
                myLidBase,
                displayName
            });

            if (!shouldProcess) {
                return;
            }

            console.log(`[AI-Bot][${displayName}] Triggered via ${triggerType} (Quoted: ${quotedParticipant || 'none'}). Proceeding.`);
        }

        const participantJid = msg.key.participant || remoteJid;
        const senderId = participantJid.split('@')[0].split(':')[0];
        const cleanSender = senderId.replace(/\D/g, '');

        const isAllowed = await configService.isContactAllowed(remoteJid, userId);
        if (!isAllowed) {
            let logName = isGroup ? `Grup (${remoteJid.split('@')[0].substring(0, 10)}...)` : (msg.pushName || 'Unknown');
            if (isGroup) {
                try {
                    console.log(`🔍 [AI-Bot][${displayName}] Attempting to resolve group name for ${remoteJid}`);
                    // Race against 5s timeout to prevent hanging the AI pipeline
                    const metadata = await Promise.race([
                        socket.groupMetadata(remoteJid),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout fetching metadata')), 5000))
                    ]);
                    logName = metadata.subject || logName;
                    console.log(`📦 [AI-Bot][${displayName}] Resolved group name: ${logName}`);
                } catch (e) {
                    console.warn(`⚠️ [AI-Bot][${displayName}] Metadata fetch failed: ${e.message}`);
                    // Fallback to pushName which is already set
                }
            }

            await configService.logBlockedAttempt(remoteJid, logName, userId);
            console.log(`🚫 [AI-Bot][${displayName}] Target ${isGroup ? 'Group' : 'Sender'} "${logName}" NOT whitelisted. Logged to blocklist.`);
            logService.warn(userId, sessionId, `Target ${isGroup ? 'Group' : 'Sender'} "${logName}" NOT whitelisted.`);
            return;
        }

        // ── Item #9: SKIP SYSTEM MESSAGES (CS-BOT & MAIN-SESSION) ──
        // Skip messages from system sessions to avoid AI responding to notifications
        const systemSessions = ['CS-BOT', process.env.SESSION_ID || 'main-session'];
        for (const sysId of systemSessions) {
            const sysSession = sessionManager.getSession(sysId);
            if (sysSession && sysSession.socket) {
                try {
                    const sysJid = sysSession.socket.user?.id;
                    const sysNumber = sysJid ? sysJid.split('@')[0].split(':')[0].replace(/\D/g, '') : null;
                    if (sysNumber && cleanSender === sysNumber) {
                        console.log(`🤖 [AI-Bot][${displayName}] Skipping system message from ${sysId} (${cleanSender}).`);
                        logService.system(userId, sessionId, `Skipping ${sysId} message to prevent self-loop.`);
                        return;
                    }
                } catch (e) { }
            }
        }

        const messageType = msg.message ? Object.keys(msg.message)[0] : null;
        // messageText is already defined above

        // ── Item #X: DEFENSIVE MEDIA HANDLING ──
        const saveKeywords = ['simpan', 'save', 'store', 'unggah', 'upload'];
        const confirmKeywords = ['iya', 'iyah', 'yes', 'ok', 'boleh', 'siap', 'simpan', 'save'];
        const rejectKeywords = ['tidak', 'gak', 'nggak', 'no', 'batal', 'cancel', 'gausah'];

        const hasPending = this.pendingMedia.has(remoteJid);
        const { isMedia, hasSaveIntent, isConfirming, isRejecting } = getMediaHandlingState({
            messageType,
            lowerText,
            hasPending,
            saveKeywords,
            confirmKeywords,
            rejectKeywords
        });

        let mediaRecord = null;

        if (isMedia) {
            if (hasSaveIntent) {
                console.log(`📸 [AI-Bot][${displayName}] Media detected WITH save intent. Processing...`);
                const mediaService = require('../whatsapp/media.service');
                mediaRecord = await mediaService.processIncomingMedia(msg, userId);
                if (mediaRecord) {
                    await socket.sendMessage(remoteJid, {
                        text: `✅ *Media Berhasil Disimpan*\n\n` +
                            `📝 *Nama:* ${mediaRecord.file_name}\n` +
                            `📁 *Tipe:* ${mediaRecord.file_type}\n` +
                            `📡 *Status:* Tersimpan di Cloud (Supabase)\n` +
                            `🔗 *URL:* ${mediaRecord.public_url}`
                    }, { quoted: msg });
                }
            } else {
                console.log(`📸 [AI-Bot][${displayName}] Media detected WITHOUT intent. Caching for confirmation.`);
                this.pendingMedia.set(remoteJid, msg);
                await socket.sendMessage(remoteJid, {
                    text: `📸 *Media Terdeteksi*\n\nbro lu ngirim ${messageType.replace('Message', '')} mau disimpan gak?`
                }, { quoted: msg });
                return; // Wait for confirmation
            }
        } else if (isConfirming) {
            console.log(`👍 [AI-Bot][${displayName}] User confirmed media storage. Processing cached media...`);
            const cachedMsg = this.pendingMedia.get(remoteJid);
            const mediaService = require('../whatsapp/media.service');
            mediaRecord = await mediaService.processIncomingMedia(cachedMsg, userId);

            if (mediaRecord) {
                await socket.sendMessage(remoteJid, {
                    text: `✅ *Media Berhasil Disimpan*\n\n` +
                        `📝 *Nama:* ${mediaRecord.file_name}\n` +
                        `📁 *Tipe:* ${mediaRecord.file_type}\n` +
                        `📡 *Status:* Tersimpan di Cloud (Supabase)\n` +
                        `🔗 *URL:* ${mediaRecord.public_url}`
                }, { quoted: msg });
            }
            this.pendingMedia.delete(remoteJid);
            return;
        } else if (isRejecting) {
            console.log(`🛑 [AI-Bot][${displayName}] User rejected media storage. Clearing cache.`);
            this.pendingMedia.delete(remoteJid);
            await socket.sendMessage(remoteJid, { text: "Oke bro, media gak bakal gue simpan. 👌" }, { quoted: msg });
            return;
        }

        if (!messageText && !isMedia) return;

        // NEW: Check for AI enabled and delay
        const controls = await configService.getAIControls(userId);
        if (!controls.is_ai_enabled) {
            console.log(`🔇 [AI-Bot][${displayName}] AI is DISABLED for this user.`);
            logService.warn(userId, sessionId, `AI processing is DISABLED in settings. Ignoring message.`);
            return;
        }

        // ── TOKEN ENFORCEMENT ──
        if (userId && UUID_REGEX.test(userId)) {
            const subscription = await paymentService.getActiveSubscription(userId);
            if (!subscription) {
                console.log(`💳 [AI-Bot][${displayName}] No active subscription. Blocking.`);
                logService.error(userId, sessionId, `No active subscription found. Blocked AI response.`);
                await socket.sendMessage(remoteJid, {
                    text: '⚠️ Langganan Anda tidak aktif. Silakan berlangganan di dashboard WA-BOT-AI untuk menggunakan fitur AI.'
                });
                return;
            }

            const hasTokens = await paymentService.hasEnoughTokens(userId, 10);
            if (!hasTokens) {
                console.log(`🎫 [AI-Bot][${displayName}] Insufficient tokens. Blocking.`);
                logService.error(userId, sessionId, `Insufficient tokens (Requires 10). Blocked AI response.`);
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

        let pushName = msg.pushName || 'User';
        if (isGroup) {
            try {
                const metadata = await socket.groupMetadata(remoteJid);
                pushName = metadata.subject || pushName;
            } catch (e) { }
        }
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        let fullMessageText = messageText;
        if (quotedMsg) {
            const contextText = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || "";
            if (contextText) fullMessageText = `(Membalas pesan: "${contextText}") ` + messageText;
        }

        console.log(`🤖 [AI-Bot][${displayName}] Message from ${cleanSender}: "${fullMessageText}"`);
        logService.info(userId, sessionId, `Received message from ${cleanSender}: "${fullMessageText.substring(0, 50)}..."`);

        const isPacarZaky = cleanSender.includes('6288293473765');
        let systemPrompt = await configService.getSystemPrompt(userId);

        // --- NEW: INJECT AI CAPABILITIES KNOWLEDGE ---
        systemPrompt += "\n\nKEMAMPUAN MEDIA (VITAL): Kamu sekarang bisa melihat, menganalisis, dan MENGINGAT media di masa lalu.";
        systemPrompt += "\n- Jika user mengirim foto di chat sebelumnya, kamu akan melihat log [Media image: url] di history.";
        systemPrompt += "\n- Jika user minta kirim balik foto tersebut, cari URL-nya di history lalu gunakan format: [SEND_IMAGE: url_dari_history].";
        systemPrompt += "\n- Gunakan format [SEND_IMAGE: url] untuk gambar, [SEND_VIDEO: url] untuk video, dan [SEND_AUDIO: url] untuk audio.";
        systemPrompt += "\nJangan pernah katakan 'saya tidak punya fotonya' jika URL-nya ada di log history di atas.";

        if (isPacarZaky && !userId) { // Special logic only for global bot
            systemPrompt += " Khusus untuk orang ini, dia adalah pacar Zaky. Kamu harus ekstra ramah, sangat baik, dan perhatian.";
        }

        const history = await historyService.getHistory(remoteJid, userId);
        const formattedHistory = historyService.formatForPrompt(history);

        // --- NEW: INJECT MEDIA INFO INTO PROMPT ---
        let promptWithMedia = fullMessageText;
        if (mediaRecord) {
            promptWithMedia = `[User sent a ${mediaRecord.file_type}: ${mediaRecord.public_url}] ` + (fullMessageText || "Please analyze this file.");
        }

        await socket.sendPresenceUpdate('composing', remoteJid);
        const startTime = Date.now();
        await configService.incrementStat('requests', userId);

        try {
            const activeKeyConfig = await configService.getGeminiApiKey(userId);
            console.log(`🤖 [AI-Bot][${displayName}] Using API Key model: ${activeKeyConfig.model} (Custom: ${!!activeKeyConfig.key && activeKeyConfig.key !== process.env.GEMINI_API_KEY})`);
            logService.system(userId, sessionId, `Invoking LLM Model: ${activeKeyConfig.model}`);

            const aiResponse = await geminiService.generateResponse(promptWithMedia, formattedHistory, systemPrompt, {
                apiKey: activeKeyConfig.key,
                modelName: activeKeyConfig.config?.model || activeKeyConfig.model,
                apiVersion: activeKeyConfig.config?.version || activeKeyConfig.version,
                media: mediaRecord && mediaRecord.buffer ? {
                    buffer: mediaRecord.buffer,
                    mimetype: mediaRecord.mimetype
                } : null
            });
            const latency = Date.now() - startTime;
            logService.success(userId, sessionId, `AI Response generated in ${latency}ms`);

            // --- NEW: AI MEDIA RESPONSE PARSING ---
            const { cleanResponse, imageUrl, videoUrl, audioUrl } = parseMediaTags(aiResponse);

            // NEW: Implement response delay
            if (controls.response_delay_mins > 0) {
                const delayMs = controls.response_delay_mins * 60 * 1000;
                console.log(`⏱️ [AI-Bot][${displayName}] Delaying response for ${controls.response_delay_mins} mins...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }

            // Send textual response if not empty
            if (cleanResponse) {
                await socket.sendMessage(remoteJid, { text: cleanResponse });
            }

            // Send actual media if parsed
            if (imageUrl) {
                console.log(`📤 [AI-Bot][${displayName}] AI sending IMAGE: ${imageUrl}`);
                await socket.sendMessage(remoteJid, { image: { url: imageUrl }, caption: "Ini kak fotonya... 😉" });
            } else if (videoUrl) {
                console.log(`📤 [AI-Bot][${displayName}] AI sending VIDEO: ${videoUrl}`);
                await socket.sendMessage(remoteJid, { video: { url: videoUrl } });
            } else if (audioUrl) {
                console.log(`📤 [AI-Bot][${displayName}] AI sending AUDIO: ${audioUrl}`);
                await socket.sendMessage(remoteJid, { audio: { url: audioUrl }, mimetype: 'audio/mp4', ptt: true });
            }

            await configService.incrementStat('responses', userId);

            // ── DEDUCT TOKENS ──
            if (userId && UUID_REGEX.test(userId)) {
                const deductResult = await paymentService.deductTokens(userId, 10, 'ai_response', remoteJid);
                if (deductResult.success) {
                    console.log(`🎫 [AI-Bot][${displayName}] Deducted 10 tokens. Remaining: ${deductResult.balance}`);
                    logService.system(userId, sessionId, `Deducted 10 tokens. Remaining balance: ${deductResult.balance}`);
                    // Item #8: Only warn at milestone 100 exactly
                    if (deductResult.balance > 0 && deductResult.balance <= 100 && deductResult.balance + 10 > 100) {
                        const { data: user } = await supabase.from('users').select('phone, full_name, username').eq('id', userId).single();
                        if (user?.phone) {
                            await notificationService.notifyTokenLow(user.phone, user.full_name || user.username || 'User', deductResult.balance);
                        }
                    }
                }
            }

            // Save to history (including media if any)
            await historyService.saveMessage(remoteJid, pushName, {
                role: 'user',
                content: fullMessageText || `[Sent ${mediaRecord?.file_type || 'Media'}]`,
                mediaUrl: mediaRecord?.public_url,
                mediaType: mediaRecord?.file_type
            }, userId);
            await historyService.saveMessage(remoteJid, 'AI Assistant', { role: 'model', content: aiResponse, latency }, userId);

        } catch (error) {
            console.error(`❌ [AI-Bot][${displayName}] Error:`, error.message);
            logService.error(userId, sessionId, `AI Generation failed: ${error.message}`);

            // If API Key error, maybe notify user or fallback gracefully
            if (error.message.includes('API_KEY_INVALID') || error.message.includes('403')) {
                await socket.sendMessage(remoteJid, { text: "Maaf, sepertinya ada masalah dengan konfigurasi AI saya. Mohon hubungi pemilik bot." });
            }
        }
    }


    async checkAndSendProactiveMessage(sessionId, socket) {
        return checkAndSendProactiveMessage({
            sessionId,
            socket,
            UUID_REGEX,
            configService,
            paymentService,
            historyService,
            geminiService,
            systemPromptSuffix: PROACTIVE_SYSTEM_PROMPT_SUFFIX,
            nudgePrompt: PROACTIVE_NUDGE_PROMPT
        });
    }

}

module.exports = new AIBotService();
