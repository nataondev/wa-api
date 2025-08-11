const { webcrypto } = require("crypto");
global.crypto = webcrypto;

const fs = require("fs");
const path = require("path");

const pino = require("pino");
const { toDataURL } = require("qrcode");
const { sendResponse } = require("../utils/response");
const httpStatusCode = require("../constants/httpStatusCode");
const util = require("util");
const logger = require("../utils/logger");
const webhookService = require("./webhookService");

const readFileAsync = util.promisify(fs.readFile);
const {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  delay,
  Browsers,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const WebSocket = require("ws");

const sessions = new Map();
const retries = new Map();

const sessionsDir = (sessionId = "") =>
  path.join(__dirname, "../../sessions", sessionId || "");

const isSessionExists = (sessionId) => sessions.has(sessionId);

const getSessionStatus = async (sessionId) => {
  try {
    // Cek sesi di memory terlebih dahulu
    const session = sessions.get(sessionId);
    if (session) {
      try {
        const connectionState = await session.ws.readyState;
        if (connectionState === WebSocket.OPEN) {
          // Baca data credentials
          const data = await readFileAsync(
            `sessions/md_${sessionId}/creds.json`
          );
          const userdata = JSON.parse(data);
          console.log(`[${sessionId}] Connected successfully`);

          return {
            status: "connected",
            user: userdata,
            connectionState: "open",
          };
        }
      } catch (error) {
        logger.error({
          msg: `Error checking session ${sessionId} status`,
          sessionId,
          error: error.message,
          stack: error.stack,
        });
      }
    }

    // Jika tidak ada di memory, cek file credentials
    try {
      const data = await readFileAsync(`sessions/md_${sessionId}/creds.json`);
      const userdata = JSON.parse(data);

      return {
        status: "exists",
        user: userdata,
        connectionState: "closed",
      };
    } catch {
      return {
        status: "not_found",
        connectionState: null,
      };
    }
  } catch (error) {
    logger.error({
      msg: `Error getting session status`,
      sessionId,
      error: error.message,
      stack: error.stack,
    });
    return {
      status: "error",
      error: error.message,
    };
  }
};

const cleanupSession = async (sessionId) => {
  try {
    const session = sessions.get(sessionId);
    if (session) {
      // Clear interval
      if (session.storeInterval) {
        clearInterval(session.storeInterval);
      }

      // Simpan metadata terakhir kali
      if (session.store) {
        try {
          const storePath = sessionsDir(`${sessionId}_store.json`);
          await session.store.writeToFile(storePath);
          logger.info({
            msg: "Final group metadata store saved",
            sessionId,
            path: storePath,
          });
        } catch (error) {
          logger.error({
            msg: "Failed to save final group metadata",
            sessionId,
            error: error.message,
            stack: error.stack,
          });
        }
      }

    // Cleanup lainnya
    session.ev.removeAllListeners();
    if (session.ws) {
      await session.ws.close();
    }
      sessions.delete(sessionId);

      logger.info({
        msg: "Session cleaned up successfully",
        sessionId,
      });
      return true;
    }
    return false;
  } catch (error) {
    logger.error({
      msg: "Session cleanup failed",
      sessionId,
      error: error.message,
      stack: error.stack,
    });
    return false;
  }
};

// Tambahkan fungsi helper untuk cek folder
const checkAndCleanSessionFolder = (sessionId) => {
  try {
    const sessionDir = path.join(sessionsDir(), `md_${sessionId}`);
    const storeFile = path.join(sessionsDir(), `${sessionId}_store.json`);

    // Cek apakah folder ada
    if (fs.existsSync(sessionDir)) {
      const files = fs.readdirSync(sessionDir);

      // Jika folder kosong atau tidak ada creds.json
      if (files.length === 0 || !files.includes("creds.json")) {
        logger.info({
          msg: `Invalid session folder found, cleaning up...`,
          sessionId,
          action: "cleanup",
        });

        // Hapus folder sesi
        fs.rmSync(sessionDir, { recursive: true, force: true });

      // Hapus file store lama jika ada (kompatibilitas lama)
      if (fs.existsSync(storeFile)) {
        fs.unlinkSync(storeFile);
      }

        return false;
      }
      return true;
    }
    return false;
  } catch (error) {
    logger.error({
      msg: `Error checking session folder`,
      sessionId,
      error: error.message,
      stack: error.stack,
    });
    return false;
  }
};

const createSession = async (sessionId, isLegacy = false, res = null) => {
  try {
    logger.info({
      msg: `Starting session creation`,
      sessionId,
      isLegacy,
    });

    await checkAndCleanSessionFolder(sessionId);
    await cleanupSession(sessionId);

    const { state, saveCreds } = await useMultiFileAuthState(
      sessionsDir(`md_${sessionId}`)
    );

    const client = makeWASocket({
      printQRInTerminal: true,
      browser: Browsers.ubuntu("Chrome"),
      auth: state,
      logger: pino({ level: "silent" }),
    });

    // Simpan session (tanpa store)
    sessions.set(sessionId, client);

    // Cleanup handler yang lebih efisien
    const cleanupHandler = async () => {};

    // Tambahkan cleanup handler
    process.on("SIGTERM", cleanupHandler);
    process.on("SIGINT", cleanupHandler);

    let connectionTimeout;
    let hasResponded = false;

    // Tambahkan event listener untuk pesan masuk
    client.ev.on("messages.upsert", async (m) => {
      if (m.type === "notify") {
        for (const msg of m.messages) {
          const isFromMe = msg.key.fromMe;
          const isBroadcast = msg.broadcast;
          const hasNoStickerMessage = msg.stickerMessage?.url === "";
          if ((!isFromMe && !isBroadcast) || hasNoStickerMessage) {
            logger.info({
              msg: `Pesan baru diterima`,
              sessionId,
              from: msg.key.remoteJid,
              messageId: msg.key.id,
            });

            // Kirim ke webhook dengan format yang sesuai dengan webhookService lama
            const isGroup = msg.key.remoteJid.endsWith("@g.us");
            const sender = !isGroup ? msg.key.remoteJid : msg.key.participant;
            const text =
              msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text;
            const quotedText =
              msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
                ?.conversation;

            webhookService.sendToWebhook(sessionId, {
              sessionId,
              timestamp: Date.now(),
              type: "message",
              message: {
                id: msg.key.id,
                isGroup: isGroup,
                remoteJid: msg.key.remoteJid,
                sender: sender,
                text,
                quotedText,
              },
            });
          }
        }
      }
    });

    // Tambahkan event listener untuk status koneksi
    client.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (connectionTimeout) clearTimeout(connectionTimeout);

      // Log connection states
      if (connection) {
        logger.info({
          msg: `Connection update`,
          sessionId,
          state: connection,
          code: lastDisconnect?.error?.output?.statusCode,
        });

        // Kirim status koneksi ke webhook
        webhookService.sendToWebhook(sessionId, {
          sessionId,
          type: "connection",
          status: connection,
          qr: qr,
        });
      }

      if (connection === "open") {
        retries.delete(sessionId);
        logger.info({
          msg: `Session connected successfully`,
          sessionId,
          type: "connection",
          state: "connected",
        });
        hasResponded = true;

        if (res && !res.headersSent) {
          return sendResponse(
            res,
            httpStatusCode.OK,
            "Session connected successfully",
            {
              status: "connected",
            }
          );
        }
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        logger.warn({
          msg: `Connection closed`,
          sessionId,
          statusCode,
          error: lastDisconnect?.error?.message,
        });

        // Gunakan shouldReconnect untuk menentukan apakah perlu reconnect
        if (shouldReconnect(statusCode, sessionId)) {
          const retriesCount = retries.get(sessionId) || 0;
          if (retriesCount < 3) {
            logger.info({
              msg: `[${sessionId}] Attempting to reconnect... (Attempt ${
                retriesCount + 1
              }/3)`,
              sessionId,
              retriesCount,
            });
            retries.set(sessionId, retriesCount + 1);

            // Cleanup tanpa menghapus file sesi
            await cleanupSession(sessionId, false);

            // Delay sebelum reconnect
            await new Promise((resolve) => setTimeout(resolve, 3000));

            // Reconnect
            await createSession(sessionId, isLegacy, res);
            return;
          } else {
            logger.info({
              msg: `[${sessionId}] Max reconnection attempts reached`,
              sessionId,
            });
            hasResponded = true;
            if (res && !res.headersSent) {
              return sendResponse(
                res,
                httpStatusCode.INTERNAL_SERVER_ERROR,
                "Failed to reconnect after maximum attempts",
                null
              );
            }
          }
        } else {
          logger.info({
            msg: `[${sessionId}] No reconnection needed, cleaning up session`,
            sessionId,
          });
          hasResponded = true;
          await cleanupSession(sessionId);
          if (res && !res.headersSent) {
            return sendResponse(
              res,
              httpStatusCode.INTERNAL_SERVER_ERROR,
              "Session ended",
              null
            );
          }
        }
      }

      // Log QR generation
      if (qr) {
        logger.info({
          msg: `QR Code generated`,
          sessionId,
          type: "qr",
        });
        hasResponded = true;
        if (res && !res.headersSent) {
          try {
            const qrImage = await toDataURL(qr);
            return sendResponse(
              res,
              httpStatusCode.OK,
              "QR Code generated successfully",
              {
                qr: qrImage,
              }
            );
          } catch (error) {
            console.error("QR Generation Error:", error);
            return sendResponse(
              res,
              httpStatusCode.INTERNAL_SERVER_ERROR,
              "Failed to generate QR code",
              null,
              error
            );
          }
        }
      }

      // Set connection timeout
      connectionTimeout = setTimeout(async () => {
        if (!hasResponded && res && !res.headersSent) {
          console.log(`Connection timeout for session ${sessionId}`);
          hasResponded = true;
          await cleanupSession(sessionId);
          return sendResponse(
            res,
            httpStatusCode.REQUEST_TIMEOUT,
            "Connection timeout",
            null
          );
        }
      }, 60000);
    });

    // Log creds updates
    client.ev.on("creds.update", () => {
      logger.info({
        msg: `Credentials updated`,
        sessionId,
        type: "creds",
      });
      saveCreds();
    });

    return client;
  } catch (error) {
    logger.error({
      msg: `Session creation failed`,
      sessionId,
      error: error.message,
      stack: error.stack,
    });
    await cleanupSession(sessionId);

    if (res && !res.headersSent) {
      return sendResponse(
        res,
        httpStatusCode.INTERNAL_SERVER_ERROR,
        "Failed to create session",
        null,
        error
      );
    }
    throw error;
  }
};

