/**
 * @swagger
 * tags:
 *   name: Webhooks
 *   description: API Endpoint untuk manajemen webhook
 */

/**
 * @swagger
 * /webhook/set/{sessionId}:
 *   post:
 *     summary: Mengatur webhook URL untuk sesi tertentu
 *     tags: [Webhooks]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         example: "session_id_1"
 *         description: "ID sesi WhatsApp"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 example: "https://your-webhook-url.com/webhook"
 *                 description: "URL webhook yang akan menerima notifikasi"
 *     responses:
 *       200:
 *         description: Webhook berhasil diatur
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Webhook berhasil diatur"
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId:
 *                       type: string
 *                       example: "session_id_1"
 *                     webhook:
 *                       type: string
 *                       example: "https://your-webhook-url.com/webhook"
 *       400:
 *         description: URL webhook tidak valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "URL webhook tidak valid"
 *       404:
 *         description: Sesi tidak ditemukan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Session tidak ditemukan"
 *       500:
 *         description: Gagal mengatur webhook
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Gagal mengatur webhook"
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 */

/**
 * @swagger
 * /webhook/status:
 *   get:
 *     summary: Memeriksa status webhook
 *     tags: [Webhooks]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Status webhook berhasil diambil
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     globalWebhook:
 *                       type: string
 *                       nullable: true
 *                       example: "https://your-global-webhook-url.com/webhook"
 *                       description: "Webhook global untuk semua sesi"
 *                     sessionWebhooks:
 *                       type: object
 *                       additionalProperties:
 *                         type: string
 *                       example:
 *                         session_id_1: "https://your-session-webhook-url.com/webhook"
 *                         session_id_2: "https://your-session-webhook-url.com/webhook"
 *                       description: "Mapping ID sesi ke URL webhook"
 *       401:
 *         description: Unauthorized - API Key tidak valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "API Key tidak valid"
 *       500:
 *         description: Gagal mendapatkan status webhook
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Gagal mendapatkan status webhook"
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 */
