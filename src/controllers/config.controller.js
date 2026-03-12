const { getStats } = require('./config/stats.controller');
const {
    getPrompts,
    upsertPrompt,
    activatePrompt,
    updatePrompt,
    deletePrompt
} = require('./config/prompts.controller');
const {
    getContacts,
    addContact,
    updateContact,
    deleteContact,
    updateTargetMode
} = require('./config/contacts.controller');
const { getHistory, deleteHistory } = require('./config/history.controller');
const { getSystemPrompt, updateSystemPrompt } = require('./config/systemPrompt.controller');
const {
    getKeys,
    addKey,
    updateKey,
    deleteKey,
    activateKey
} = require('./config/keys.controller');
const { getAIControls, updateAIControls } = require('./config/aiControls.controller');
const {
    getBlockedAttempts,
    whitelistBlockedAttempt,
    deleteBlockedAttempt
} = require('./config/blocked.controller');
const { requestWipeOtp, wipeAccountData } = require('./config/account.controller');

module.exports = {
    getStats,
    getPrompts,
    upsertPrompt,
    activatePrompt,
    updatePrompt,
    deletePrompt,
    getContacts,
    addContact,
    updateContact,
    deleteContact,
    updateTargetMode,
    getHistory,
    deleteHistory,
    getSystemPrompt,
    updateSystemPrompt,
    getKeys,
    addKey,
    updateKey,
    deleteKey,
    activateKey,
    getAIControls,
    updateAIControls,
    getBlockedAttempts,
    whitelistBlockedAttempt,
    deleteBlockedAttempt,
    requestWipeOtp,
    wipeAccountData
};
