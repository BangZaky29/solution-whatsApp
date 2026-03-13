const { GoogleGenerativeAI } = require('@google/generative-ai');
const configService = require('../common/config.service');

/**
 * Command Parser
 * Uses Gemini AI to parse natural language moderator commands
 * into structured action objects. Supports Indonesian and English.
 */

const MODERATOR_PARSE_PROMPT = `Kamu adalah parser perintah moderator untuk sistem WA-BOT-AI.
Tugasmu adalah mengubah perintah natural language menjadi structured JSON.

PENTING:
- Hanya output JSON, tanpa markdown code block, tanpa penjelasan
- Support Bahasa Indonesia dan English
- Jika perintah tidak jelas, action = "unknown"

Daftar action yang valid:
1. "delete_media" - Hapus media user (foto/video/audio dari cloud)
2. "activate_package" - Aktifkan paket premium untuk user
3. "add_tokens" - Tambah token ke user
4. "reset_tokens" - Reset/set ulang token balance user
5. "get_user_info" - Lihat info user (tanpa data sensitif)
6. "block_contact" - Blokir kontak dari bot user
7. "list_users" - Tampilkan daftar user
8. "deactivate_bot" - Nonaktifkan bot milik user
9. "activate_bot" - Aktifkan bot milik user
10. "delete_account" - TERLARANG: hapus akun user
11. "change_password" - TERLARANG: ubah password user
12. "change_role" - TERLARANG: ubah role user
13. "view_sensitive" - TERLARANG: lihat password/OTP
14. "bulk_delete" - TERLARANG: hapus data massal tanpa target
15. "bypass_payment" - TERLARANG: bypass payment
16. "unknown" - Perintah tidak dikenali

Format output JSON:
{
  "action": "string (salah satu dari daftar di atas)",
  "target": {
    "phone": "string atau null (nomor telepon target)",
    "username": "string atau null (username target)",
    "name": "string atau null (nama target)"
  },
  "params": {
    "packageName": "string atau null",
    "tokenAmount": "number atau null",
    "contactPhone": "string atau null",
    "mediaType": "string atau null (all/image/video/audio)",
    "reason": "string atau null"
  },
  "isDestructive": "boolean (true jika data bisa hilang permanen)",
  "rawIntent": "string (ringkasan singkat apa yang diminta)"
}

Contoh:
Input: "hapus semua media dari user bangzaky0029"
Output: {"action":"delete_media","target":{"phone":null,"username":"bangzaky0029","name":null},"params":{"mediaType":"all"},"isDestructive":true,"rawIntent":"Hapus semua media user bangzaky0029"}

Input: "hapus semua media foto nya saja dari user bangzaky0029"
Output: {"action":"delete_media","target":{"phone":null,"username":"bangzaky0029","name":null},"params":{"mediaType":"image"},"isDestructive":true,"rawIntent":"Hapus media FOTO user bangzaky0029"}

Input: "aktifkan paket premium starter untuk 628988761937"
Output: {"action":"activate_package","target":{"phone":"628988761937","username":null,"name":null},"params":{"packageName":"starter"},"isDestructive":false,"rawIntent":"Aktifkan paket starter untuk user 628988761937"}

Input: "tambah 500 token untuk user bangzaky0029"
Output: {"action":"add_tokens","target":{"phone":null,"username":"bangzaky0029","name":null},"params":{"tokenAmount":500},"isDestructive":false,"rawIntent":"Tambah 500 token ke user bangzaky0029"}

Input: "hapus akun user bangzaky0029"
Output: {"action":"delete_account","target":{"phone":null,"username":"bangzaky0029","name":null},"params":{},"isDestructive":true,"rawIntent":"Hapus akun user bangzaky0029"}

Input: "tampilkan foto user bangzaky0029"
Output: {"action":"view_media","target":{"phone":null,"username":"bangzaky0029","name":null},"params":{"mediaType":"image"},"isDestructive":false,"rawIntent":"Tampilkan foto user bangzaky0029"}`;

