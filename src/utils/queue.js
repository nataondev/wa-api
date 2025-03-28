const Queue = require("bull");
const redisClient = require("./redis");
const logger = require("./logger");
// Store all queues in an object for easy access
const queues = {};

// Default queue options
const defaultQueueOptions = {
  redis: redisClient,
  defaultJobOptions: {
    attempts: parseInt(process.env.QUEUE_MAX_RETRIES || "2", 10),
    backoff: {
      type: "exponential",
      delay: parseInt(process.env.QUEUE_RETRY_DELAY || "2000", 10),
    },
    removeOnComplete: true,
    removeOnFail: 50, // Keep last 50 failed jobs for inspection
    timeout: parseInt(process.env.QUEUE_TIMEOUT || "20000", 10),
  },
  limiter: {
    max: parseInt(process.env.QUEUE_BATCH_SIZE || "3", 10),
    duration: parseInt(process.env.QUEUE_BATCH_DELAY || "2000", 10),
  },
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
      msg: "Creating new queue for session",
      sessionId,
    });

    // Create queue
    queues[sessionId] = new Queue(`whatsapp-${sessionId}`, defaultQueueOptions);

    // Increase max listeners to handle multiple concurrent jobs
    queues[sessionId].setMaxListeners(50);

    // Set up event handlers
    queues[sessionId].on("completed", (job, result) => {
      logger.info({
        msg: "Job completed successfully",
        sessionId,
        jobId: job.id,
        data: {
          sender: result?.sender,
          receiver: result?.receiver,
          messageId: result?.key?.id || null,
        },
      });
    });

    queues[sessionId].on("failed", (job, error) => {
      logger.error({
        msg: "Job failed",
        sessionId,
        jobId: job.id,
        attempts: job.attemptsMade,
        error: error.message,
      });
    });

    queues[sessionId].on("stalled", (jobId) => {
      logger.warn({
        msg: "Job stalled",
        sessionId,
        jobId,
      });
    });

    // Set processor if provided
    if (processor && typeof processor === "function") {
      queues[sessionId].process(processor);
    }

    // Tambahkan di queue.js
    queues[sessionId].on("active", (job) => {
      logger.info({
        msg: "Memory Usage",
        usage: process.memoryUsage(),
        activeJobs: queues[sessionId].getActiveCount(),
      });
    });
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

    // Optimize job data to reduce Redis memory usage
    const optimizedJobData = {
      sessionId: jobData.sessionId,
      chatId: jobData.chatId,
      type: jobData.type,
      // Only store text content for text messages
      message:
        typeof jobData.message === "string"
          ? jobData.message
          : jobData.message?.text || JSON.stringify(jobData.message),
    };

    // Add job to queue with tracking info
    const job = await queue.add(optimizedJobData, {
      ...defaultQueueOptions.defaultJobOptions,
      ...options,
      timestamp: Date.now(),
      trackStatus: true,
    });

    // Get initial queue status
    const queueStatus = await getQueueStatus(sessionId);

    logger.info({
      msg: "Job added to queue",
      sessionId,
      jobId: job.id,
      queueStatus,
      jobData: {
        chatId: optimizedJobData.chatId,
        type: optimizedJobData.type,
        messagePreview:
          optimizedJobData.message.substring(0, 50) +
          (optimizedJobData.message.length > 50 ? "..." : ""),
      },
    });

    // Return a promise that resolves with enhanced job info
    return new Promise((resolve, reject) => {
      const completedListener = async (jobId, result) => {
        if (jobId === job.id.toString()) {
          queue.removeListener("global:completed", completedListener);
          queue.removeListener("global:failed", failedListener);

          // Get final queue status
          const finalQueueStatus = await getQueueStatus(sessionId);

          // Enhance result with queue info
          const enhancedResult = {
            success: true,
            jobId: job.id,
            queueInfo: {
              addedAt: job.timestamp,
              processedAt: Date.now(),
              queueStatus: finalQueueStatus,
            },
            result: JSON.parse(result),
          };

          resolve(enhancedResult);
        }
      };

      const failedListener = async (jobId, err) => {
        if (jobId === job.id.toString()) {
          queue.removeListener("global:completed", completedListener);
          queue.removeListener("global:failed", failedListener);

          // Get queue status on failure
          const failureQueueStatus = await getQueueStatus(sessionId);

          // Enhance error with queue info
          const enhancedError = {
            success: false,
            jobId: job.id,
            queueInfo: {
              addedAt: job.timestamp,
              failedAt: Date.now(),
              queueStatus: failureQueueStatus,
            },
            error: err.message,
          };

          reject(enhancedError);
        }
      };

      queue.on("global:completed", completedListener);
      queue.on("global:failed", failedListener);
    });
  } catch (error) {
    logger.error({
      msg: "Failed to add job to queue",
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
      msg: "No queue exists for session",
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
      msg: "Queue cleared and closed successfully",
      sessionId,
    });
    return true;
  } catch (error) {
    logger.error({
      msg: "Failed to clear queue",
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
    msg: "Clearing all queues",
    count: sessionIds.length,
  });

  for (const sessionId of sessionIds) {
    try {
      await queues[sessionId].empty();
      await queues[sessionId].close();
      delete queues[sessionId];

      logger.info({
        msg: "Queue cleared and closed successfully",
        sessionId,
      });
    } catch (error) {
      logger.error({
        msg: "Failed to clear queue",
        sessionId,
        error: error.message,
      });
    }
  }
}

