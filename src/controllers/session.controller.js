const { initSession, logout } = require('./session/lifecycle.controller');
const { getStatus, getQrCode, getInfo, getPairingCode } = require('./session/status.controller');
const { getEnrichedInstances } = require('./session/instances.controller');

module.exports = {
    initSession,
    getStatus,
    getQrCode,
    logout,
    getInfo,
    getPairingCode,
    getEnrichedInstances
};
