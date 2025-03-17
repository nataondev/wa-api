/**
 * Queue Service untuk menangani antrian pesan WhatsApp
 * Menggunakan better-queue untuk implementasi yang sederhana
 */

const Queue = require("better-queue");
const logger = require("../utils/logger");

// Menyimpan instance dari semua queue dalam objek
const queues = {};

/**
 * Fungsi pemrosesan pesan dalam queue
 * @param {Object} task - Tugas/pesan yang akan diproses
 * @param {Function} cb - Callback function setelah tugas selesai
 */
function processMessage(task, cb) {
  const { sessionId, chatId, message, type } = task;

  logger.info({
    msg: `Memproses pesan dalam queue`,
    sessionId,
    chatId,
    type,
  });

  try {
    // Mendapatkan client session WhatsApp
    const whatsappService = require("./whatsappService");
    const client = whatsappService.getSession(sessionId);

    if (!client) {
      const error = new Error(`Session ${sessionId} tidak ditemukan`);
      logger.error({
        msg: "Session tidak ditemukan saat memproses pesan",
        sessionId,
        error: error.message,
      });
      return cb(error);
    }

    // Mengirim pesan berdasarkan tipe
    client
      .sendMessage(chatId, message)
      .then((result) => {
        logger.info({
          msg: `Pesan berhasil dikirim`,
          sessionId,
          chatId,
          messageId: result?.key?.id || null,
        });

        // Tambahkan informasi tambahan ke result untuk konsistensi format
        const enhancedResult = {
          ...result,
          sender: sessionId,
          receiver: chatId,
          // Jika message adalah objek dengan property text, gunakan itu
          // Jika tidak, gunakan message langsung
          message:
            message.text ||
            (typeof message === "string" ? message : JSON.stringify(message)),
        };

        cb(null, enhancedResult);
      })
      .catch((error) => {
        logger.error({
          msg: `Gagal mengirim pesan`,
          sessionId,
          chatId,
          error: error.message,
        });
        cb(error);
      });
  } catch (error) {
    logger.error({
      msg: `Error saat memproses pesan`,
      error: error.message,
      stack: error.stack,
    });
    cb(error);
  }
}

/**
 * Membuat queue baru untuk session jika belum ada
 * @param {string} sessionId - ID session WhatsApp
 * @returns {Object} Queue instance untuk session
 */
function getOrCreateQueue(sessionId) {
  if (!queues[sessionId]) {
    logger.info({
      msg: `Membuat queue baru untuk session`,
      sessionId,
    });

    queues[sessionId] = new Queue(processMessage, {
      concurrent: 3, // Hanya memproses 1 pesan dalam satu waktu
      maxRetries: 3, // Maksimal 3x percobaan jika gagal
      retryDelay: 1000, // Tunggu 1 detik sebelum mencoba lagi
      afterProcessDelay: 1000, // Delay 1 detik setelah setiap pesan (mencegah rate limit)
    });

    // Event handlers untuk monitoring queue
    queues[sessionId].on("task_finish", (taskId, result) => {
      logger.info({
        msg: `Tugas selesai`,
        sessionId,
        taskId,
        status: "success",
      });
    });

    queues[sessionId].on("task_failed", (taskId, error) => {
      logger.error({
        msg: `Tugas gagal`,
        sessionId,
        taskId,
        error: error.message,
      });
    });
  }

  return queues[sessionId];
}

/**
 * Menambahkan pesan ke dalam queue
 * @param {string} sessionId - ID session WhatsApp
 * @param {Object} task - Tugas yang akan ditambahkan ke queue
 * @returns {Promise} Promise dengan hasil penambahan ke queue
 */
function addToQueue(sessionId, task) {
  return new Promise((resolve, reject) => {
    try {
      const queue = getOrCreateQueue(sessionId);

      queue.push(task, (error, result) => {
        if (error) {
          logger.error({
            msg: `Error saat menjalankan tugas dalam queue`,
            sessionId,
            error: error.message,
          });
          return reject(error);
        }
        resolve(result);
      });
    } catch (error) {
      logger.error({
        msg: `Gagal menambahkan ke queue`,
        sessionId,
        error: error.message,
      });
      reject(error);
    }
  });
}

/**
 * Menghapus semua queue yang ada
 * Berguna saat melakukan shutdown aplikasi
 */
function clearAllQueues() {
  logger.info({
    msg: "Menghapus semua queue",
    queueCount: Object.keys(queues).length,
  });

  for (const sessionId in queues) {
    try {
      queues[sessionId].destroy();
      logger.info({
        msg: `Queue untuk session berhasil dihapus`,
        sessionId,
      });
    } catch (error) {
      logger.error({
        msg: `Gagal menghapus queue untuk session`,
        sessionId,
        error: error.message,
      });
    }
  }

  // Reset queues object
  Object.keys(queues).forEach((key) => delete queues[key]);
}

/**
 * Mengecek status queue untuk session tertentu
 * @param {string} sessionId - ID session WhatsApp
 * @returns {Object} Informasi status queue
 */
function getQueueStatus(sessionId) {
  if (!queues[sessionId]) {
    return { exists: false, length: 0, running: false };
  }

  return {
    exists: true,
    length: queues[sessionId].length || 0,
    running: queues[sessionId].running || false,
  };
}

module.exports = {
  addToQueue,
  clearAllQueues,
  getQueueStatus,
};
