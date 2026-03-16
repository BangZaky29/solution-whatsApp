const geminiService = require("./gemini.service");
const whatsappService = require("../whatsapp/whatsapp.service");
const historyService = require("../common/history.service");
const configService = require("../common/config.service");
const sessionManager = require("../whatsapp/session.manager");
const supabase = require("../../config/supabase");
const logService = require("../common/log.service");
const { checkAndSendProactiveMessage } = require("./aiBot.proactive");
const {
  getMessageText,
  getGroupTriggerInfo,
  getMediaHandlingState,
  parseMediaTags,
} = require("./aiBot.helpers");

// Payment & Token System
const paymentService = require("../payment/payment.service");
const notificationService = require("../payment/notification.service");

// Moderator System
const moderatorGuard = require("../moderator/moderatorGuard");
const moderatorBot = require("../moderator/moderatorBot.service");

// UUID detection regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROACTIVE_SYSTEM_PROMPT_SUFFIX =
  "\n\nIni adalah pesan follow-up otomatis (proactive nudge). Sapa pengguna dengan ramah dan tanyakan apakah ada hal lain yang bisa dibantu, atau lanjutkan topik pembicaraan sebelumnya dengan cara yang sangat halus dan tidak memaksa.";
const PROACTIVE_NUDGE_PROMPT =
  "Berikan sapaan ramah atau follow up singkat berdasarkan konteks percakapan di atas.";

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
      await configService.updateSetting(
        userId ? `system_prompt:${userId}` : "system_prompt",
        { text: newConfig.systemPrompt },
      );
    }
  }

  async handleIncomingMessage(sessionId, socket, msg, isBypassModeratorCheck = false) {
    if (msg.key.fromMe) return;

    const remoteJid = msg.key.remoteJid;
    if (!remoteJid || remoteJid === "status@broadcast") return;

    const session = sessionManager.getSession(sessionId);
    const userId = UUID_REGEX.test(sessionId)
      ? sessionId
      : session?.userId || null;

    if (!userId && sessionId !== "wa-bot-ai") return;

    // ── LOAD CONTROLS EARLY (feature gating) ──
    const controls = await configService.getAIControls(userId);
    

    const isGroup = remoteJid.endsWith("@g.us");
    const myJid =
      (socket.user?.id?.split(":")[0] || "").split("@")[0] + "@s.whatsapp.net";
    const myNumber = myJid.split("@")[0];
    const myLid = socket.user?.lid || socket.authState?.creds?.me?.lid || "";
    const myLidBase = myLid ? myLid.split(":")[0].split("@")[0] : "";
    const displayName = session?.displayName || sessionId;
    
    // DEBUG LOG
    console.log(`🔍 [AI-Bot][Debug] userId: ${userId} (${displayName}) | group_chat_enabled: ${controls.group_chat_enabled}`);

    // ── FEATURE FLAG: GROUP CHAT ──
    if (isGroup && !controls.group_chat_enabled) {
      console.log(
        `✨[AI-Bot][${displayName}] Group chat DISABLED for this user. Skipping.`,
      );
      return;
    }

    // ── ROBUST TEXT EXTRACTION ──
    const messageText = getMessageText(msg.message);
    const lowerText = messageText.toLowerCase();
    const mentions =
      msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    // ── TOP-LEVEL LOGGING ──
    if (isGroup) {
      console.log(
        ` ✨[AI-Bot][${displayName}] Incoming group message: ${remoteJid}`,
      );
      console.log(`   - Sender: ${msg.key.participant || "unknown"}`);
      console.log(`   - MyBaseJid: ${myJid} | MyLid: ${myLid}`);
      console.log(`   - Mentions in msg: ${JSON.stringify(mentions)}`);
      console.log(`   - Raw Text: "${messageText}"`);
    }

    // ── Item #X: GROUP MENTION, REPLY & KEYWORD DETECTION ──
    if (isGroup) {
      const { shouldProcess, triggerType, quotedParticipant } =
        getGroupTriggerInfo({
          message: msg.message,
          messageText,
          mentions,
          myJid,
          myLid,
          myNumber,
          myLidBase,
          displayName,
          allowMention: controls.group_trigger_mention !== false,
          allowReply: controls.group_trigger_reply !== false,
          allowKeyword: controls.group_trigger_keyword === true,
        });

      if (!shouldProcess) {
        return;
      }

      console.log(
        `[AI-Bot][${displayName}] Triggered via ${triggerType} (Quoted: ${quotedParticipant || "none"}). Proceeding.`,
      );
    }

    const participantJid = msg.key.participant || remoteJid;
    const senderId = participantJid.split("@")[0].split(":")[0];
    const cleanSender = moderatorGuard.normalizeIdentifier(senderId);
    const senderPushName = msg.pushName || "Moderator";

    // ── MODERATOR INTERCEPT ──
    const isSenderWhitelisted = await moderatorGuard.isModerator(cleanSender);
    const ownerRole = await moderatorGuard.getUserRoleById(userId);
    const isOwnerModerator = ownerRole === 'moderator';
    const isMe = cleanSender === myNumber || (myLidBase && cleanSender === myLidBase);
    
    // 🛡️ MODERATOR INTERCEPT (AI-FREE / ZERO TOKEN FLOW)
    // Absolute intercept: Any moderator (via phone, LID, or role) or the Owner goes to static System Bot.
    const isModeratorActive = !isGroup && !isBypassModeratorCheck && (isSenderWhitelisted || (isMe && isOwnerModerator));

    if (isModeratorActive) {
      console.log(`🛡️ [AI-Bot][${displayName}] Moderator INTERCEPT: Routing to 100% Static ModeratorBot.`);
      return await moderatorBot.handle(sessionId, socket, msg);
    }

    const isAllowed = await configService.isContactAllowed(remoteJid, userId);
    if (!isAllowed) {
      let logName = isGroup
        ? `Grup (${remoteJid.split("@")[0].substring(0, 10)}...)`
        : msg.pushName || "Unknown";
      if (isGroup) {
        try {
          console.log(
            `🔐 [AI-Bot][${displayName}] Attempting to resolve group name for ${remoteJid}`,
          );
          // Race against 5s timeout to prevent hanging the AI pipeline
          const metadata = await Promise.race([
            socket.groupMetadata(remoteJid),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Timeout fetching metadata")),
                5000,
              ),
            ),
          ]);
          logName = metadata.subject || logName;
          console.log(
            `✨ [AI-Bot][${displayName}] Resolved group name: ${logName}`,
          );
        } catch (e) {
          console.warn(
            `⚠️ [AI-Bot][${displayName}] Metadata fetch failed: ${e.message}`,
          );
          // Fallback to pushName which is already set
        }
      }

      await configService.logBlockedAttempt(remoteJid, logName, userId);
      console.log(
        `✨ [AI-Bot][${displayName}] Target ${isGroup ? "Group" : "Sender"} "${logName}" NOT whitelisted. Logged to blocklist.`,
      );
      logService.warn(
        userId,
        sessionId,
        `Target ${isGroup ? "Group" : "Sender"} "${logName}" NOT whitelisted.`,
      );
      return;
    }

    // ── Item #9: SKIP SYSTEM MESSAGES (CS-BOT & MAIN-SESSION) ──
    // Skip messages from system sessions to avoid AI responding to notifications
    const systemSessions = ["CS-BOT", process.env.SESSION_ID || "main-session"];
    for (const sysId of systemSessions) {
      const sysSession = sessionManager.getSession(sysId);
      if (sysSession && sysSession.socket) {
        try {
          const sysJid = sysSession.socket.user?.id;
          const sysNumber = sysJid
            ? sysJid.split("@")[0].split(":")[0].replace(/\D/g, "")
            : null;
          if (sysNumber && cleanSender === sysNumber) {
            console.log(
              `🤖 [AI-Bot][${displayName}] Skipping system message from ${sysId} (${cleanSender}).`,
            );
            logService.system(
              userId,
              sessionId,
              `Skipping ${sysId} message to prevent self-loop.`,
            );
            return;
          }
        } catch (e) { }
      }
    }

    const messageType = msg.message ? Object.keys(msg.message)[0] : null;
    // messageText is already defined above

    // ── Item #X: DEFENSIVE MEDIA HANDLING ──
    const saveKeywords = ["simpan", "save", "store", "unggah", "upload"];
    const confirmKeywords = [
      "iya",
      "iyah",
      "yes",
      "ok",
      "boleh",
      "siap",
      "simpan",
      "save",
    ];
    const rejectKeywords = [
      "tidak",
      "gak",
      "nggak",
      "no",
      "batal",
      "cancel",
      "gausah",
    ];

    const hasPending = this.pendingMedia.has(remoteJid);
    const { isMedia, hasSaveIntent, isConfirming, isRejecting } =
      getMediaHandlingState({
        messageType,
        lowerText,
        hasPending,
        saveKeywords,
        confirmKeywords,
        rejectKeywords,
      });

    // ── FEATURE FLAG: MEDIA RECEIVE ──
    if (isMedia && !controls.media_receive_enabled) {
      console.log(
        `ðŸ“µ [AI-Bot][${displayName}] Media receive DISABLED. Skipping media.`,
      );
      if (!messageText) return;
      // Fall through to process text if present
    }

    let mediaRecord = null;

    if (isMedia) {
      if (hasSaveIntent) {
        if (controls.media_save_to_cloud) {
          console.log(
            `✨ [AI-Bot][${displayName}] Media detected WITH save intent. Processing...`,
          );
          const mediaService = require("../whatsapp/media.service");
          mediaRecord = await mediaService.processIncomingMedia(msg, userId);
          if (mediaRecord) {
            await socket.sendMessage(
              remoteJid,
              {
                text:
                  `✅ *Media Berhasil Disimpan*\\n\\n` +
                  `✨ *Nama:* ${mediaRecord.file_name}\\n` +
                  `✨ *Tipe:* ${mediaRecord.file_type}\\n` +
                  `✨ *Status:* Tersimpan di Cloud (Supabase)\\n` +
                  `🔐 *URL:* ${mediaRecord.public_url}`,
              },
              { quoted: msg },
            );
          }
        } else {
          await socket.sendMessage(
            remoteJid,
            {
              text: `✨ *Penyimpanan Media Dinonaktifkan*\\n\\nFitur simpan media ke cloud belum diaktifkan. Aktifkan di dashboard Features.`,
            },
            { quoted: msg },
          );
        }
      } else if (controls.media_confirm_before_save) {
        console.log(
          `✨ [AI-Bot][${displayName}] Media detected WITHOUT intent. Caching for confirmation.`,
        );
        this.pendingMedia.set(remoteJid, msg);
        await socket.sendMessage(
          remoteJid,
          {
            text: `✨ *Media Terdeteksi*\n\nbro lu ngirim ${messageType.replace("Message", "")} mau disimpan gak?`,
          },
          { quoted: msg },
        );
        return; // Wait for confirmation
      } else {
        console.log(
          `✨ [AI-Bot][${displayName}] Media detected WITHOUT intent. Confirmation disabled, skipping cache.`,
        );
      }
    } else if (isConfirming) {
      console.log(
        `✨ [AI-Bot][${displayName}] User confirmed media storage. Processing cached media...`,
      );
      const cachedMsg = this.pendingMedia.get(remoteJid);
      const mediaService = require("../whatsapp/media.service");
      mediaRecord = await mediaService.processIncomingMedia(cachedMsg, userId);

      if (mediaRecord) {
        await socket.sendMessage(
          remoteJid,
          {
            text:
              `✅ *Media Berhasil Disimpan*\n\n` +
              `✨ *Nama:* ${mediaRecord.file_name}\n` +
              `✨ *Tipe:* ${mediaRecord.file_type}\n` +
              `✨ *Status:* Tersimpan di Cloud (Supabase)\n` +
              `🔐— *URL:* ${mediaRecord.public_url}`,
          },
          { quoted: msg },
        );
      }
      this.pendingMedia.delete(remoteJid);
      return;
    } else if (isRejecting) {
      console.log(
        `ðŸ›‘ [AI-Bot][${displayName}] User rejected media storage. Clearing cache.`,
      );
      this.pendingMedia.delete(remoteJid);
      await socket.sendMessage(
        remoteJid,
        { text: "Oke bro, media gak bakal gue simpan. ðŸ‘Œ" },
        { quoted: msg },
      );
      return;
    }

    if (!messageText && !isMedia) return;

    // NEW: Check for AI enabled and delay
    if (!controls.is_ai_enabled) {
      console.log(`🔐‡ [AI-Bot][${displayName}] AI is DISABLED for this user.`);
      logService.warn(
        userId,
        sessionId,
        `AI processing is DISABLED in settings. Ignoring message.`,
      );
      return;
    }

    // ── TOKEN ENFORCEMENT (skip for moderators) ──
    if (userId && UUID_REGEX.test(userId)) {
      const isModerator = await moderatorGuard.isModerator(userId);
      if (isModerator) {
        console.log(
          `🛡️ [AI-Bot][${displayName}] Moderator role detected. Bypassing token/subscription check.`,
        );
      } else {
        const subscription = await paymentService.getActiveSubscription(userId);
        if (!subscription) {
          console.log(
            `💳 [AI-Bot][${displayName}] No active subscription. Blocking.`,
          );
          logService.error(
            userId,
            sessionId,
            `No active subscription found. Blocked AI response.`,
          );
          await socket.sendMessage(remoteJid, {
            text: "⚠️ Langganan Anda tidak aktif. Silakan berlangganan di dashboard WA-BOT-AI untuk menggunakan fitur AI.",
          });
          return;
        }

        const hasTokens = await paymentService.hasEnoughTokens(userId, 10);
        if (!hasTokens) {
          console.log(
            `✨ [AI-Bot][${displayName}] Insufficient tokens. Blocking.`,
          );
          logService.error(
            userId,
            sessionId,
            `Insufficient tokens (Requires 10). Blocked AI response.`,
          );
          await socket.sendMessage(remoteJid, {
            text: "⚠️ Token Anda habis. Silakan top-up token di dashboard WA-BOT-AI.",
          });
          // Notify via CS-BOT
          const { data: user } = await supabase
            .from("users")
            .select("phone, full_name, username")
            .eq("id", userId)
            .single();
          if (user?.phone) {
            await notificationService.notifyTokenDepleted(
              user.phone,
              user.full_name || user.username || "User",
            );
          }
          return;
        }
      }
    }

    let pushName = msg.pushName || "User";
    if (isGroup) {
      try {
        const metadata = await socket.groupMetadata(remoteJid);
        pushName = metadata.subject || pushName;
      } catch (e) { }
    }
    const quotedMsg =
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    let fullMessageText = messageText;
    if (quotedMsg) {
      const contextText =
        quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || "";
      if (contextText)
        fullMessageText = `(Membalas pesan: "${contextText}") ` + messageText;
    }

    console.log(
      `🤖 [AI-Bot][${displayName}] Message from ${cleanSender}: "${fullMessageText}"`,
    );
    logService.info(
      userId,
      sessionId,
      `Received message from ${cleanSender}: "${fullMessageText.substring(0, 50)}..."`,
    );

    const isPacarZaky = cleanSender.includes("6288293473765");
    let systemPrompt = await configService.getSystemPrompt(userId);

    // --- NEW: INJECT AI CAPABILITIES KNOWLEDGE ---
    if (controls.media_receive_enabled) {
      systemPrompt +=
        "\n\nKEMAMPUAN MEDIA: Kamu bisa melihat dan menganalisis media yang dikirim user.";
      systemPrompt +=
        "\n- Jika user mengirim foto di chat sebelumnya, kamu akan melihat log [Media image: url] di history.";
    }
    if (controls.media_send_enabled) {
      systemPrompt +=
        "\n\nKEMAMPUAN KIRIM MEDIA (VITAL): Kamu BISA mengirim balik media ke user.";
      systemPrompt +=
        "\n- Jika user minta kirim foto, gunakan format: [SEND_IMAGE: url_dari_history].";
      systemPrompt +=
        "\n- Format: [SEND_IMAGE: url] untuk gambar, [SEND_VIDEO: url] untuk video, [SEND_AUDIO: url] untuk audio.";
      systemPrompt +=
        "\nJangan pernah bilang kamu tidak punya foto jika URL-nya ada di history.";
    }

    if (isPacarZaky && !userId) {
      // Special logic only for global bot
      systemPrompt +=
        " Khusus untuk orang ini, dia adalah pacar Zaky. Kamu harus ekstra ramah, sangat baik, dan perhatian.";
    }

    // --- Item #?: REMOVE AI MODERATOR PERSONA ---
    // Moderators now use the Pure System Bot (ModeratorBot.service) 
    // to ensure Zero Token Cost and deterministic behavior.
    // Standard AI flow is only for regular user interactions.
    const ownerName = session?.displayName || "Bang Zaky";

    const rawHistory = controls.history_enabled
      ? await historyService.getHistory(remoteJid, userId)
      : [];
    const maxMsgs = controls.history_max_messages || 50; // Increased default from 10 to 50
    const history = rawHistory.slice(-maxMsgs);
    const formattedHistory = historyService.formatForPrompt(history);

    console.log(`📜 [AI-Bot][${displayName}] History found: ${rawHistory.length} msgs. Sending: ${history.length} msgs to context. (Limit: ${maxMsgs})`);

    // --- NEW: INJECT MEDIA INFO INTO PROMPT ---
    let promptWithMedia = fullMessageText;
    if (mediaRecord) {
      promptWithMedia =
        `[User sent a ${mediaRecord.file_type}: ${mediaRecord.public_url}] ` +
        (fullMessageText || "Please analyze this file.");
    }

    await socket.sendPresenceUpdate("composing", remoteJid);
    const startTime = Date.now();
    await configService.incrementStat("requests", userId);

    try {
      const activeKeyConfig = await configService.getGeminiApiKey(userId);
      console.log(
        `🤖 [AI-Bot][${displayName}] Using API Key model: ${activeKeyConfig.model} (Custom: ${!!activeKeyConfig.key && activeKeyConfig.key !== process.env.GEMINI_API_KEY})`,
      );
      logService.system(
        userId,
        sessionId,
        `Invoking LLM Model: ${activeKeyConfig.model}`,
      );

      const aiResponse = await geminiService.generateResponse(
        promptWithMedia,
        formattedHistory,
        systemPrompt,
        {
          apiKey: activeKeyConfig.key,
          modelName: activeKeyConfig.config?.model || activeKeyConfig.model,
          apiVersion:
            activeKeyConfig.config?.version || activeKeyConfig.version,
          media:
            mediaRecord && mediaRecord.buffer
              ? {
                buffer: mediaRecord.buffer,
                mimetype: mediaRecord.mimetype,
              }
              : null,
        },
      );
      const latency = Date.now() - startTime;
      logService.success(
        userId,
        sessionId,
        `AI Response generated in ${latency}ms`,
      );

      // --- NEW: AI MEDIA RESPONSE PARSING ---
      const { cleanResponse, imageUrl, videoUrl, audioUrl } =
        parseMediaTags(aiResponse);

      // NEW: Implement response delay
      if (controls.response_delay_mins > 0) {
        const delayMs = controls.response_delay_mins * 60 * 1000;
        console.log(
          `â±ï¸ [AI-Bot][${displayName}] Delaying response for ${controls.response_delay_mins} mins...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      // Send textual response if not empty
      if (cleanResponse) {
        await socket.sendMessage(remoteJid, { text: cleanResponse });
      }

      const axios = require("axios");

      async function fetchMediaBuffer(url) {
        try {
          const response = await axios.get(url, {
            responseType: "arraybuffer",
          });
          return Buffer.from(response.data, "binary");
        } catch (error) {
          console.error(
            `âŒ [AI-Bot][${displayName}] Failed to fetch media from URL: ${url}`,
            error.message,
          );
          return null;
        }
      }

      // Send actual media if parsed
      if (imageUrl) {
        console.log(
          `ðŸ“¤ [AI-Bot][${displayName}] AI sending IMAGE: ${imageUrl}`,
        );
        const buffer = await fetchMediaBuffer(imageUrl);
        if (buffer) {
          await socket.sendMessage(remoteJid, {
            image: buffer,
            caption: "Ini kak fotonya... ðŸ˜‰",
          });
        } else {
          await socket.sendMessage(remoteJid, {
            text: `*(Gagal mengirim gambar. Link: ${imageUrl})*`,
          });
        }
      } else if (videoUrl) {
        console.log(
          `ðŸ“¤ [AI-Bot][${displayName}] AI sending VIDEO: ${videoUrl}`,
        );
        const buffer = await fetchMediaBuffer(videoUrl);
        if (buffer) {
          await socket.sendMessage(remoteJid, { video: buffer });
        } else {
          await socket.sendMessage(remoteJid, {
            text: `*(Gagal mengirim video. Link: ${videoUrl})*`,
          });
        }
      } else if (audioUrl) {
        console.log(
          `ðŸ“¤ [AI-Bot][${displayName}] AI sending AUDIO: ${audioUrl}`,
        );
        const buffer = await fetchMediaBuffer(audioUrl);
        if (buffer) {
          await socket.sendMessage(remoteJid, {
            audio: buffer,
            mimetype: "audio/mp4",
            ptt: true,
          });
        } else {
          await socket.sendMessage(remoteJid, {
            text: `*(Gagal mengirim audio. Link: ${audioUrl})*`,
          });
        }
      }

      await configService.incrementStat("responses", userId);

      const isOwnerModerator_Deduct = await moderatorGuard.getUserRoleById(userId) === 'moderator';
      
      // ── DEDUCT TOKENS (skip for moderators) ──
      if (userId && UUID_REGEX.test(userId) && !isOwnerModerator_Deduct) {
        const deductResult = await paymentService.deductTokens(
          userId,
          10,
          "ai_response",
          remoteJid,
        );
        if (deductResult.success) {
          console.log(
            `ðŸŽ« [AI-Bot][${displayName}] Deducted 10 tokens. Remaining: ${deductResult.balance}`,
          );
          logService.system(
            userId,
            sessionId,
            `Deducted 10 tokens. Remaining balance: ${deductResult.balance}`,
          );
          // Item #8: Only warn at milestone 100 exactly
          if (
            deductResult.balance > 0 &&
            deductResult.balance <= 100 &&
            deductResult.balance + 10 > 100
          ) {
            const { data: user } = await supabase
              .from("users")
              .select("phone, full_name, username")
              .eq("id", userId)
              .single();
            if (user?.phone) {
              await notificationService.notifyTokenLow(
                user.phone,
                user.full_name || user.username || "User",
                deductResult.balance,
              );
            }
          }
        }
      }

      // Save to history (including media if any)
      if (controls.history_enabled) {
        await historyService.saveMessage(
          remoteJid,
          pushName,
          {
            role: "user",
            content:
              fullMessageText || `[Sent ${mediaRecord?.file_type || "Media"}]`,
            mediaUrl: mediaRecord?.public_url,
            mediaType: mediaRecord?.file_type,
          },
          userId,
        );
        await historyService.saveMessage(
          remoteJid,
          "AI Assistant",
          { role: "model", content: aiResponse, latency },
          userId,
        );
      }
    } catch (error) {
      console.error(`âŒ [AI-Bot][${displayName}] Error:`, error.message);
      logService.error(
        userId,
        sessionId,
        `AI Generation failed: ${error.message}`,
      );

      // If API Key error, maybe notify user or fallback gracefully
      if (
        error.message.includes("API_KEY_INVALID") ||
        error.message.includes("403")
      ) {
        await socket.sendMessage(remoteJid, {
          text: "Maaf, sepertinya ada masalah dengan konfigurasi AI saya. Mohon hubungi pemilik bot.",
        });
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
      nudgePrompt: PROACTIVE_NUDGE_PROMPT,
    });
  }
  async processNormalMessage(sessionId, socket, msg) {
    // This bypasses the trigger/isGroup/moderator checks at the top of handleIncomingMessage
    // used as a fallback for moderator bot when no command is found
    return await this.handleIncomingMessage(sessionId, socket, msg, true);
  }
}

module.exports = new AIBotService();
