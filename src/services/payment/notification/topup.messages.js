function buildTopupSuccessMessage(userName, tokenAmount, newBalance) {
    return [
        `✅ *TOP-UP TOKEN BERHASIL!*`,
        ``,
        `Halo ${userName},`,
        `Top-up token Anda telah berhasil.`,
        ``,
        `🎫 Token ditambahkan: *+${tokenAmount.toLocaleString()}*`,
        `💰 Saldo saat ini: *${newBalance.toLocaleString()} token*`,
        ``,
        `Terima kasih! 🙏`,
    ].join('\n');
}

module.exports = {
    buildTopupSuccessMessage
};