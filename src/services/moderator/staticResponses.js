/**
 * Static Responses for Moderator System Bot
 * Purpose: Provide AI-free, zero-token cost responses for moderators.
 */

const GREETINGS = [
    "Halo Bos! System Bot siap melayani. Ada yang bisa saya bantu?",
    "Selamat datang di Panel Kontrol, Bos. Apa instruksi selanjutnya?",
    "System Online. Menunggu perintah dari moderator...",
];

const CAPABILITIES_LIST = `🛡️ *PANDUAN SISTEM MODERATOR*

Saya adalah **System Bot** (Non-AI). Berikut daftar lengkap perintah yang bisa saya lakukan:

💰 *TOKEN & PAKET*
• \`tambah token user [ID] [jumlah]\`
• \`reset token user [ID] jadi [jumlah]\`
• \`kosongkan token user [ID]\` (Set saldo ke 0)
• \`aktifkan paket [premium/pro/basic] user [ID]\`

📸 *MEDIA & DATA*
• \`tampilkan foto user [ID]\` (Kirim file media terbaru)
• \`hapus media user [ID]\` (Hapus dari cloud storage)
• \`info user [ID]\` (Lihat profil, sisa token, & paket)
• \`daftar user\` (Lihat 20 user terbaru sistem)

⚙️ *KONTROL BOT*
• \`matikan bot user [ID]\`
• \`aktifkan bot user [ID]\`
• \`blokir kontak [nomor_kontak] dari [ID_user]\`

💡 *TIPS CEPAT*
- Lu bisa ngetik santai (tanpa "!"): _"reset bangzaky"_
- [ID] bisa berupa **Username** atau **Nomor WA**.
- Media dikirim sebagai *file asli* (bukan link).`;

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
        if (lower.includes('kemampuan') || lower.includes('fitur') || lower.includes('bisanya apa') || lower.includes('bisa apa')) return CAPABILITIES_LIST;
        if (lower.includes('perintah') || lower.includes('command') || lower.includes('list command')) return CAPABILITIES_LIST;
        if (lower === 'help' || lower === 'bantuan' || lower.includes('tuliskan bantuan')) return CAPABILITIES_LIST;

        // 2. GREETINGS
        if (lower.match(/^(halo|hi|hey|p|oi|bro|bot|halo bot|pagi|siang|malam|assalam|salam)/)) {
            return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
        }

        // 3. SYSTEM STATUS
        if (lower.includes('status') || lower.includes('sehat') || lower.includes('cek sistem') || lower.includes('kondisi')) {
            return "✅ *Status Sistem:* NORMAL\n📡 *Node Status:* Connected\n🛡️ *Moderator Interceptor:* Active\n🤖 *AI Engine:* Ready (Standby)";
        }

        // 4. MEDIA / DATA PENDING HINTS
        if ((lower.includes('kirim') || lower.includes('mana')) && (lower.includes('foto') || lower.includes('media'))) {
            return "📸 *Instruksi Diterima:*\nSaya akan mencari media terbaru di storage. Jika tersedia, akan segera saya kirimkan ke chat ini.\n\n_Pastikan formatnya benar: !tampilkan foto user [username]_";
        }
        
        if (lower.includes('paket') || lower.includes('billing') || lower.includes('langganan')) {
            return "📦 *Informasi Paket:*\nKetik *!info user [username]* untuk melihat sisa token dan paket aktif user tersebut.";
        }

        // 4. FALLBACK DEFAULT
        return `⚠️ *Instruksi Tidak Jelas*\n\nSaya tidak memahami instruksi Anda. Gunakan perintah spesifik atau ketik *help* untuk melihat daftar kemampuan.`;
    },

    getHelpMenu: () => CAPABILITIES_LIST
};

module.exports = staticResponses;