/**
 * Get queue status with enhanced metrics
 * @param {string} sessionId - WhatsApp session ID
 * @returns {Promise<Object>} Enhanced queue status
 */
async function getQueueStatus(sessionId) {
  if (!queues[sessionId]) {
    return {
      exists: false,
      metrics: {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      },
      performance: {
        avgProcessingTime: 0,
        throughput: 0,
      },
    };
  }

  try {
    const queue = queues[sessionId];
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    // Calculate basic metrics
    const totalProcessed = completed + failed;
    const avgProcessingTime = await calculateAverageProcessingTime(queue);
    const throughput = await calculateThroughput(queue);

    return {
      exists: true,
      metrics: {
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + delayed,
      },
      performance: {
        avgProcessingTime,
        throughput,
        successRate:
          totalProcessed > 0 ? (completed / totalProcessed) * 100 : 100,
      },
      status: active > 0 ? "processing" : waiting > 0 ? "pending" : "idle",
    };
  } catch (error) {
    logger.error({
      msg: "Failed to get queue status",
      sessionId,
      error: error.message,
    });

    return {
      exists: true,
      error: error.message,
      metrics: {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      },
      performance: {
        avgProcessingTime: 0,
        throughput: 0,
        successRate: 0,
      },
      status: "error",
    };
  }
}

/**
 * Calculate average processing time for completed jobs
 * @param {Object} queue - Bull queue instance
 * @returns {Promise<number>} Average processing time in ms
 */
async function calculateAverageProcessingTime(queue) {
  try {
    const jobs = await queue.getCompleted(0, 10); // Get last 10 completed jobs
    if (jobs.length === 0) return 0;

    const processingTimes = jobs.map((job) => {
      const finished = job.finishedOn || Date.now();
      const started = job.processedOn || job.timestamp;
      return finished - started;
    });

    return Math.round(processingTimes.reduce((a, b) => a + b, 0) / jobs.length);
  } catch (error) {
    logger.warn({
      msg: "Failed to calculate average processing time",
      error: error.message,
    });
    return 0;
  }
}

/**
 * Calculate queue throughput (jobs/minute)
 * @param {Object} queue - Bull queue instance
 * @returns {Promise<number>} Jobs per minute
 */
async function calculateThroughput(queue) {
  try {
    const jobs = await queue.getCompleted(0, 60); // Get up to last 60 completed jobs
    if (jobs.length < 2) return 0;

    const newest = jobs[0].finishedOn;
    const oldest = jobs[jobs.length - 1].finishedOn;
    const minutes = (newest - oldest) / 1000 / 60;

    return minutes > 0 ? Math.round(jobs.length / minutes) : 0;
  } catch (error) {
    logger.warn({
      msg: "Failed to calculate throughput",
      error: error.message,
    });
    return 0;
  }
}

module.exports = {
  getOrCreateQueue,
  addToQueue,
  clearSessionQueue,
  clearAllQueues,
  getQueueStatus,
};