const getSession = (sessionId) => sessions.get(sessionId) || null;

const deleteSession = async (sessionId, isLegacy = false, res = null) => {
  await checkAndCleanSessionFolder(sessionId);

  try {
    console.log(`[${sessionId}] Attempting to logout session...`);

    // Hapus webhook untuk session ini
    const webhookService = require("./webhookService");
    webhookService.clearSessionWebhook(sessionId);
    logger.info({
      msg: `Webhook untuk session ${sessionId} dihapus saat logout`,
      sessionId,
    });

    // Hapus antrian pesan untuk session ini
    const queueService = require("./queueService");
    queueService.clearSessionQueue(sessionId);
    logger.info({
      msg: `Antrian pesan untuk session ${sessionId} dihapus saat logout`,
      sessionId,
    });

    // Cek apakah sesi ada di memory atau file system
    const session = sessions.get(sessionId);
    const sessionFileName =
      (isLegacy ? "legacy_" : "md_") + sessionId + (isLegacy ? ".json" : "");
    const sessionPath = sessionsDir(sessionFileName);
    const sessionExists = fs.existsSync(sessionPath);

    if (!session && !sessionExists) {
      console.log(`[${sessionId}] Session not found in memory or filesystem`);
      if (res) {
        return sendResponse(
          res,
          httpStatusCode.NOT_FOUND,
          "Session not found",
          null
        );
      }
      return false;
    }

    // Jika sesi ada di memory, lakukan logout
    if (session) {
      try {
        console.log(`[${sessionId}] Logging out session...`);
        await session.logout();
        console.log(`[${sessionId}] Successfully logged out from WhatsApp`);
      } catch (error) {
        console.log(
          `[${sessionId}] Error during WhatsApp logout:`,
          error.message
        );
      }
    }

    // Hapus semua file dan folder terkait sesi
    try {
      console.log(`[${sessionId}] Removing session files and directories...`);

      // Hapus folder sesi utama jika ada
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { force: true, recursive: true });
      }

      // Hapus file store
      const storeFile = sessionsDir(sessionId + "_store.json");
      if (fs.existsSync(storeFile)) {
        fs.rmSync(storeFile, { force: true });
      }

      // Hapus folder pre-keys jika ada
      const preKeysPath = path.join(sessionPath, "pre-keys");
      if (fs.existsSync(preKeysPath)) {
        fs.rmSync(preKeysPath, { force: true, recursive: true });
      }

      console.log(`[${sessionId}] Successfully removed all session files`);
    } catch (error) {
      console.log(
        `[${sessionId}] Error removing session files:`,
        error.message
      );
    }

    // Cleanup dari memory
    try {
      console.log(`[${sessionId}] Cleaning up session from memory...`);
      if (session) {
        // Membersihkan event listeners
        session.ev.removeAllListeners("connection.update");
        session.ev.removeAllListeners("creds.update");
        session.ev.removeAllListeners("chats.set");
        session.ev.removeAllListeners("messages.update");

        // Menutup koneksi
        if (session.ws) {
          await session.ws.close();
        }

        // Membersihkan store
        if (session.store) {
          session.store.writeToFile(sessionsDir(sessionId + "_store.json"));
        }
      }
      console.log(`[${sessionId}] Successfully cleaned up from memory`);
    } catch (error) {
      console.log(
        `[${sessionId}] Error cleaning up from memory:`,
        error.message
      );
    }

    // Hapus dari maps
    sessions.delete(sessionId);
    retries.delete(sessionId);

    // Double check untuk memastikan folder benar-benar terhapus
    setTimeout(() => {
      try {
        if (fs.existsSync(sessionPath)) {
          fs.rmSync(sessionPath, { force: true, recursive: true });
        }
      } catch (error) {
        console.log(`[${sessionId}] Final cleanup error:`, error.message);
      }
    }, 1000);

    if (res) {
      return sendResponse(
        res,
        httpStatusCode.OK,
        "Session logged out successfully",
        {
          sessionId,
          status: "logged_out",
        }
      );
    }
    return true;
  } catch (error) {
    console.error(`[${sessionId}] Failed to logout session:`, error);
    if (res) {
      return sendResponse(
        res,
        httpStatusCode.INTERNAL_SERVER_ERROR,
        "Failed to logout session",
        null,
        error
      );
    }
    throw error;
  }
};

