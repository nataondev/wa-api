const router = require("express").Router();
const queueController = require("../controllers/queueController.js");
const apiKeyValidation = require("../middlewares/apikeyValidator.js");

/**
 * @swagger
 * /queue/status/{sessionId}:
 *   get:
 *     summary: Get queue status for a session
 *     tags: [Queue]
 *     parameters:
 *       - name: sessionId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Queue status retrieved
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Session not found
 *       500:
 *         description: Server error
 */
router.get("/status/:sessionId", apiKeyValidation, queueController.getQueueStatus);

/**
 * @swagger
 * /queue/clear/{sessionId}:
 *   post:
 *     summary: Clear queue for a session
 *     tags: [Queue]
 *     parameters:
 *       - name: sessionId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Queue cleared successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Session not found
 *       500:
 *         description: Server error
 */
router.post("/clear/:sessionId", apiKeyValidation, queueController.clearSessionQueue);

module.exports = router; 