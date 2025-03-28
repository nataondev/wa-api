const Queue = require('bull');
const redisClient = require('./redis');
const logger = require('./logger');

// Store all queues in an object for easy access
const queues = {};

// Default queue options
const defaultQueueOptions = {
  redis: redisClient,
  defaultJobOptions: {
    attempts: parseInt(process.env.QUEUE_MAX_RETRIES || '3', 10),
    backoff: {
      type: 'exponential',
      delay: parseInt(process.env.QUEUE_RETRY_DELAY || '2000', 10),
    },
    removeOnComplete: true,
    removeOnFail: 100, // Keep last 100 failed jobs for inspection
    timeout: parseInt(process.env.QUEUE_TIMEOUT || '30000', 10),
  },
  limiter: {
    max: parseInt(process.env.QUEUE_BATCH_SIZE || '5', 10),
    duration: parseInt(process.env.QUEUE_BATCH_DELAY || '1000', 10),
  }
};

/**
 * Creates a new queue for a session if it doesn't exist
 * @param {string} sessionId - WhatsApp session ID
 * @param {Function} processor - Function to process jobs
 * @returns {Object} Queue instance
 */
function getOrCreateQueue(sessionId, processor) {
  if (!queues[sessionId]) {
    logger.info({
      msg: 'Creating new queue for session',
      sessionId,
    });

    // Create queue
    queues[sessionId] = new Queue(`whatsapp-${sessionId}`, defaultQueueOptions);

    // Set up event handlers
    queues[sessionId].on('completed', (job, result) => {
      logger.info({
        msg: 'Job completed successfully',
        sessionId,
        jobId: job.id,
        data: {
          sender: result?.sender,
          receiver: result?.receiver,
          messageId: result?.key?.id || null,
        }
      });
    });

    queues[sessionId].on('failed', (job, error) => {
      logger.error({
        msg: 'Job failed',
        sessionId,
        jobId: job.id,
        attempts: job.attemptsMade,
        error: error.message,
      });
    });

    queues[sessionId].on('stalled', (jobId) => {
      logger.warn({
        msg: 'Job stalled',
        sessionId,
        jobId,
      });
    });

    // Set processor if provided
    if (processor && typeof processor === 'function') {
      queues[sessionId].process(processor);
    }
  }

  return queues[sessionId];
}

/**
 * Add a job to the queue
 * @param {string} sessionId - WhatsApp session ID
 * @param {Object} jobData - Data to be processed
 * @param {Object} options - Bull job options
 * @returns {Promise<Object>} Result of the job
 */
async function addToQueue(sessionId, jobData, options = {}) {
  try {
    // Make sure queue exists
    const queue = getOrCreateQueue(sessionId);

    // Add job to queue
    const job = await queue.add(jobData, {
      ...defaultQueueOptions.defaultJobOptions,
      ...options,
    });

    logger.info({
      msg: 'Job added to queue',
      sessionId,
      jobId: job.id,
      jobData: {
        chatId: jobData.chatId,
        type: jobData.type,
      },
    });

    // Return a promise that resolves when the job is completed
    return new Promise((resolve, reject) => {
      queue.on('global:completed', (jobId, result) => {
        if (jobId === job.id.toString()) {
          resolve(JSON.parse(result));
        }
      });

      queue.on('global:failed', (jobId, err) => {
        if (jobId === job.id.toString()) {
          reject(err);
        }
      });
    });
  } catch (error) {
    logger.error({
      msg: 'Failed to add job to queue',
      sessionId,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Clear a specific session queue
 * @param {string} sessionId - WhatsApp session ID
 * @returns {Promise<boolean>} Success status
 */
async function clearSessionQueue(sessionId) {
  if (!queues[sessionId]) {
    logger.info({
      msg: 'No queue exists for session',
      sessionId,
    });
    return false;
  }

  try {
    // Empty the queue
    await queues[sessionId].empty();
    // Close the queue
    await queues[sessionId].close();
    // Remove from cache
    delete queues[sessionId];

    logger.info({
      msg: 'Queue cleared and closed successfully',
      sessionId,
    });
    return true;
  } catch (error) {
    logger.error({
      msg: 'Failed to clear queue',
      sessionId,
      error: error.message,
      stack: error.stack,
    });
    return false;
  }
}

/**
 * Clear all active queues
 * @returns {Promise<void>}
 */
async function clearAllQueues() {
  const sessionIds = Object.keys(queues);
  
  logger.info({
    msg: 'Clearing all queues',
    count: sessionIds.length,
  });

  for (const sessionId of sessionIds) {
    try {
      await queues[sessionId].empty();
      await queues[sessionId].close();
      delete queues[sessionId];
      
      logger.info({
        msg: 'Queue cleared and closed successfully',
        sessionId,
      });
    } catch (error) {
      logger.error({
        msg: 'Failed to clear queue',
        sessionId,
        error: error.message,
      });
    }
  }
}

/**
 * Get queue status
 * @param {string} sessionId - WhatsApp session ID
 * @returns {Promise<Object>} Queue status
 */
async function getQueueStatus(sessionId) {
  if (!queues[sessionId]) {
    return { exists: false, count: 0, waiting: 0, active: 0, failed: 0 };
  }

  try {
    const [waiting, active, completed, failed] = await Promise.all([
      queues[sessionId].getWaitingCount(),
      queues[sessionId].getActiveCount(),
      queues[sessionId].getCompletedCount(),
      queues[sessionId].getFailedCount(),
    ]);

    return {
      exists: true,
      waiting,
      active,
      completed,
      failed,
      isRunning: active > 0,
      totalCount: waiting + active,
    };
  } catch (error) {
    logger.error({
      msg: 'Failed to get queue status',
      sessionId,
      error: error.message,
    });
    
    return { 
      exists: true, 
      error: error.message,
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      isRunning: false,
      totalCount: 0
    };
  }
}

module.exports = {
  getOrCreateQueue,
  addToQueue,
  clearSessionQueue,
  clearAllQueues,
  getQueueStatus,
};
