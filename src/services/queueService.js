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
  let { sessionId, chatId, message, type } = task;

  logger.info({
    msg: `Memproses pesan dalam queue`,
    sessionId,
    chatId,
    type,
    jobId: job.id,
    messageReceived: message,
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

    // Format pesan sesuai dengan tipe data
    let messageToSend;

    // Jika message adalah string JSON, parse terlebih dahulu
    if (
      typeof message === "string" &&
      (message.startsWith("{") || message.startsWith("["))
    ) {
      try {
        message = JSON.parse(message);
      } catch (e) {
        logger.warn({
          msg: "Failed to parse JSON message, using as text",
          error: e.message,
        });
      }
    }

    // Cek tipe pesan dan format sesuai kebutuhan
    if (typeof message === "object") {
      if (message.image || message.video || message.document || message.audio) {
        // Pesan media, gunakan langsung
        messageToSend = message;
        logger.info({
          msg: "Menggunakan format media yang sudah ada",
          mediaType: type,
          hasCaption: message.caption ? "yes" : "no",
        });
      } else if (message.text) {
        // Pesan teks dalam format objek
        messageToSend = message;
      } else {
        // Objek lain, konversi ke teks
        messageToSend = { text: JSON.stringify(message) };
      }
    } else {
      // String biasa atau tipe data lain
      messageToSend = { text: String(message) };
    }

    // Log detail pesan sebelum pengiriman
    logger.info({
      msg: `Struktur pesan yang akan dikirim`,
      messageType: type,
      messageStructure: messageToSend,
      sessionId,
      chatId,
    });

    // Validasi pesan
    if (!messageToSend) {
      throw new Error("Invalid message format: Message is empty or invalid");
    }

    // Mengirim pesan
    const result = await client.sendMessage(chatId, messageToSend);

    logger.info({
      msg: `Pesan berhasil dikirim`,
      sessionId,
      chatId,
      messageId: result?.key?.id || null,
      messageType: type,
    });

    // Format hasil
    const enhancedResult = {
      ...result,
      sender: sessionId,
      receiver: chatId,
      message: type === "text" ? messageToSend.text : `${type} message sent`,
    };

    return enhancedResult;
  } catch (error) {
    logger.error({
      msg: `Error saat memproses pesan`,
      error: error.message,
      stack: error.stack,
      sessionId,
      chatId,
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
    // Membuat copy task untuk menghindari modifikasi langsung parameter asli
    let processedTask = { ...task };

    // Konversi sender dan receiver jika perlu
    if (!processedTask.sessionId && processedTask.sender) {
      processedTask.sessionId = processedTask.sender;
    } else if (!processedTask.sessionId) {
      processedTask.sessionId = sessionId;
    }

    if (!processedTask.chatId && processedTask.receiver) {
      // Import whatsappService untuk format nomor telepon
      const whatsappService = require("./whatsappService");
      processedTask.chatId = whatsappService.formatPhone(
        processedTask.receiver
      );
    }

    // Tentukan tipe message berdasarkan konten
    if (!processedTask.type) {
      if (processedTask.file) {
        // Deteksi jenis file berdasarkan ekstensi URL
        const fileUrl = processedTask.file.toLowerCase();
        const caption = processedTask.message || "";
        let fileType = "document";
        let mimeType = "application/octet-stream";

        // Deteksi tipe file berdasarkan ekstensi atau URL
        if (
          fileUrl.endsWith(".jpg") ||
          fileUrl.endsWith(".jpeg") ||
          fileUrl.endsWith(".png") ||
          fileUrl.includes("image")
        ) {
          fileType = "image";
          mimeType = fileUrl.endsWith(".png") ? "image/png" : "image/jpeg";
        } else if (fileUrl.endsWith(".pdf")) {
          fileType = "document";
          mimeType = "application/pdf";
        } else if (fileUrl.endsWith(".mp4") || fileUrl.endsWith(".mov")) {
          fileType = "video";
          mimeType = "video/mp4";
        } else if (fileUrl.endsWith(".mp3") || fileUrl.endsWith(".ogg")) {
          fileType = "audio";
          mimeType = fileUrl.endsWith(".mp3") ? "audio/mp3" : "audio/ogg";
        }

        // Set jenis file yang terdeteksi
        processedTask.type = fileType;

        // Buat objek media sesuai dengan standar Baileys
        processedTask.message = {
          [fileType]: { url: processedTask.file },
          caption: caption,
          mimetype: mimeType,
        };

        if (processedTask.viewOnce === true) {
          processedTask.message.viewOnce = true;
        }

        logger.info({
          msg: `File terdeteksi: ${fileType}`,
          sessionId: processedTask.sessionId,
          chatId: processedTask.chatId,
          fileUrl: processedTask.file,
          messageStructure: processedTask.message,
        });
      } else {
        // Jika tidak ada file, set type menjadi text
        processedTask.type = "text";
        // Pastikan message adalah string untuk pesan teks
        if (typeof processedTask.message !== "string") {
          processedTask.message = { text: String(processedTask.message) };
        } else {
          processedTask.message = { text: processedTask.message };
        }
      }
    }

    logger.info({
      msg: `Menambahkan pesan ke queue`,
      sessionId: processedTask.sessionId,
      chatId: processedTask.chatId,
      type: processedTask.type,
      messageStructure: processedTask.message,
    });

    // Buat queue jika belum ada dengan processor function
    const queue = redisQueue.getOrCreateQueue(
      processedTask.sessionId,
      processMessage
    );

    // Tambahkan task ke queue
    const result = await redisQueue.addToQueue(
      processedTask.sessionId,
      processedTask
    );

    logger.info({
      msg: `Pesan berhasil ditambahkan ke queue`,
      sessionId: processedTask.sessionId,
      chatId: processedTask.chatId,
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
