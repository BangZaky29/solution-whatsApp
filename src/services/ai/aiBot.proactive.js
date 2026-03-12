async function checkAndSendProactiveMessage({
    sessionId,
    socket,
    UUID_REGEX,
    configService,
    paymentService,
    historyService,
    geminiService,
    systemPromptSuffix,
    nudgePrompt
}) {
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
                console.log(`ðŸ›‘ [AI-Bot][${displayName}] Nudge limit reached (3). Stopping.`);
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
                        console.log(`ðŸŽ« [AI-Bot][${displayName}] Insufficient tokens for nudge. Stopping.`);
                        break;
                    }

                    console.log(`ðŸ¤– [AI-Bot][${displayName}] Sending proactive nudge to ${chat.jid}...`);

                    const systemPrompt = await configService.getSystemPrompt(userId) + systemPromptSuffix;

                    const formattedHistory = historyService.formatForPrompt(history);
                    const activeKeyConfig = await configService.getGeminiApiKey(userId);

                    // Only if we have an API Key
                    if (!activeKeyConfig.key) continue;

                    const aiResponse = await geminiService.generateResponse(
                        nudgePrompt,
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
        console.error(`âŒ [AI-Bot][Proactive] Error for ${sessionId}:`, error.message);
    }
}

module.exports = {
    checkAndSendProactiveMessage
};
