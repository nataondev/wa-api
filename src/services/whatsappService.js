const fs = require("fs");
const path = require("path");

const pino = require("pino");
const { toDataURL } = require("qrcode");
const { sendResponse } = require("../utils/response");
const httpStatusCode = require("../constants/httpStatusCode");
const util = require("util");
const logger = require("../utils/logger");

const readFileAsync = util.promisify(fs.readFile);
const {
  makeWASocket,
  DisconnectReason,
  makeInMemoryStore,
  useMultiFileAuthState,
  delay,
  Browsers,
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
      logger.info({
        msg: "Starting session cleanup",
        sessionId,
      });

      session.ev.removeAllListeners("connection.update");
      session.ev.removeAllListeners("creds.update");
      session.ev.removeAllListeners("chats.set");
      session.ev.removeAllListeners("messages.update");

      await session.ws.close();

      if (session.store) {
        session.store.writeToFile(sessionsDir(sessionId + "_store.json"));
        logger.info({
          msg: "Store saved to file",
          sessionId,
        });
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

        // Hapus file store jika ada
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
    // Log start creating session
    logger.info({
      msg: `Starting session creation`,
      sessionId,
      isLegacy,
    });

    await checkAndCleanSessionFolder(sessionId);
    await cleanupSession(sessionId);

    const store = makeInMemoryStore({ logger: pino({ level: "silent" }) });
    const { state, saveCreds } = await useMultiFileAuthState(
      sessionsDir(`md_${sessionId}`)
    );

    const client = makeWASocket({
      printQRInTerminal: true,
      browser: Browsers.ubuntu("Chrome"),
      auth: state,
      logger: pino({ level: "silent" }),
    });

    store.bind(client.ev);
    sessions.set(sessionId, { ...client, store, isLegacy });

    let connectionTimeout;
    let hasResponded = false;

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

const getChatList = (sessionId, isGroup = false) => {
  try {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    const chatType = isGroup ? "@g.us" : "@s.whatsapp.net";
    const chats = session.store.chats.filter((chat) => {
      return chat.id.endsWith(chatType);
    });

    // Format data untuk grup
    if (isGroup) {
      return chats.map((chat) => ({
        id: chat.id,
        name: chat.name || "Unknown Group",
        participant_count: chat.participantCount || 0,
        creation_time: chat.creationTime || new Date().toISOString(),
      }));
    }

    return chats;
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

    return chatInfo.exists;
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

const sendMessage = async (client, chatId, message, delayTime = 5) => {
  try {
    return client.sendMessage(chatId, message);
  } catch (err) {
    return Promise.reject(null);
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

const cleanup = () => {
  logger.info({
    msg: "Running cleanup before exit",
    sessions: sessions.size,
  });
  sessions.forEach((client, sessionId) => {
    if (!client.isLegacy) {
      client.store.writeToFile(sessionsDir(sessionId + "_store.json"));
      logger.info({
        msg: "Store written to file",
        sessionId,
      });
    }
  });
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
const sendMentionMessage = async (client, receiver, message = "") => {
  const sessionId =
    Object.keys(sessions).find((key) => sessions[key] === client) || "unknown";

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

    const mentionedMessage = await createMentionedMessage(
      client,
      receiver,
      message,
      mentions
    );
    if (!mentionedMessage) {
      throw new Error("Failed to create mentioned message");
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