const getChatList = async (sessionId, isGroup = false) => {
  try {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    if (isGroup) {
      const groupsMap = await session.groupFetchAllParticipating();
      const groups = Object.values(groupsMap || {});
      return groups.map((g) => ({
        id: g.id,
        name: g.subject || g.name || "Unknown Group",
        participant_count: Array.isArray(g.participants)
          ? g.participants.length
          : g.participantCount || 0,
        creation_time: g.creation || g.creationTime || new Date().toISOString(),
      }));
    }

    // Tanpa store, tidak ada daftar chat non-grup yang disinkronkan
    return [];
  } catch (error) {
    console.error(`[${sessionId}] Error getting chat list:`, error);
    throw error;
  }
};

const isExists = async (client, jid, isGroup = false) => {
  try {
    let chatInfo;

    if (isGroup) {
      chatInfo = await client.groupMetadata(jid);
      return Boolean(chatInfo.id);
    }

    chatInfo = await client.onWhatsApp(jid);
    return (
      Array.isArray(chatInfo) &&
      chatInfo.length > 0 &&
      chatInfo[0].exists === true
    );
  } catch {
    return false;
  }
};

const groupFetchAllParticipating = (client) => {
  try {
    return client.groupFetchAllParticipating();
  } catch (err) {
    return false;
  }
};

