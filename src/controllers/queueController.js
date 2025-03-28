const queueService = require('../services/queueService');
const { sendResponse } = require('../utils/response');
const httpStatusCode = require('../constants/httpStatusCode');
const logger = require('../utils/logger');

/**
 * Get queue status for a session
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getQueueStatus = async (req, res) => {
  const { sessionId } = req.params;

  try {
    logger.info({
      msg: 'Getting queue status',
      sessionId,
    });

    const status = await queueService.getQueueStatus(sessionId);

    return sendResponse(
      res,
      httpStatusCode.OK,
      'Queue status retrieved successfully',
      status
    );
  } catch (error) {
    logger.error({
      msg: 'Error getting queue status',
      sessionId,
      error: error.message,
      stack: error.stack,
    });

    return sendResponse(
      res,
      httpStatusCode.INTERNAL_SERVER_ERROR,
      'Failed to get queue status',
      null,
      error
    );
  }
};

/**
 * Clear queue for a session
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const clearSessionQueue = async (req, res) => {
  const { sessionId } = req.params;

  try {
    logger.info({
      msg: 'Clearing queue for session',
      sessionId,
    });

    const result = await queueService.clearSessionQueue(sessionId);

    if (!result) {
      return sendResponse(
        res,
        httpStatusCode.NOT_FOUND,
        'No queue found for session or failed to clear',
        { success: false }
      );
    }

    return sendResponse(
      res,
      httpStatusCode.OK,
      'Queue cleared successfully',
      { success: true }
    );
  } catch (error) {
    logger.error({
      msg: 'Error clearing queue',
      sessionId,
      error: error.message,
      stack: error.stack,
    });

    return sendResponse(
      res,
      httpStatusCode.INTERNAL_SERVER_ERROR,
      'Failed to clear queue',
      null,
      error
    );
  }
};

module.exports = {
  getQueueStatus,
  clearSessionQueue,
}; 