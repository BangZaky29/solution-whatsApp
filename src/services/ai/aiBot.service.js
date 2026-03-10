const geminiService = require('./gemini.service');
const whatsappService = require('../whatsapp/whatsapp.service');
const historyService = require('../common/history.service');
const configService = require('../common/config.service');
const sessionManager = require('../whatsapp/session.manager');
const supabase = require('../../config/supabase');
const logService = require('../common/log.service');

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
        const getMessageText = (m) => {
            if (!m) return "";
            return m.conversation ||
                m.extendedTextMessage?.text ||
                m.imageMessage?.caption ||
                m.videoMessage?.caption ||
                m.buttonsResponseMessage?.selectedButtonId ||
                m.listResponseMessage?.singleSelectReply?.selectedRowId ||
                "";
        };
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
            // Broad ContextInfo extraction (works for text and media replies)
            const contextInfo = msg.message?.extendedTextMessage?.contextInfo ||
                msg.message?.imageMessage?.contextInfo ||
                msg.message?.videoMessage?.contextInfo ||
                msg.message?.audioMessage?.contextInfo || {};

            const quotedParticipant = contextInfo.participant || "";
            const quotedBase = quotedParticipant.split(':')[0].split('@')[0];

            // Check if message is a reply to the bot itself (Compare base IDs to skip device suffixes)
            const isReplyToMe = (quotedBase && (quotedBase === myNumber || (myLidBase && quotedBase === myLidBase)));

            const lowerText = messageText.toLowerCase();

            // Check for keywords anywhere (ai, bot, or display name)
            const triggerWords = ['ai', 'bot'];
            if (displayName) triggerWords.push(displayName.toLowerCase());
            const keywordRegex = new RegExp(`\\b(${triggerWords.join('|')})\\b`, 'i');
            const hasKeyword = keywordRegex.test(lowerText);

            // Check if bot is mentioned via official mention (JID/LID), text "@number", or text "@displayName"
            const isMentioned = mentions.includes(myJid) ||
                (myLid && mentions.includes(myLid)) ||
                mentions.some(m => m.includes(myNumber)) ||
                (myLidBase && mentions.some(m => m.includes(myLidBase))) ||
                lowerText.includes(`@${myNumber}`) ||
                (myLidBase && lowerText.includes(`@${myLidBase}`)) ||
                (displayName && lowerText.includes(`@${displayName.toLowerCase()}`));

            if (!isMentioned && !isReplyToMe && !hasKeyword) {
                return;
            }

            let triggerType = 'UNKNOWN';
            if (isMentioned) triggerType = 'MENTION';
            else if (isReplyToMe) triggerType = 'REPLY';
            else if (hasKeyword) triggerType = 'KEYWORD';

            console.log(`📢 [AI-Bot][${displayName}] Triggered via ${triggerType} (Quoted: ${quotedParticipant || 'none'}). Proceeding.`);
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
        const isMedia = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'].includes(messageType);
        const saveKeywords = ['simpan', 'save', 'store', 'unggah', 'upload'];
        const confirmKeywords = ['iya', 'iyah', 'yes', 'ok', 'boleh', 'siap', 'simpan', 'save'];
        const rejectKeywords = ['tidak', 'gak', 'nggak', 'no', 'batal', 'cancel', 'gausah'];

        const hasSaveIntent = isMedia && saveKeywords.some(kw => lowerText.includes(kw));
        const hasPending = this.pendingMedia.has(remoteJid);
        const isConfirming = !isMedia && hasPending && confirmKeywords.some(kw => lowerText.includes(kw));
        const isRejecting = !isMedia && hasPending && rejectKeywords.some(kw => lowerText.includes(kw));

        if (isMedia) {
            if (hasSaveIntent) {
                console.log(`📸 [AI-Bot][${displayName}] Media detected WITH save intent. Processing...`);
                const mediaService = require('../whatsapp/media.service');
                const mediaRecord = await mediaService.processIncomingMedia(msg, userId);
                if (mediaRecord) {
                    await whatsappService.sendMessage(socket, remoteJid, {
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
                await whatsappService.sendMessage(socket, remoteJid, {
                    text: `📸 *Media Terdeteksi*\n\nbro lu ngirim ${messageType.replace('Message', '')} mau disimpan gak?`
                }, { quoted: msg });
                return; // Wait for confirmation
            }
        } else if (isConfirming) {
            console.log(`👍 [AI-Bot][${displayName}] User confirmed media storage. Processing cached media...`);
            const cachedMsg = this.pendingMedia.get(remoteJid);
            const mediaService = require('../whatsapp/media.service');
            const mediaRecord = await mediaService.processIncomingMedia(cachedMsg, userId);

            if (mediaRecord) {
                await whatsappService.sendMessage(socket, remoteJid, {
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
            await whatsappService.sendMessage(socket, remoteJid, { text: "Oke bro, media gak bakal gue simpan. 👌" }, { quoted: msg });
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
            const imageMatch = aiResponse.match(/\[SEND_IMAGE:\s*(https?:\/\/[^\]]+)\]/);
            const videoMatch = aiResponse.match(/\[SEND_VIDEO:\s*(https?:\/\/[^\]]+)\]/);
            const audioMatch = aiResponse.match(/\[SEND_AUDIO:\s*(https?:\/\/[^\]]+)\]/);

            // Clean response for textual part
            const cleanResponse = aiResponse
                .replace(/\[SEND_IMAGE:[^\]]+\]/g, '')
                .replace(/\[SEND_VIDEO:[^\]]+\]/g, '')
                .replace(/\[SEND_AUDIO:[^\]]+\]/g, '')
                .trim();

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
            if (imageMatch) {
                console.log(`📤 [AI-Bot][${displayName}] AI sending IMAGE: ${imageMatch[1]}`);
                await socket.sendMessage(remoteJid, { image: { url: imageMatch[1] }, caption: "Ini kak fotonya... 😉" });
            } else if (videoMatch) {
                console.log(`📤 [AI-Bot][${displayName}] AI sending VIDEO: ${videoMatch[1]}`);
                await socket.sendMessage(remoteJid, { video: { url: videoMatch[1] } });
            } else if (audioMatch) {
                console.log(`📤 [AI-Bot][${displayName}] AI sending AUDIO: ${audioMatch[1]}`);
                await socket.sendMessage(remoteJid, { audio: { url: audioMatch[1] }, mimetype: 'audio/mp4', ptt: true });
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