const queueService = require("./queueService");

const sendMessage = async (client, chatId, message, showTyping = true) => {
  try {
    // Perbaikan: Gunakan Array.from(sessions.entries()) untuk mencari sessionId dari Map
    const sessionEntry = Array.from(sessions.entries()).find(
      ([_, clientObj]) => clientObj === client
    );

    const sessionId = sessionEntry ? sessionEntry[0] : null;
    if (!sessionId) {
      throw new Error("Session not found");
    }

    // Tampilkan status "sedang mengetik" sebelum mengirim pesan
    if (showTyping) {
      try {
        // Kirim status "composing" (sedang mengetik)
        await client.sendPresenceUpdate("composing", chatId);

        // Tunggu beberapa detik agar tampilan "sedang mengetik" terlihat natural
        // Waktu tunggu proporsional dengan panjang pesan
        const typingDelay =
          typeof message === "object" && message.text
            ? Math.min(Math.max(message.text.length * 40, 1000), 3000)
            : typeof message === "string"
            ? Math.min(Math.max(message.length * 40, 1000), 3000)
            : 1500;

        logger.info({
          msg: `Showing typing indicator for ${typingDelay}ms`,
          sessionId,
          chatId,
        });

        await delay(typingDelay);
      } catch (typingError) {
        // Lanjutkan proses pengiriman meskipun ada kesalahan saat menampilkan status mengetik
        logger.warn({
          msg: `Failed to show typing indicator, proceeding with sending`,
          sessionId,
          chatId,
          error: typingError.message,
        });
      }
    }

    // Log pesan untuk debugging
    logger.info({
      msg: `Adding message to queue`,
      sessionId,
      chatId,
      messageType: typeof message,
      messageStructure: message,
    });

    // Setelah menunjukkan typing, kirim status "paused" untuk menghentikan indikator typing
    if (showTyping) {
      try {
        await client.sendPresenceUpdate("paused", chatId);
      } catch (typingError) {
        logger.warn({
          msg: `Failed to reset typing indicator`,
          sessionId,
          chatId,
          error: typingError.message,
        });
      }
    }

    // Tambahkan ke antrian
    try {
      // Jika pesan adalah string, konversi ke format yang benar
      let processedMessage = message;
      if (typeof message === "string") {
        processedMessage = { text: message };
      }

      // Pastikan pesan media memiliki format yang benar
      if (typeof message === "object") {
        // Jika ada properti media (image, video, document, audio), gunakan langsung
        if (
          message.image ||
          message.video ||
          message.document ||
          message.audio
        ) {
          processedMessage = message;
        }
        // Jika ada properti text, pastikan dalam format yang benar
        else if (message.text) {
          processedMessage = { text: message.text };
        }
      }

      const result = await queueService.addToQueue(sessionId, {
        sessionId,
        chatId,
        message: processedMessage,
        type: processedMessage.image
          ? "image"
          : processedMessage.video
          ? "video"
          : processedMessage.document
          ? "document"
          : processedMessage.audio
          ? "audio"
          : "text",
      });

      logger.info({
        msg: `Message added to queue successfully`,
        sessionId,
        chatId,
        messageId: result?.key?.id || null,
        messageType: processedMessage.image
          ? "image"
          : processedMessage.video
          ? "video"
          : processedMessage.document
          ? "document"
          : processedMessage.audio
          ? "audio"
          : "text",
      });

      return result;
    } catch (queueError) {
      logger.error({
        msg: `Failed to add message to queue`,
        sessionId,
        chatId,
        error: queueError.message,
        stack: queueError.stack,
      });
      throw queueError;
    }
  } catch (err) {
    logger.error({
      msg: `Error in sendMessage`,
      error: err.message,
      stack: err.stack,
    });
    return Promise.reject(err);
  }
};

