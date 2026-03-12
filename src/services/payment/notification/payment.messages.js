function buildPaymentPendingMessage(userName, packageName, orderId) {
    return [
        `💳 *PEMBAYARAN MENUNGGU*`,
        ``,
        `Halo ${userName},`,
        `Pesanan Anda sedang menunggu pembayaran.`,
        ``,
        `📦 Paket: *${packageName}*`,
        `🆔 Order ID: \`${orderId}\``,
        ``,
        `Silakan selesaikan pembayaran Anda segera.`,
        `Terima kasih! 🙏`,
    ].join('\n');
}

function buildPaymentSuccessMessage(userName, packageName, tokenAmount, expiresAt) {
    const expDate = new Date(expiresAt).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric'
    });

    return [
        `✅ *PEMBAYARAN BERHASIL!*`,
        ``,
        `Halo ${userName},`,
        `Pembayaran Anda telah berhasil diproses.`,
        ``,
        `📦 Paket: *${packageName}*`,
        `🎫 Token: *${tokenAmount.toLocaleString()} token*`,
        `📅 Berlaku hingga: *${expDate}*`,
        ``,
        `Selamat menggunakan WA-BOT-AI! 🤖✨`,
    ].join('\n');
}

function buildPaymentFailedMessage(userName, packageName) {
    return [
        `❌ *PEMBAYARAN GAGAL*`,
        ``,
        `Halo ${userName},`,
        `Pembayaran untuk paket *${packageName}* gagal atau dibatalkan.`,
        ``,
        `Silakan coba lagi melalui dashboard.`,
        `Jika ada kendala, hubungi admin.`,
    ].join('\n');
}

module.exports = {
    buildPaymentPendingMessage,
    buildPaymentSuccessMessage,
    buildPaymentFailedMessage
};