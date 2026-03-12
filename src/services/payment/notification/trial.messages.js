function buildTrialExpiringMessage(userName) {
    return [
        `â³ *TRIAL HAMPIR BERAKHIR*`,
        ``,
        `Halo ${userName},`,
        `Trial gratis 3 hari Anda akan segera berakhir.`,
        ``,
        `Berlangganan sekarang untuk terus menggunakan WA-BOT-AI:`,
        `ðŸŸ¢ Basic â€” Rp 49.000/bln`,
        `ðŸ”µ Premium â€” Rp 99.000/bln`,
        `ðŸŸ£ Pro â€” Rp 199.000/bln`,
        ``,
        `Buka dashboard â†’ Billing untuk berlangganan.`,
    ].join('\n');
}

module.exports = {
    buildTrialExpiringMessage
};
