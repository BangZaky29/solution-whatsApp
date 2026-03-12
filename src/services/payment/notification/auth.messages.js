function buildRegistrationMessage(userName) {
    return [
        `ðŸŽ‰ *SELAMAT DATANG DI WA-BOT-AI!*`,
        ``,
        `Halo ${userName},`,
        `Akun Anda berhasil didaftarkan.`,
        ``,
        `🚀 *NEW USER PROMO:*`,
        `Dapatkan diskon *80%* untuk semua paket pembelian pertama Anda! âœ¨`,
        ``,
        `Berlangganan sekarang di dashboard untuk mulai menggunakan fitur AI.`,
        ``,
        `Selamat mencoba! 🚀`,
    ].join('\n');
}

function buildLoginMessage(userName) {
    return [
        `🔐 *LOGIN BERHASIL*`,
        ``,
        `Halo ${userName},`,
        `Anda baru saja login ke WA-BOT-AI.`,
        ``,
        `Jika bukan Anda, segera hubungi admin.`,
    ].join('\n');
}

module.exports = {
    buildRegistrationMessage,
    buildLoginMessage
};
