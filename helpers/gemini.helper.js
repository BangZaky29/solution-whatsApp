const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Gemini AI Helper
 * Handles communication with Google Gemini API
 */
class GeminiHelper {
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        this.systemPrompt = process.env.AI_BOT_SYSTEM_PROMPT || "Anda adalah asisten AI ramah.";
    }

    /**
     * Generate response from Gemini
     * @param {string} userMessage - Message from customer
     * @param {string} history - Optional conversation history
     * @returns {Promise<string>} - AI generated response
     */
    async generateResponse(userMessage, history = "") {
        try {
            const prompt = `
                SYSTEM PROMPT: ${this.systemPrompt}
                
                CONVERSATION HISTORY:
                ${history}
                
                USER MESSAGE: ${userMessage}
                
                RESPONSE:
            `;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            return response.text().trim();
        } catch (error) {
            console.error('❌ [Gemini] Error generating content:', error.message);
            return "Maaf, sistem AI kami sedang mengalami kendala teknis. Mohon coba lagi beberapa saat lagi.";
        }
    }
}

module.exports = new GeminiHelper();
