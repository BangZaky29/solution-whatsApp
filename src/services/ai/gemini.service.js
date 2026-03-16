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
            const modelName = options.modelName || "gemini-1.5-flash"; // Default to 1.5-flash if 2.5/invalid
            
            const finalSystemPrompt = customPrompt || "Anda adalah asisten AI ramah.";

            // 1. Use dedicated systemInstruction for better focus
            const model = client.getGenerativeModel({ 
                model: modelName,
                systemInstruction: finalSystemPrompt
            });

            // 2. Build multi-turn contents array
            let contents = [];

            if (Array.isArray(history)) {
                // If history is passed as raw array from DB
                history.forEach(h => {
                    contents.push({
                        role: h.role === 'model' ? 'model' : 'user',
                        parts: [{ text: h.content }]
                    });
                });
            } else if (typeof history === 'string' && history.trim()) {
                // Fallback for string-based history
                contents.push({
                    role: 'user',
                    parts: [{ text: `Previous conversation summary/history:\n${history}` }]
                });
                contents.push({
                    role: 'model',
                    parts: [{ text: "I understand the context. How can I help you further?" }]
                });
            }

            // 3. Add current message
            const currentParts = [{ text: userMessage }];
            
            // If media is provided (Vision), add it as a part
            if (options.media && options.media.buffer && options.media.mimetype) {
                console.log(`📸 [Gemini] Attaching multimodal part: ${options.media.mimetype}`);
                currentParts.push({
                    inlineData: {
                        mimeType: options.media.mimetype,
                        data: options.media.buffer.toString('base64')
                    }
                });
            }

            contents.push({
                role: 'user',
                parts: currentParts
            });

            // 4. Generate content with proper roles
            const result = await model.generateContent({ contents });
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
