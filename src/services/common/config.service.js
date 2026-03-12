const settings = require('./config/settings.service');
const prompts = require('./config/prompts.service');
const contacts = require('./config/contacts.service');
const keys = require('./config/keys.service');
const sessions = require('./config/sessions.service');
const blocked = require('./config/blocked.service');
const user = require('./config/user.service');

/**
 * Config Service
 * Handles persistent configuration and global stats in Supabase
 */
class ConfigService {
    constructor() {
        // High-precision environment detection
        this.NODE_ENV = process.env.NODE_ENV;
        const useProductionDB = process.env.USE_PRODUCTION_DB === 'true';

        // Result: only use production tables if BOTH are set to production
        // This ensures local development stays safe by default.
        this.useProduction = (this.NODE_ENV === 'production' && useProductionDB);

        console.log(`\n[ConfigService] Mode: ${this.useProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
        console.log(`[ConfigService] NODE_ENV: ${this.NODE_ENV}`);
        console.log(`[ConfigService] USE_PRODUCTION_DB: ${useProductionDB}`);
        console.log(`[ConfigService] Target Session Table: ${this.getTableName('user_sessions')}\n`);

        // Dynamic Table Names (Only actual WA sessions are isolated)
        this.settingsTable = 'wa_bot_settings';
        this.promptsTable = 'wa_bot_prompts';
        this.contactsTable = 'wa_bot_contacts';
        this.apiKeysTable = 'wa_bot_api_keys';
        this.userSessionsTable = this.getTableName('user_sessions');
        this.blockedAttemptsTable = 'wa_bot_blocked_attempts';
        this.logsTable = 'wa_bot_logs';
        this.otpCodesTable = 'otp_codes';
        this.mediaTable = 'wa_media';
        this.historyTable = 'wa_chat_history';
    }

    /**
     * Get table name based on environment (Production vs Local)
     * @param {string} baseName
     * @returns {string}
     */
    getTableName(baseName) {
        // Only append _local if explicitly in development mode
        return this.useProduction ? baseName : `${baseName}_local`;
    }
}

Object.assign(
    ConfigService.prototype,
    settings,
    prompts,
    contacts,
    keys,
    sessions,
    blocked,
    user
);

module.exports = new ConfigService();
