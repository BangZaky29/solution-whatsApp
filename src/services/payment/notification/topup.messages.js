function buildTopupSuccessMessage(userName, tokenAmount, newBalance) {
    return [
        `✅ *TOP-UP TOKEN BERHASIL!*`,
        ``,
        `Halo ${userName},`,
        `Top-up token Anda telah berhasil.`,
        ``,
        `ðŸŽ« Token ditambahkan: *+${tokenAmount.toLocaleString()}*`,
        `ðŸ’° Saldo saat ini: *${newBalance.toLocaleString()} token*`,
        ``,
        `Terima kasih! ðŸ™`,
    ].join('\n');
}

module.exports = {
    buildTopupSuccessMessage
};
