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
     * @returns {Promise<string>} - AI generated response
     */
    async generateResponse(userMessage, history = "", customPrompt = null) {
        if (!process.env.GEMINI_API_KEY) {
            return "Maaf kak, sistem AI belum dikonfigurasi (API Key kosong).";
        }

        try {
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

            const result = await this.model.generateContent(finalPrompt);
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
            }

            return "Sorry bro Gue bingung lu ngomong apa, coba ulang..";
        }
    }
}

module.exports = new GeminiHelper();
