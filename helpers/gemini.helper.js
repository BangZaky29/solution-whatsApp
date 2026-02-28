const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Google Gemini AI Helper
 * Handles communication with Google Generative AI API
 */
class GeminiHelper {
    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            console.error('❌ [Gemini Error]: GEMINI_API_KEY is missing in .env');
        }

        this.genAI = new GoogleGenerativeAI(apiKey);

        // STABLE CONFIG: Menggunakan gemini-1.5-flash dengan v1beta untuk fitur gratis yang stabil
        this.model = this.genAI.getGenerativeModel(
            { model: "gemini-2.5-flash" },
            { apiVersion: 'v1beta' }
        );

        this.systemPrompt = process.env.AI_BOT_SYSTEM_PROMPT || "Anda adalah asisten AI ramah.";
    }

    /**
     * Generate response from Gemini
     * @param {string} userMessage - Message from customer
     * @param {string} history - Optional conversation history
     * @param {string} customPrompt - Optional custom system prompt
     * @param {string} apiKey - Optional API key (overrides process.env)
     * @returns {Promise<string>} - AI generated response
     */
    async generateResponse(userMessage, history = "", customPrompt = null, apiKey = null) {
        const finalApiKey = apiKey || process.env.GEMINI_API_KEY;

        if (!finalApiKey) {
            return "Maaf kak, sistem AI belum dikonfigurasi (API Key kosong).";
        }

        try {
            // Create a temporary model instance if a specific key is provided or if we want to ensure freshness
            const client = new GoogleGenerativeAI(finalApiKey);
            const model = client.getGenerativeModel(
                { model: "gemini-1.5-flash" },
                { apiVersion: 'v1beta' }
            );

            const finalSystemPrompt = customPrompt || this.systemPrompt;

            const promptParts = [
                `System: ${finalSystemPrompt}`,
                `User: ${userMessage}`,
                `Response:`
            ];

            if (history) {
                promptParts.splice(1, 0, `History: ${history}`);
            }

            const finalPrompt = promptParts.join('\n\n');

            const result = await model.generateContent(finalPrompt);
            const response = await result.response;
            const text = response.text();

            if (!text) {
                throw new Error("Empty response from Gemini API");
            }

            return text.trim();
        } catch (error) {
            console.error('❌ [Gemini Error Details]:', error.message);

            // Handle specific errors
            if (error.message.includes('404')) {
                return "Sorry bro Gue lagi capek Nnnti lagi chattanye yak..";
            } else if (error.message.includes('429')) {
                return "Sorry bro Gue lagi capek Nnnti lagi chattanye yak, besok lagi aja kita chattannya..";
            } else if (error.message.includes('API_KEY_INVALID') || error.message.includes('API key not found')) {
                return "Waduh, API Key Gemini kayaknya salah atau udah mati nih. Cek dashboard ya!";
            }

            return "Sorry bro Gue bingung lu ngomong apa, coba ulang..";
        }
    }
}

module.exports = new GeminiHelper();
