const logger = require("../utils/logger");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

const WEBHOOK_FILE = path.join(process.cwd(), "data", "webhook.json");

// Webhook URLs per session
let webhookData = {
  globalWebhook: null,
  sessionWebhooks: {},
};

// Inisialisasi data webhook dari file
const initializeWebhookData = async () => {
  try {
    const data = await fs.readFile(WEBHOOK_FILE, "utf8");
    webhookData = JSON.parse(data);
    logger.info({
      msg: "Webhook data loaded from file",
    });
  } catch (error) {
    logger.warn({
      msg: "Failed to load webhook data, using default",
      error: error.message,
    });
    // Buat file baru jika tidak ada
    await saveWebhookData();
  }
};

// Simpan data webhook ke file
const saveWebhookData = async () => {
  try {
    await fs.writeFile(WEBHOOK_FILE, JSON.stringify(webhookData, null, 2));
    logger.info({
      msg: "Webhook data has been updated and saved to file",
    });
    return true;
  } catch (error) {
    logger.error({
      msg: "Failed to update and save webhook data",
      error: error.message,
    });
    return false;
  }
};

// Set webhook URL untuk session
const setWebhook = async (sessionId, url, options = {}) => {
  if (!url) {
    return false;
  }

  try {
    const webhookUrl = new URL(url);
    const existingWebhook = webhookData.sessionWebhooks[sessionId];

    // Gunakan secret key yang sudah ada jika ada dan tidak di-override
    const secretKey =
      options.secretKey ||
      (existingWebhook
        ? existingWebhook.secretKey
        : Math.random().toString(36).substring(2));

    // Set enabled status, default true jika tidak disebutkan
    const enabled = options.hasOwnProperty("enabled") ? options.enabled : true;

    // Determine retryCount and lastFailedAt
    let retryCount = 0;
    let lastFailedAt = null;

    if (existingWebhook) {
      if (enabled) {
        // Reset counters if enabling
        retryCount = 0;
        lastFailedAt = null;
      } else {
        // Preserve existing values if disabling
        retryCount = existingWebhook.retryCount || 0;
        lastFailedAt = existingWebhook.lastFailedAt || null;
      }
    }

    webhookData.sessionWebhooks[sessionId] = {
      url: webhookUrl.toString(),
      secretKey,
      enabled: enabled,
      retryCount: 0,
      lastFailedAt: null,
      createdAt: existingWebhook?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveWebhookData();

    logger.info({
      msg: "Webhook URL set successfully",
      sessionId,
      url: webhookUrl.toString(),
      enabled,
    });

    // Return webhook configuration
    return {
      url: webhookUrl.toString(),
      secretKey,
      enabled,
      retryCount,
      lastFailedAt,
      createdAt: webhookData.sessionWebhooks[sessionId].createdAt,
      updatedAt: webhookData.sessionWebhooks[sessionId].updatedAt,
    };
  } catch (error) {
    logger.error({
      msg: "Invalid webhook URL",
      sessionId,
      url,
      error: error.message,
    });
    return false;
  }
};

// Hapus webhook untuk session
const clearSessionWebhook = async (sessionId) => {
  delete webhookData.sessionWebhooks[sessionId];
  await saveWebhookData();

  logger.info({
    msg: "Webhook cleared for session",
    sessionId,
  });
};

// Kirim data ke webhook langsung
const sendToWebhook = async (sessionId, data) => {
  const webhookConfig = webhookData.sessionWebhooks[sessionId];

  if (!webhookConfig || !webhookConfig.enabled) {
    logger.debug({
      msg: "No webhook configured for session or webhook disabled",
      sessionId,
    });
    return false;
  }

  try {
    const response = await axios.post(webhookConfig.url, data, {
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": webhookConfig.secretKey,
      },
      timeout: 5000,
    });

    // Reset retry count jika sukses
    webhookConfig.retryCount = 0;
    webhookConfig.lastFailedAt = null;
    await saveWebhookData();

    logger.info({
      msg: "Webhook sent successfully",
      sessionId,
      statusCode: response.status,
    });

    return true;
  } catch (error) {
    // Update retry counter
    webhookConfig.retryCount = (webhookConfig.retryCount || 0) + 1;
    webhookConfig.lastFailedAt = new Date().toISOString();

    // Nonaktifkan jika webhook offline
    if (error.response && error.response.status === 404) {
      webhookConfig.enabled = false;
      logger.warn({
        msg: `Webhook disabled due to target being offline`,
        sessionId,
        url: webhookConfig.url,
      });
    } else if (
      webhookConfig.retryCount >= process.env.WEBHOOK_DISABLED_ATTEMPTS
    ) {
      // Nonaktifkan jika gagal 5x
      webhookConfig.enabled = false;
      logger.warn({
        msg: `Webhook disabled after ${process.env.WEBHOOK_DISABLED_ATTEMPTS} consecutive failures`,
        sessionId,
        url: webhookConfig.url,
      });
    }

    await saveWebhookData();

    logger.error({
      msg: "Failed to send webhook",
      sessionId,
      error: error.message,
      retryCount: webhookConfig.retryCount,
      enabled: webhookConfig.enabled,
    });

    return false;
  }
};

// Check webhook health
const checkHealth = async (sessionId) => {
  const webhookConfig = webhookData.sessionWebhooks[sessionId];
  if (!webhookConfig) {
    return {
      status: "not_configured",
    };
  }

  try {
    const response = await axios.get(webhookConfig.url, {
      timeout: 5000,
    });
    return {
      status: response.status === 200 ? "healthy" : "unhealthy",
      url: webhookConfig.url,
      enabled: webhookConfig.enabled,
      retryCount: webhookConfig.retryCount,
      lastFailedAt: webhookConfig.lastFailedAt,
      createdAt: webhookConfig.createdAt,
      updatedAt: webhookConfig.updatedAt,
    };
  } catch (error) {
    return {
      status: "unhealthy",
      url: webhookConfig.url,
      enabled: webhookConfig.enabled,
      retryCount: webhookConfig.retryCount,
      lastFailedAt: webhookConfig.lastFailedAt,
      createdAt: webhookConfig.createdAt,
      updatedAt: webhookConfig.updatedAt,
      error: error.message,
    };
  }
};

// reset webhook session
const resetWebhookSession = async (sessionId) => {
  const currentTime = new Date().toISOString();

  webhookData.sessionWebhooks[sessionId] = {
    enabled: true,
    retryCount: 0,
    lastFailedAt: null,
    createdAt: currentTime,
    updatedAt: currentTime,
  };

  await saveWebhookData();
};

// Initialize webhook data when module loads
initializeWebhookData();

module.exports = {
  setWebhook,
  clearSessionWebhook,
  sendToWebhook,
  checkHealth,
};
