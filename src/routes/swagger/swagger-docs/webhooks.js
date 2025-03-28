/**
 * @swagger
 * tags:
 *   name: Webhook
 *   description: Endpoint untuk manajemen webhook
 */

/**
 * @swagger
 * /webhook/set/{sessionId}:
 *   post:
 *     summary: Mengatur webhook untuk session tertentu
 *     description: |
 *       Mengatur webhook URL untuk session tertentu dengan konfigurasi keamanan.
 *       Webhook akan menerima notifikasi dengan secret key untuk verifikasi.
 *     tags: [Webhook]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           example: session_id_1
 *         description: ID session WhatsApp
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
 *                 description: URL webhook yang akan menerima notifikasi
 *               secretKey:
 *                 type: string
 *                 description: Secret key untuk signing payload (opsional, akan digenerate jika tidak disediakan)
 *               enabled:
 *                 type: boolean
 *                 description: Status aktif webhook (default true)
 *           example:
 *             url: "https://example.com/webhook"
 *             secretKey: "your-secret-key"
 *             enabled: true
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
 *                     url:
 *                       type: string
 *                       example: "https://example.com/webhook"
 *                     secretKey:
 *                       type: string
 *                       example: "generated-or-provided-secret-key"
 *                     enabled:
 *                       type: boolean
 *                       example: true
 *                     retryCount:
 *                       type: integer
 *                       example: 0
 *                     lastFailedAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       example: null
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-03-28T00:00:00Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-03-28T00:00:00Z"
 *       400:
 *         description: URL webhook tidak valid atau parameter tidak lengkap
 *       401:
 *         description: API key tidak valid
 *       500:
 *         description: Server error
 *
 * /webhook/status/{sessionId}:
 *   get:
 *     summary: Cek status webhook
 *     description: Mendapatkan status dan konfigurasi webhook untuk session tertentu
 *     tags: [Webhook]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           example: session_id_1
 *         description: ID session WhatsApp
 *     responses:
 *       200:
 *         description: Status webhook berhasil didapatkan
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
 *                     status:
 *                       type: string
 *                       enum: [healthy, unhealthy, not_configured]
 *                       example: healthy
 *                     url:
 *                       type: string
 *                       example: "https://example.com/webhook"
 *                     enabled:
 *                       type: boolean
 *                       example: true
 *                     retryCount:
 *                       type: integer
 *                       example: 0
 *                     lastFailedAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       example: null
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-03-28T00:00:00Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-03-28T00:00:00Z"
 *                     error:
 *                       type: string
 *                       example: null
 *       401:
 *         description: API key tidak valid
 *       500:
 *         description: Server error
 */