const formatPhone = (phoneNumber) => {
  // Hapus semua karakter non-digit (spasi, -, +, dll)
  let cleanedNumber = phoneNumber.replace(/[^0-9]/g, "");

  // Jika panjang nomor lebih dari 15, anggap sebagai grup
  if (cleanedNumber.length > 15) {
    return formatGroup(phoneNumber);
  }

  // Format nomor ke format 628xxx
  if (cleanedNumber.startsWith("08")) {
    cleanedNumber = cleanedNumber.replace("08", "628");
  } else if (cleanedNumber.startsWith("628")) {
    // Sudah dalam format yang benar
    cleanedNumber = cleanedNumber;
  } else if (cleanedNumber.startsWith("62")) {
    // Sudah dalam format yang benar
    cleanedNumber = cleanedNumber;
  } else if (cleanedNumber.startsWith("+62")) {
    // Hapus + di awal
    cleanedNumber = cleanedNumber.substring(1);
  } else if (!cleanedNumber.startsWith("62")) {
    // Tambahkan 62 di awal jika belum ada
    cleanedNumber = "62" + cleanedNumber;
  }

  return `${cleanedNumber}@s.whatsapp.net`;
};

const formatGroup = (groupId) => groupId.replace(/[^\d-]/g, "") + "@g.us";

