function buildTrialExpiringMessage(userName) {
    return [
        `⏳ *TRIAL HAMPIR BERAKHIR*`,
        ``,
        `Halo ${userName},`,
        `Trial gratis 3 hari Anda akan segera berakhir.`,
        ``,
        `Berlangganan sekarang untuk terus menggunakan WA-BOT-AI:`,
        `🟢 Basic — Rp 49.000/bln`,
        `🔵 Premium — Rp 99.000/bln`,
        `🟣 Pro — Rp 199.000/bln`,
        ``,
        `Buka dashboard → Billing untuk berlangganan.`,
    ].join('\n');
}

module.exports = {
    buildTrialExpiringMessage
};