const router = require("express").Router();
const webhookService = require("../services/webhookService");
const apikeyValidator = require("../middlewares/apikeyValidator");
const logger = require("../utils/logger");

router.post("/set/:sessionId", [apikeyValidator], async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { url, secretKey, enabled = true } = req.body;

    if (!url) {
      return res.status(400).json({
        status: false,
        message: "URL webhook diperlukan",
      });
    }

    const result = await webhookService.setWebhook(sessionId, url, {
      secretKey,
      enabled: enabled,
      retryCount: 0,
      lastFailedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      status: true,
      message: "Webhook berhasil diatur",
      data: result,
    });
  } catch (error) {
    logger.error({
      msg: "Error setting webhook",
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      status: false,
      message: "Gagal mengatur webhook",
      error: error.message,
    });
  }
});

router.get("/status/:sessionId", [apikeyValidator], async (req, res) => {
  try {
    const { sessionId } = req.params;
    const status = await webhookService.checkHealth(sessionId);

    return res.status(200).json({
      status: true,
      data: status,
    });
  } catch (error) {
    logger.error({
      msg: "Error getting webhook status",
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      status: false,
      message: "Gagal mendapatkan status webhook",
      error: error.message,
    });
  }
});

module.exports = router;
