const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Gemini Service
 * Handles communication with Google Generative AI API
 */
class GeminiService {
    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.systemPrompt = process.env.AI_BOT_SYSTEM_PROMPT || "Anda adalah asisten AI ramah.";
    }

    async generateResponse(userMessage, history = "", customPrompt = null, options = {}) {
        // 1. Ambil API Key dari options (hasil query DB)
        const finalApiKey = options.apiKey;

        if (!finalApiKey) {
            return "Maaf kak, API Key tidak ditemukan di database. Tolong aktifkan dulu di dashboard.";
        }

        try {
            const client = new GoogleGenerativeAI(finalApiKey);
            // Pastikan model name valid (gemini-1.5-flash atau gemini-1.5-pro)
            const modelName = options.modelName || "gemini-2.5-flash";
            const model = client.getGenerativeModel({ model: modelName });

            const finalSystemPrompt = customPrompt || "Anda adalah asisten AI ramah.";

            // â”€â”€ MULTIMODAL SUPPORT â”€â”€
            const parts = [
                { text: `Instruction: ${finalSystemPrompt}` },
                { text: history ? `Context History: ${history}` : "" },
                { text: `User Message: ${userMessage}` }
            ];

            // If media is provided (Vision), add it as a part
            if (options.media && options.media.buffer && options.media.mimetype) {
                console.log(`ðŸ“¸ [Gemini] Attaching multimodal part: ${options.media.mimetype}`);
                parts.push({
                    inlineData: {
                        mimeType: options.media.mimetype,
                        data: options.media.buffer.toString('base64')
                    }
                });
            }

            // Format Gemini SDK Terbaru (Content-based)
            const result = await model.generateContent({
                contents: [
                    {
                        role: 'user',
                        parts: parts
                    }
                ]
            });

            const response = await result.response;
            const text = response.text();

            return text ? text.trim() : "AI terdiam... coba lagi bro.";

        } catch (error) {
            console.error('âŒ [Gemini Error]:', error.message);
            // Error handling tetap sama...
            return "Aduh, AI-nya lagi pusing. Coba cek API Key atau kuota ya.";
        }
    }
}

module.exports = new GeminiService();
