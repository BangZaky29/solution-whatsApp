/**
 * Static Responses for Moderator System Bot
 * Purpose: Provide AI-free, zero-token cost responses for moderators.
 */

const CAPABILITIES_LIST = `🛡️ *KEMAMPUAN SISTEM MODERATOR*

Saya adalah *System Bot* murni (Non-AI). Berikut yang bisa saya lakukan:

💰 *TOKEN & PAKET*
• !tambah token user [ID/Phone] [jumlah]
• !reset token user [ID/Phone]
• !aktifkan paket [basic/standard/premium] user [ID/Phone]

📸 *MEDIA & DATA*
• !tampilkan foto user [ID/Phone]
• !hapus media user [ID/Phone]
• !info user [ID/Phone] (Lihat profil detail)

⚙️ *KONTROL*
• !matikan bot user [ID/Phone]
• !aktifkan bot user [ID/Phone]
• !blokir kontak [nomor]

💡 *TIPS*
- Ketik perintah dengan awalan "!" atau bahasa natural.
- Jika tidak menggunakan "!", saya tetap akan mencoba mendeteksi maksud Anda.`;

const GREETINGS = [
    "Halo Bos! System Bot siap melayani. Ada yang bisa saya bantu?",
    "Selamat datang di Panel Kontrol, Bos. Apa instruksi selanjutnya?",
    "System Online. Menunggu perintah dari moderator...",
];

const staticResponses = {
    /**
     * Get a static response based on user input keywords
     * @param {string} text 
     * @returns {string|null}
     */
    getResponse: (text) => {
        const lower = text.toLowerCase();

        // 1. HELP / CAPABILITIES
        if (lower.includes('apa') && lower.includes('bisa') && lower.includes('lakukan')) return CAPABILITIES_LIST;
        if (lower.includes('kemampuan') || lower.includes('fitur') || lower.includes('bisanya apa')) return CAPABILITIES_LIST;
        if (lower === 'help' || lower === 'bantuan') return CAPABILITIES_LIST;

        // 2. GREETINGS
        if (lower.match(/^(halo|hi|hey|p|oi|bro|halo bot)/)) {
            return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
        }

        // 3. SYSTEM STATUS
        if (lower.includes('status') || lower.includes('sehat')) {
            return "✅ *Status Sistem:* NORMAL\n📡 *Node Status:* Connected\n🛡️ *Moderator Interceptor:* Active\n🤖 *AI Engine:* Ready (Standby)";
        }

        // 4. FALLBACK DEFAULT
        return `⚠️ *Instruksi Tidak Jelas*\n\nSaya tidak memahami instruksi Anda. Gunakan perintah spesifik atau ketik *help* untuk melihat daftar kemampuan.\n\n${CAPABILITIES_LIST}`;
    },

    getHelpMenu: () => CAPABILITIES_LIST
};

module.exports = staticResponses;
