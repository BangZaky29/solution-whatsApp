function buildTokenLowMessage(userName, balance) {
    return [
        `⚠️ *PERINGATAN: TOKEN HAMPIR HABIS*`,
        ``,
        `Halo ${userName},`,
        `Sisa token Anda tinggal *${balance} token*.`,
        ``,
        `Segera lakukan top-up agar bot AI tetap aktif.`,
        `Buka dashboard → Billing → Top-up Token`,
    ].join('\n');
}

function buildTokenDepletedMessage(userName) {
    return [
        `🚫 *TOKEN HABIS*`,
        ``,
        `Halo ${userName},`,
        `Token Anda telah habis. Bot AI tidak dapat membalas pesan.`,
        ``,
        `Silakan top-up token melalui dashboard.`,
    ].join('\n');
}

function buildSubscriptionExpiredMessage(userName, packageName) {
    return [
        `⏰ *LANGGANAN BERAKHIR*`,
        ``,
        `Halo ${userName},`,
        `Paket *${packageName}* Anda telah berakhir.`,
        ``,
        `Bot AI Anda sekarang dalam mode non-aktif.`,
        `Perpanjang langganan di dashboard → Billing.`,
    ].join('\n');
}

function buildSubscriptionExpiringSoonMessage(userName, packageName, daysLeft) {
    return [
        `📢 *LANGGANAN SEGERA BERAKHIR*`,
        ``,
        `Halo ${userName},`,
        `Paket *${packageName}* Anda akan berakhir dalam *${daysLeft} hari*.`,
        ``,
        `Perpanjang segera agar layanan bot tidak terputus.`,
        `Buka dashboard → Billing → Perpanjang Paket`,
    ].join('\n');
}

module.exports = {
    buildTokenLowMessage,
    buildTokenDepletedMessage,
    buildSubscriptionExpiredMessage,
    buildSubscriptionExpiringSoonMessage
};