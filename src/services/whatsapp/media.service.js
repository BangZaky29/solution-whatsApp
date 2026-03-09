const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const supabase = require('../../config/supabase');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

/**
 * Media Service
 * Handles downloading media from WhatsApp, uploading to Supabase, 
 * and managing file metadata.
 */
class MediaService {
    constructor() {
        this.bucketName = 'whatsapp-media';
    }

    /**
     * Process an incoming media message
     * @param {object} msg - Baileys message object
     * @param {string} userId - ID of the user owning the session
     * @returns {object|null} - Uploaded media details
     */
    async processIncomingMedia(msg, userId) {
        try {
            const messageType = Object.keys(msg.message)[0];
            const mediaType = this._getMediaType(messageType);

            if (!mediaType) return null;

            console.log(`📥 [MediaService] Downloading ${mediaType} from WhatsApp...`);

            // 1. Download buffer from Baileys
            const buffer = await downloadMediaMessage(
                msg,
                'buffer',
                {},
                {
                    logger: console,
                    reuploadRequest: async (m) => { console.log('Re-upload requested', m); return m; }
                }
            );

            if (!buffer) {
                throw new Error('Failed to download media buffer');
            }

            // 2. Prepare file info
            const extension = this._getExtension(mediaType, msg.message[messageType]?.mimetype);
            const fileName = `${crypto.randomUUID()}${extension}`;
            const filePath = `${userId || 'system'}/${mediaType}/${fileName}`;

            // 3. Upload to Supabase Storage
            console.log(`📤 [MediaService] Uploading to Supabase: ${filePath}...`);
            const { data, error } = await supabase.storage
                .from(this.bucketName)
                .upload(filePath, buffer, {
                    contentType: msg.message[messageType]?.mimetype || 'application/octet-stream',
                    cacheControl: '3600',
                    upsert: false
                });

            if (error) {
                // If bucket doesn't exist, we might need to handle it or assume user created it
                throw error;
            }

            // 4. Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from(this.bucketName)
                .getPublicUrl(filePath);

            // 5. Store in DB (public.wa_media)
            const mediaRecord = {
                user_id: userId,
                jid: msg.key.remoteJid,
                message_id: msg.key.id,
                file_name: fileName,
                file_type: mediaType,
                bucket_path: filePath,
                public_url: publicUrl
            };

            const { error: dbError } = await supabase
                .from('wa_media')
                .insert(mediaRecord);

            if (dbError) {
                console.warn('⚠️ [MediaService] Failed to save media record to DB:', dbError.message);
            }

            console.log(`✅ [MediaService] Media processed: ${publicUrl}`);
            return {
                ...mediaRecord,
                buffer,
                mimetype: msg.message[messageType]?.mimetype
            };

        } catch (error) {
            console.error('❌ [MediaService] Process error:', error.message);
            return null;
        }
    }

    /**
     * Helper to get media type from message object key
     */
    _getMediaType(type) {
        if (type === 'imageMessage') return 'image';
        if (type === 'videoMessage') return 'video';
        if (type === 'audioMessage') return 'audio';
        if (type === 'documentMessage') return 'document';
        return null;
    }

    /**
     * Helper to get extension
     */
    _getExtension(type, mimetype) {
        if (type === 'image') return '.jpg';
        if (type === 'video') return '.mp4';
        if (type === 'audio') return mimetype?.includes('ogg') ? '.ogg' : '.mp3';
        if (type === 'document') return ''; // BAileys usually gives filename
        return '';
    }
}

module.exports = new MediaService();