// Store tidak lagi digunakan, fungsi backup store dihapus

const cleanup = async () => {
  logger.info({
    msg: "Running cleanup before exit",
    sessions: sessions.size,
  });

  // Bersihkan semua queue
  await queueService.clearAllQueues();
  // Tidak ada store yang perlu disimpan saat cleanup
};

const init = () => {
  logger.info({
    msg: "Initializing WhatsApp service",
    type: "startup",
  });

  if (!fs.existsSync(sessionsDir())) {
    fs.mkdirSync(sessionsDir());
    logger.info({
      msg: "Created sessions directory",
      path: sessionsDir(),
    });
  }

  const sessions = fs.readdirSync(sessionsDir());
  logger.info({
    msg: "Found existing sessions",
    count: sessions.length,
  });

  sessions.forEach((fileName) => {
    if (
      !(fileName.startsWith("md_") || fileName.startsWith("legacy_")) ||
      fileName.endsWith("_store")
    ) {
      return;
    }

    const parts = fileName.replace(".json", "").split("_");
    const isLegacy = parts[0] !== "md";
    const sessionId = isLegacy
      ? parts.slice(2).join("_")
      : parts.slice(1).join("_");

    logger.info({
      msg: "Restoring session",
      sessionId,
      type: isLegacy ? "legacy" : "md",
    });

    createSession(sessionId, isLegacy);
  });
};

// Menambahkan fungsi untuk membersihkan semua sesi
const cleanupAllSessions = async () => {
  const sessionIds = Array.from(sessions.keys());
  for (const sessionId of sessionIds) {
    await cleanupSession(sessionId);
  }
};

// Tambahkan fungsi shouldReconnect
const shouldReconnect = (statusCode, sessionId) => {
  try {
    // Cek validitas sesi terlebih dahulu
    const sessionDir = path.join(sessionsDir(), `md_${sessionId}`);
    if (
      !fs.existsSync(sessionDir) ||
      !fs.existsSync(path.join(sessionDir, "creds.json"))
    ) {
      logger.info({
        msg: `Session files not found, no reconnection needed`,
        sessionId,
        statusCode,
      });
      return false;
    }

    // Status code yang perlu reconnect
    const reconnectCodes = {
      503: "Service Unavailable",
      515: "Stream Error",
      500: "Internal Server Error",
      408: "Request Timeout",
      428: "Unknown 1",
      undefined: "Unknown Error",
    };

    // Jangan reconnect jika logout atau invalid auth
    if (
      statusCode === DisconnectReason.loggedOut ||
      statusCode === DisconnectReason.invalidSession ||
      statusCode === 401
    ) {
      logger.info({
        msg: `No reconnection needed for status code: ${statusCode}`,
        sessionId,
        statusCode,
      });
      return false;
    }

    // Log reconnection attempt
    if (reconnectCodes[statusCode]) {
      logger.info({
        msg: `Reconnection needed`,
        sessionId,
        statusCode,
        reason: reconnectCodes[statusCode],
      });
      return true;
    }

    return false;
  } catch (error) {
    logger.error({
      msg: `Error in shouldReconnect`,
      sessionId,
      error: error.message,
      stack: error.stack,
    });
    return false;
  }
};

