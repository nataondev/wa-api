/**
 * Queue Service untuk menangani antrian pesan WhatsApp
 * Menggunakan Bull dan Redis untuk implementasi yang reliable
 */

const logger = require("../utils/logger");
const redisQueue = require("../utils/queue");

/**
 * Fungsi pemrosesan pesan dalam queue
 * @param {Object} job - Job yang akan diproses
 * @returns {Promise<Object>} - Hasil proses
 */
async function processMessage(job) {
  const { data: task } = job;
  const { sessionId, chatId, message, type } = task;

  logger.info({
    msg: `Memproses pesan dalam queue`,
    sessionId,
    chatId,
    type,
    jobId: job.id,
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
      throw error;
    }

    // Mengirim pesan berdasarkan tipe
    const result = await client.sendMessage(chatId, message);
    
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

    return enhancedResult;
  } catch (error) {
    logger.error({
      msg: `Error saat memproses pesan`,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Menambahkan pesan ke dalam queue
 * @param {string} sessionId - ID session WhatsApp
 * @param {Object} task - Tugas yang akan ditambahkan ke queue
 * @returns {Promise} Promise dengan hasil penambahan ke queue
 */
async function addToQueue(sessionId, task) {
  try {
    logger.info({
      msg: `Menambahkan pesan ke queue`,
      sessionId,
      chatId: task.chatId,
      type: task.type,
    });

    // Buat queue jika belum ada dengan processor function
    const queue = redisQueue.getOrCreateQueue(sessionId, processMessage);
    
    // Tambahkan task ke queue
    const result = await redisQueue.addToQueue(sessionId, task);
    
    logger.info({
      msg: `Pesan berhasil ditambahkan ke queue`,
      sessionId,
      chatId: task.chatId,
    });
    
    return result;
  } catch (error) {
    logger.error({
      msg: `Gagal menambahkan pesan ke queue`,
      sessionId,
      chatId: task?.chatId,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Menghapus queue untuk sesi tertentu
 * @param {string} sessionId - ID sesi yang queuenya akan dihapus
 * @returns {Promise<boolean>} - Status keberhasilan
 */
async function clearSessionQueue(sessionId) {
  return await redisQueue.clearSessionQueue(sessionId);
}

/**
 * Menghapus semua queue yang ada
 * Berguna saat melakukan shutdown aplikasi
 */
async function clearAllQueues() {
  await redisQueue.clearAllQueues();
}

/**
 * Mengecek status queue untuk session tertentu
 * @param {string} sessionId - ID session WhatsApp
 * @returns {Promise<Object>} Informasi status queue
 */
async function getQueueStatus(sessionId) {
  return await redisQueue.getQueueStatus(sessionId);
}

module.exports = {
  addToQueue,
  clearAllQueues,
  getQueueStatus,
  clearSessionQueue,
};
