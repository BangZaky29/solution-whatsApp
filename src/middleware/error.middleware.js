const { logger } = require('../config/logger');

/**
 * Global Error Handler Middleware
 */
const errorHandler = (err, req, res, next) => {
    logger.error(err);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
};

/**
 * 404 Handler Middleware
 */
const notFoundHandler = (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
};

module.exports = {
    errorHandler,
    notFoundHandler
};