// Tambahkan fungsi helper untuk mention
const createMentionedMessage = async (
  client,
  receiver,
  message = "",
  mentions = []
) => {
  try {
    // Format pesan dengan mention
    const formattedMessage = {
      text: message || "Hello!", // Default message jika kosong
      mentions: mentions, // Array of JID yang akan di-mention
    };

    return formattedMessage;
  } catch (error) {
    console.error("Error creating mentioned message:", error);
    return null;
  }
};

// Tambahkan fungsi untuk mendapatkan participants dari grup
const getGroupParticipants = async (client, groupId) => {
  try {
    const metadata = await client.groupMetadata(groupId);
    return metadata.participants.map((participant) => participant.id);
  } catch (error) {
    console.error("Error getting group participants:", error);
    return [];
  }
};

// Tambahkan fungsi untuk send mention
const sendMentionMessage = async (
  client,
  receiver,
  message = "",
  showTyping = true
) => {
  // Perbaikan: Gunakan Array.from(sessions.entries()) untuk mencari sessionId dari Map
  const sessionEntry = Array.from(sessions.entries()).find(
    ([_, clientObj]) => clientObj === client
  );
  const sessionId = sessionEntry ? sessionEntry[0] : "unknown";

  try {
    const isGroup = receiver.endsWith("@g.us");
    let mentions = [];

    if (isGroup) {
      mentions = await getGroupParticipants(client, receiver);
      console.log(`[${sessionId}] Mentioning to Groups ${receiver}`);
    } else {
      mentions = [receiver];
      console.log(`[${sessionId}] Mentioning to private ${receiver}`);
    }

    // Tampilkan status "sedang mengetik" sebelum mengirim pesan
    if (showTyping) {
      try {
        // Kirim status "composing" (sedang mengetik)
        await client.sendPresenceUpdate("composing", receiver);

        // Tunggu beberapa detik agar tampilan "sedang mengetik" terlihat natural
        const typingDelay = message
          ? Math.min(Math.max(message.length * 40, 1000), 5000)
          : 2000;

        logger.info({
          msg: `[MENTION] Showing typing indicator for ${typingDelay}ms`,
          sessionId,
          receiver,
        });

        await delay(typingDelay);
      } catch (typingError) {
        // Lanjutkan proses pengiriman meskipun ada kesalahan saat menampilkan status mengetik
        logger.warn({
          msg: `[MENTION] Failed to show typing indicator, proceeding with sending`,
          sessionId,
          receiver,
          error: typingError.message,
        });
      }
    }

    const mentionedMessage = await createMentionedMessage(
      client,
      receiver,
      message,
      mentions
    );
    if (!mentionedMessage) {
      throw new Error("Failed to create mentioned message");
    }

    // Setelah menunjukkan typing, kirim status "paused" untuk menghentikan indikator typing
    if (showTyping) {
      try {
        await client.sendPresenceUpdate("paused", receiver);
      } catch (typingError) {
        logger.warn({
          msg: `[MENTION] Failed to reset typing indicator`,
          sessionId,
          receiver,
          error: typingError.message,
        });
      }
    }

    const result = await client.sendMessage(receiver, mentionedMessage);

    logger.info({
      msg: `[MENTION][${sessionId}] Success: Message sent to ${receiver}`,
      sessionId,
      messageId: result?.key?.id,
      mentions: mentions.length,
      message: message || "Hello!",
      receiver,
    });

    return result;
  } catch (error) {
    logger.error({
      msg: `[MENTION][${sessionId}] Error sending mention message`,
      sessionId,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

module.exports = {
  isSessionExists,
  createSession,
  getSession,
  deleteSession,
  getChatList,
  isExists,
  groupFetchAllParticipating,
  sendMessage,
  formatPhone,
  formatGroup,
  cleanup,
  init,
  getSessionStatus,
  cleanupSession,
  cleanupAllSessions,
  sendMentionMessage,
  getGroupParticipants,
  checkAndCleanSessionFolder,
};
