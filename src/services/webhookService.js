const axios = require("axios");
const logger = require("../utils/logger");
const fs = require("fs");
const path = require("path");

class WebhookService {
  constructor() {
    // Endpoint global default
    this.globalWebhook = process.env.GLOBAL_WEBHOOK_URL || null;

    // Map untuk menyimpan webhook per sesi
    this.sessionWebhooks = new Map();

    // Path file webhook
    this.webhookFilePath = path.join(__dirname, "../../data/webhook.json");

    // Buat direktori data jika belum ada
    const dataDir = path.dirname(this.webhookFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Load webhook data saat startup
    this.loadWebhookData();
  }

  // Load webhook data dari file
  loadWebhookData() {
    try {
      if (fs.existsSync(this.webhookFilePath)) {
        const data = JSON.parse(fs.readFileSync(this.webhookFilePath, "utf8"));

        // Restore session webhooks
        if (data.sessionWebhooks) {
          Object.entries(data.sessionWebhooks).forEach(([sessionId, url]) => {
            this.sessionWebhooks.set(sessionId, url);
          });
        }

        logger.info({
          msg: "Webhook data loaded successfully",
          sessionCount: this.sessionWebhooks.size,
        });
      }
    } catch (error) {
      logger.error({
        msg: "Error loading webhook data",
        error: error.message,
        stack: error.stack,
      });
    }
  }

  // Simpan webhook data ke file
  saveWebhookData() {
    try {
      const data = {
        globalWebhook: this.globalWebhook,
        sessionWebhooks: Object.fromEntries(this.sessionWebhooks),
      };

      fs.writeFileSync(this.webhookFilePath, JSON.stringify(data, null, 2));

      logger.info({
        msg: "Webhook data saved successfully",
        sessionCount: this.sessionWebhooks.size,
      });
    } catch (error) {
      logger.error({
        msg: "Error saving webhook data",
        error: error.message,
        stack: error.stack,
      });
    }
  }

  // Mengatur webhook untuk sesi tertentu
  setSessionWebhook(sessionId, url) {
    if (!url) {
      this.sessionWebhooks.delete(sessionId);
      logger.info({
        msg: `Webhook untuk sesi ${sessionId} dihapus`,
        sessionId,
      });
    } else {
      this.sessionWebhooks.set(sessionId, url);
      logger.info({
        msg: `Webhook untuk sesi ${sessionId} diatur ke ${url}`,
        sessionId,
        webhook: url,
      });
    }

    // Simpan perubahan ke file
    this.saveWebhookData();
  }

  // Mengirim data pesan ke webhook
  async sendToWebhook(sessionId, data) {
    try {
      // Tambahkan sessionId ke data
      const payload = {
        sessionId,
        timestamp: Date.now(),
        ...data,
      };

      // Cek webhook khusus sesi dulu
      const sessionWebhook = this.sessionWebhooks.get(sessionId);
      if (sessionWebhook) {
        await axios.post(sessionWebhook, payload);
        logger.debug({
          msg: `Pesan terkirim ke webhook sesi ${sessionId}`,
          sessionId,
        });
      }

      // Kirim juga ke webhook global jika ada
      if (this.globalWebhook) {
        await axios.post(this.globalWebhook, payload);
        logger.debug({
          msg: `Pesan terkirim ke webhook global`,
          sessionId,
        });
      }

      return true;
    } catch (error) {
      logger.error({
        msg: `Error mengirim ke webhook`,
        sessionId,
        error: error.message,
        stack: error.stack,
      });
      return false;
    }
  }

  // Mendapatkan webhook untuk sesi tertentu
  getSessionWebhook(sessionId) {
    return this.sessionWebhooks.get(sessionId) || null;
  }

  // Mendapatkan status webhook
  getStatus() {
    return {
      globalWebhook: this.globalWebhook,
      sessionWebhooks: Array.from(this.sessionWebhooks.entries()).map(
        ([id, url]) => ({
          sessionId: id,
          webhook: url,
        })
      ),
    };
  }

  // Membersihkan webhook untuk sesi tertentu
  clearSessionWebhook(sessionId) {
    this.sessionWebhooks.delete(sessionId);
    this.saveWebhookData();
    logger.info({
      msg: `Webhook untuk sesi ${sessionId} dibersihkan`,
      sessionId,
    });
  }

  // Membersihkan semua webhook
  clearAllWebhooks() {
    this.sessionWebhooks.clear();
    this.saveWebhookData();
    logger.info({
      msg: "Semua webhook dibersihkan",
    });
  }
}

module.exports = new WebhookService();
