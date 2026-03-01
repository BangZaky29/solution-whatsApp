const pino = require('pino');

const logger = pino({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
});

const baileysLogger = pino({ level: 'silent' });

module.exports = {
    logger,
    baileysLogger
};