/**
 * Parse a natural language command using Gemini AI
 * @param {string} text - raw command text from moderator
 * @returns {Promise<object>} parsed command object
 */
async function parseCommand(text) {
    try {
        // Get API key from system config (use first available)
        const activeKeyConfig = await configService.getGeminiApiKey(null);
        const apiKey = activeKeyConfig?.key || process.env.GEMINI_API_KEY;

        if (!apiKey) {
            console.error('❌ [CommandParser] No API key available');
            return _fallbackParse(text);
        }

        const client = new GoogleGenerativeAI(apiKey);
        const model = client.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const result = await model.generateContent({
            contents: [{
                role: 'user',
                parts: [
                    { text: MODERATOR_PARSE_PROMPT },
                    { text: `Perintah moderator: "${text}"` }
                ]
            }]
        });

        const response = await result.response;
        let responseText = response.text().trim();

        // Strip markdown code block if present
        responseText = responseText
            .replace(/```json\s*/gi, '')
            .replace(/```\s*/g, '')
            .trim();

        const parsed = JSON.parse(responseText);

        console.log(`🔍 [CommandParser] Parsed: ${parsed.action} → ${parsed.rawIntent}`);
        return parsed;

    } catch (error) {
        console.error('❌ [CommandParser] AI parse failed:', error.message);
        return _fallbackParse(text);
    }
}

/**
 * Basic regex fallback parser when AI is unavailable
 */
function _fallbackParse(text) {
    const lower = text.toLowerCase();

    let action = 'unknown';
    const target = { phone: null, username: null, name: null };
    const params = {};
    let isDestructive = false;

    // Detect action
    if (lower.includes('hapus') && lower.includes('media')) {
        action = 'delete_media';
        isDestructive = true;
        params.mediaType = 'all';
    } else if (lower.includes('hapus') && lower.includes('akun')) {
        action = 'delete_account';
        isDestructive = true;
    } else if (lower.includes('aktifkan') && lower.includes('paket')) {
        action = 'activate_package';
    } else if (lower.includes('tambah') && lower.includes('token')) {
        action = 'add_tokens';
        const numMatch = text.match(/(\d+)/);
        if (numMatch) params.tokenAmount = parseInt(numMatch[1]);
    } else if ((lower.includes('reset') || lower.includes('atur ulang')) && lower.includes('token')) {
        action = 'reset_tokens';
        const numMatch = text.match(/(\d+)/);
        if (numMatch) params.tokenAmount = parseInt(numMatch[1]);
    } else if (lower.includes('lihat') || lower.includes('tampilkan') || lower.includes('kirim')) {
        if (lower.includes('foto') || lower.includes('media') || lower.includes('video')) {
            action = 'view_media';
            params.mediaType = lower.includes('video') ? 'video' : 'image';
        } else if (lower.includes('info') || lower.includes('data')) {
            action = 'get_user_info';
        }
    } else if (lower.includes('info') || lower.includes('statistik') || lower.includes('detail')) {
        action = 'get_user_info';
    } else if (lower.includes('blokir')) {
        action = 'block_contact';
    } else if (lower.includes('daftar') && lower.includes('user')) {
        action = 'list_users';
    } else if (lower.includes('nonaktifkan') && lower.includes('bot')) {
        action = 'deactivate_bot';
    } else if (lower.includes('aktifkan') && lower.includes('bot')) {
        action = 'activate_bot';
    }

    // Extract phone number
    const phoneMatch = text.match(/(?:62|0)\d{9,13}/);
    if (phoneMatch) target.phone = phoneMatch[0];

    // Extract username (after "user" keyword)
    const userMatch = text.match(/user\s+([a-zA-Z0-9_.-]+)/i);
    if (userMatch && !userMatch[1].match(/^\d+$/)) {
        target.username = userMatch[1];
    }

    return {
        action,
        target,
        params,
        isDestructive,
        rawIntent: text.substring(0, 100)
    };
}

module.exports = { parseCommand, parseCommandStatic: _fallbackParse };
