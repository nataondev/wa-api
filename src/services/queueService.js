const Queue = require("better-queue");
const logger = require("../utils/logger");

class QueueService {
  constructor() {
    this.queues = new Map();
    this.processing = new Map();
    this.defaultConfig = {
      batchSize: 5,
      batchDelay: 1000, // 1 detik delay antar batch
      maxRetries: 3,
      retryDelay: 2000, // 2 detik delay antar retry
      maxTimeout: 30000, // 30 detik timeout
    };
  }

  // Membuat atau mendapatkan queue untuk session tertentu
  getQueue(sessionId) {
    if (!this.queues.has(sessionId)) {
      const queue = new Queue(this.processMessage.bind(this), {
        ...this.defaultConfig,
        afterProcessDelay: this.defaultConfig.batchDelay,
        batchSize: this.defaultConfig.batchSize,
        maxRetries: this.defaultConfig.maxRetries,
        retryDelay: this.defaultConfig.retryDelay,
        maxTimeout: this.defaultConfig.maxTimeout,
      });

      // Event handlers
      queue.on("error", (error, task) => {
        logger.error({
          msg: `Queue error for session ${sessionId}`,
          sessionId,
          error: error.message,
          task,
        });
      });

      queue.on("retry", (error, task) => {
        logger.warn({
          msg: `Retrying task for session ${sessionId}`,
          sessionId,
          error: error.message,
          task,
        });
      });

      queue.on("drain", () => {
        logger.info({
          msg: `Queue drained for session ${sessionId}`,
          sessionId,
        });
      });

      this.queues.set(sessionId, queue);
    }
    return this.queues.get(sessionId);
  }

  // Menambahkan pesan ke antrian
  async addToQueue(sessionId, task) {
    const queue = this.getQueue(sessionId);
    return new Promise((resolve, reject) => {
      queue.push(task, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }

  // Memproses pesan dari antrian
  async processMessage(task, cb) {
    const { sessionId, chatId, message, type = "text" } = task;

    try {
      // Cek apakah sedang memproses untuk session ini
      if (this.processing.get(sessionId)) {
        // Tunggu sebentar jika sedang memproses
        await new Promise((resolve) =>
          setTimeout(resolve, this.defaultConfig.batchDelay)
        );
        return this.processMessage(task, cb);
      }

      this.processing.set(sessionId, true);

      // Implementasi pengiriman pesan sesuai tipe
      let result;
      switch (type) {
        case "text":
          result = await this.sendTextMessage(sessionId, chatId, message);
          break;
        case "media":
          result = await this.sendMediaMessage(sessionId, chatId, message);
          break;
        default:
          throw new Error(`Unsupported message type: ${type}`);
      }

      this.processing.delete(sessionId);
      cb(null, result);
    } catch (error) {
      this.processing.delete(sessionId);
      cb(error);
    }
  }

  // Mengirim pesan teks
  async sendTextMessage(sessionId, chatId, message) {
    const { sendMessage } = require("./whatsappService");
    return await sendMessage(sessionId, chatId, message);
  }

  // Mengirim pesan media
  async sendMediaMessage(sessionId, chatId, message) {
    const { sendMediaMessage } = require("./whatsappService");
    return await sendMediaMessage(sessionId, chatId, message);
  }

  // Membersihkan queue untuk session tertentu
  clearQueue(sessionId) {
    const queue = this.queues.get(sessionId);
    if (queue) {
      queue.destroy();
      this.queues.delete(sessionId);
      this.processing.delete(sessionId);
    }
  }

  // Membersihkan semua queue
  clearAllQueues() {
    for (const sessionId of this.queues.keys()) {
      this.clearQueue(sessionId);
    }
  }

  // Mendapatkan status queue
  getQueueStatus(sessionId) {
    const queue = this.queues.get(sessionId);
    if (!queue) {
      return {
        exists: false,
        size: 0,
        processing: false,
      };
    }

    return {
      exists: true,
      size: queue.length,
      processing: this.processing.get(sessionId) || false,
    };
  }
}

module.exports = new QueueService();
