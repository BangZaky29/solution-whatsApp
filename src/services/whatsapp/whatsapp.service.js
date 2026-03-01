function formatPhoneNumber(number) {
    if (number.includes('@')) return number;
    let cleaned = number.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '62' + cleaned.substring(1);
    if (!cleaned.startsWith('62') && cleaned.length <= 12) cleaned = '62' + cleaned;
    return `${cleaned}@s.whatsapp.net`;
}

function validatePhoneNumber(number) {
    if (!number) return { valid: false, message: 'Phone number is required' };
    const cleaned = number.replace(/\D/g, '');
    if (cleaned.length < 10) return { valid: false, message: 'Phone number too short' };
    if (cleaned.length > 15) return { valid: false, message: 'Phone number too long' };
    return { valid: true };
}

function validateMessage(message) {
    if (!message) return { valid: false, message: 'Message is required' };
    if (typeof message !== 'string') return { valid: false, message: 'Message must be a string' };
    if (message.length > 4096) return { valid: false, message: 'Message too long (max 4096 characters)' };
    return { valid: true };
}

async function sendTextMessage(socket, number, message) {
    try {
        const numVal = validatePhoneNumber(number);
        if (!numVal.valid) return { success: false, error: numVal.message };
        const msgVal = validateMessage(message);
        if (!msgVal.valid) return { success: false, error: msgVal.message };

        const jid = number.includes('@') ? number : formatPhoneNumber(number);
        if (!socket || !socket.user) return { success: false, error: 'WhatsApp not connected' };

        const result = await socket.sendMessage(jid, { text: message });
        return { success: true, messageId: result.key.id, to: jid, timestamp: new Date().toISOString() };
    } catch (error) {
        console.error('Error sending message:', error);
        return { success: false, error: error.message || 'Failed to send message' };
    }
}

async function sendMediaMessage(socket, number, media) {
    try {
        const numVal = validatePhoneNumber(number);
        if (!numVal.valid) return { success: false, error: numVal.message };
        const jid = formatPhoneNumber(number);
        if (!socket || !socket.user) return { success: false, error: 'WhatsApp not connected' };

        let content;
        switch (media.type) {
            case 'image': content = { image: { url: media.url }, caption: media.caption || '' }; break;
            case 'video': content = { video: { url: media.url }, caption: media.caption || '' }; break;
            case 'document': content = { document: { url: media.url }, fileName: media.fileName || 'document', caption: media.caption || '' }; break;
            case 'audio': content = { audio: { url: media.url }, ptt: media.ptt || false }; break;
            default: return { success: false, error: 'Invalid media type' };
        }
        const result = await socket.sendMessage(jid, content);
        return { success: true, messageId: result.key.id, to: jid, timestamp: new Date().toISOString() };
    } catch (error) {
        console.error('Error sending media message:', error);
        return { success: false, error: error.message || 'Failed to send media message' };
    }
}

function getConnectionStatus(socket, connectionState) {
    const { qr, connection, phoneNumber } = connectionState;
    return {
        status: connection || 'disconnected',
        isConnected: connection === 'open',
        phoneNumber: phoneNumber || null,
        hasQR: !!qr,
        qr: qr || null,
        user: socket?.user || null
    };
}

module.exports = {
    formatPhoneNumber,
    validatePhoneNumber,
    validateMessage,
    sendTextMessage,
    sendMediaMessage,
    getConnectionStatus
};
