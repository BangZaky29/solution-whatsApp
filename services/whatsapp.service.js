/**
 * ============================================
 * WhatsApp Service
 * ============================================
 * 
 * Business logic for WhatsApp operations
 * Handles message sending, status checks, and session management
 */

/**
 * Formats phone number to WhatsApp format
 * @param {string} number - Phone number (can be with or without country code)
 * @returns {string} - Formatted number with @s.whatsapp.net suffix
 */
function formatPhoneNumber(number) {
    // Remove all non-numeric characters
    let cleaned = number.replace(/\D/g, '');

    // If starts with 0, replace with 62 (Indonesia)
    if (cleaned.startsWith('0')) {
        cleaned = '62' + cleaned.substring(1);
    }

    // If doesn't start with country code, assume Indonesia
    if (!cleaned.startsWith('62') && cleaned.length <= 12) {
        cleaned = '62' + cleaned;
    }

    // Append WhatsApp suffix
    return `${cleaned}@s.whatsapp.net`;
}

/**
 * Validates phone number format
 * @param {string} number - Phone number to validate
 * @returns {{ valid: boolean, message?: string }}
 */
function validatePhoneNumber(number) {
    if (!number) {
        return { valid: false, message: 'Phone number is required' };
    }

    // Remove all non-numeric characters for validation
    const cleaned = number.replace(/\D/g, '');

    if (cleaned.length < 10) {
        return { valid: false, message: 'Phone number too short' };
    }

    if (cleaned.length > 15) {
        return { valid: false, message: 'Phone number too long' };
    }

    return { valid: true };
}

/**
 * Validates message content
 * @param {string} message - Message to validate
 * @returns {{ valid: boolean, message?: string }}
 */
function validateMessage(message) {
    if (!message) {
        return { valid: false, message: 'Message is required' };
    }

    if (typeof message !== 'string') {
        return { valid: false, message: 'Message must be a string' };
    }

    if (message.length > 4096) {
        return { valid: false, message: 'Message too long (max 4096 characters)' };
    }

    return { valid: true };
}

/**
 * Sends a text message via WhatsApp
 * @param {object} socket - Baileys socket instance
 * @param {string} number - Recipient phone number
 * @param {string} message - Message content
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
async function sendTextMessage(socket, number, message) {
    try {
        // Validate inputs
        const numberValidation = validatePhoneNumber(number);
        if (!numberValidation.valid) {
            return { success: false, error: numberValidation.message };
        }

        const messageValidation = validateMessage(message);
        if (!messageValidation.valid) {
            return { success: false, error: messageValidation.message };
        }

        // Format the number
        const jid = formatPhoneNumber(number);

        // Check if socket is connected
        if (!socket || !socket.user) {
            return { success: false, error: 'WhatsApp not connected' };
        }

        // Send the message
        const result = await socket.sendMessage(jid, { text: message });

        console.log(`📤 Message sent to ${number}:`, result.key.id);

        return {
            success: true,
            messageId: result.key.id,
            to: jid,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error sending message:', error);
        return {
            success: false,
            error: error.message || 'Failed to send message'
        };
    }
}

/**
 * Sends a media message via WhatsApp
 * @param {object} socket - Baileys socket instance
 * @param {string} number - Recipient phone number
 * @param {object} media - Media object { type, url, caption }
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
async function sendMediaMessage(socket, number, media) {
    try {
        const numberValidation = validatePhoneNumber(number);
        if (!numberValidation.valid) {
            return { success: false, error: numberValidation.message };
        }

        const jid = formatPhoneNumber(number);

        if (!socket || !socket.user) {
            return { success: false, error: 'WhatsApp not connected' };
        }

        let messageContent;

        switch (media.type) {
            case 'image':
                messageContent = {
                    image: { url: media.url },
                    caption: media.caption || ''
                };
                break;
            case 'video':
                messageContent = {
                    video: { url: media.url },
                    caption: media.caption || ''
                };
                break;
            case 'document':
                messageContent = {
                    document: { url: media.url },
                    fileName: media.fileName || 'document',
                    caption: media.caption || ''
                };
                break;
            case 'audio':
                messageContent = {
                    audio: { url: media.url },
                    ptt: media.ptt || false // Voice note if true
                };
                break;
            default:
                return { success: false, error: 'Invalid media type' };
        }

        const result = await socket.sendMessage(jid, messageContent);

        console.log(`📤 Media message sent to ${number}:`, result.key.id);

        return {
            success: true,
            messageId: result.key.id,
            to: jid,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error sending media message:', error);
        return {
            success: false,
            error: error.message || 'Failed to send media message'
        };
    }
}

/**
 * Gets connection status
 * @param {object} socket - Baileys socket instance
 * @param {object} connectionState - Current connection state
 * @returns {object} - Status object
 */
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
