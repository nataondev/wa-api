const express = require("express");
const router = express.Router();
const webhookService = require("../services/webhookService");
const logger = require("../utils/logger");
const apikeyValidator = require("../middlewares/apikeyValidator");

router.post("/set/:sessionId", [apikeyValidator], async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        status: false,
        message: "URL webhook diperlukan",
      });
    }

    const result = await webhookService.setSessionWebhook(sessionId, url);

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

router.get("/status", [apikeyValidator], async (req, res) => {
  try {
    const status = webhookService.getStatus();

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
