const Joi = require("joi");
const whatsappService = require("../services/whatsappService");
const queueService = require("../services/queueService");
const { categorizeFile } = require("../utils/general");
const { sendResponse } = require("../utils/response");
const httpStatusCode = require("../constants/httpStatusCode");
const logger = require("../utils/logger");

const checkFormatMedia = async (file, message, viewOnce) => {
  try {
    if (!file) {
      return null;
    }

    // Validasi URL terlebih dahulu
    const fileResponse = await fetch(file, { method: "HEAD" });
    if (!fileResponse.ok) {
      console.error("Invalid file URL:", file);
      return null;
    }

    // Kategorisasi file
    const categoryFile = categorizeFile(fileResponse);
    if (!categoryFile) {
      console.error("Failed to categorize file:", file);
      return null;
    }

    return {
      ...categoryFile,
      caption: message,
      viewOnce: viewOnce || false,
    };
  } catch (error) {
    console.error("Error checking media format:", error);
    return null;
  }
};

module.exports = {
  async sendMessage(req, res) {
    const schema = Joi.object({
      sender: Joi.string().required(),
      receiver: Joi.string().required(),
      message: Joi.string().required(),
      file: Joi.string(),
      viewOnce: Joi.boolean().default(false),
    });

    const { error } = schema.validate(req.body);
    if (error) {
      return sendResponse(
        res,
        httpStatusCode.BAD_REQUEST,
        error.details[0].message
      );
    }

    const { sender, receiver, message, file, viewOnce } = req.body;

    try {
      const client = whatsappService.getSession(sender);
      if (!client) {
        return sendResponse(res, httpStatusCode.NOT_FOUND, "Session not found");
      }

      // Format pesan dasar
      let formattedMessage = { text: message };

      // Cek dan format media jika ada
      if (file && file !== "") {
        const formattedMedia = await checkFormatMedia(file, message, viewOnce);
        if (!formattedMedia) {
          return sendResponse(
            res,
            httpStatusCode.BAD_REQUEST,
            "Invalid media file or URL"
          );
        }
        formattedMessage = formattedMedia;
      }

      // Format dan validasi penerima
      const receiverParts = receiver.split(/[,|]/);
      const formattedReceivers = receiverParts
        .map((part) => part.trim())
        .filter(Boolean) // Hapus string kosong
        .map(whatsappService.formatPhone);

      if (formattedReceivers.length === 0) {
        return sendResponse(
          res,
          httpStatusCode.BAD_REQUEST,
          "No valid receivers provided"
        );
      }

      let result;
      // Kirim ke satu penerima
      if (formattedReceivers.length === 1) {
        if (!whatsappService.isExists(client, formattedReceivers[0])) {
          return sendResponse(
            res,
            httpStatusCode.BAD_REQUEST,
            "Invalid phone number"
          );
        }

        logger.info({
          msg: `[${sender}] Sending message to ${formattedReceivers[0]}`,
        });

        // Kirim pesan (sudah menggunakan antrian di whatsappService)
        const sendResult = await whatsappService.sendMessage(
          client,
          formattedReceivers[0],
          formattedMessage
        );

        result = {
          sender,
          receiver: formattedReceivers[0],
          message: formattedMessage,
          messageId: sendResult?.key?.id || null,
        };
      }
      // Kirim ke banyak penerima
      else {
        logger.info({
          msg: `[${sender}] Sending message to ${formattedReceivers.length} receivers`,
        });

        const results = [];
        const invalidNumbers = [];
        const sendPromises = formattedReceivers.map(async (receiver) => {
          if (!whatsappService.isExists(client, receiver)) {
            invalidNumbers.push(receiver);
            return;
          }

          try {
            const sendResult = await whatsappService.sendMessage(
              client,
              receiver,
              formattedMessage
            );
            results.push({
              receiver,
              messageId: sendResult?.key?.id || null,
              status: "queued",
            });
          } catch (error) {
            results.push({
              receiver,
              error: error.message,
              status: "failed",
            });
          }
        });

        await Promise.all(sendPromises);

        result = {
          total: formattedReceivers.length,
          queued: results.filter((r) => r.status === "queued").length,
          failed: results.filter((r) => r.status === "failed").length,
          invalid: invalidNumbers.length,
          details: {
            results,
            invalidNumbers,
          },
        };
      }

      return sendResponse(
        res,
        httpStatusCode.OK,
        "Message queued successfully",
        result
      );
    } catch (error) {
      logger.error({
        msg: `[${sender}] Error queueing message`,
        error: error.message,
        stack: error.stack,
      });
      return sendResponse(
        res,
        httpStatusCode.INTERNAL_SERVER_ERROR,
        "Failed to queue message",
        null,
        error
      );
    }
  },

  // Tambahkan fungsi untuk handle mention message
  async sendMentionMessage(req, res) {
    const schema = Joi.object({
      sender: Joi.string().required(),
      receiver: Joi.string().required(),
      message: Joi.string().allow(""), // Message bisa kosong
    });

    const { error } = schema.validate(req.body);
    if (error) {
      return sendResponse(
        res,
        httpStatusCode.BAD_REQUEST,
        error.details[0].message
      );
    }

    const { sender, receiver, message } = req.body;

    try {
      const client = whatsappService.getSession(sender);
      if (!client) {
        return sendResponse(res, httpStatusCode.NOT_FOUND, "Session not found");
      }

      const formattedReceiver = whatsappService.formatPhone(receiver);
      logger.info({
        msg: `[MENTION][${sender}] Formatting receiver ${receiver} -> ${formattedReceiver}`,
        sender,
        originalReceiver: receiver,
        formattedReceiver,
      });

      const result = await whatsappService.sendMentionMessage(
        client,
        formattedReceiver,
        message
      );

      logger.info({
        msg: `[MENTION][${sender}] Controller: Message sent successfully`,
        sender,
        receiver: formattedReceiver,
        messageId: result?.key?.id,
      });

      return sendResponse(
        res,
        httpStatusCode.OK,
        "Mention message sent successfully",
        {
          messageId: result?.key?.id,
          receiver: formattedReceiver,
          message: message || "Hello!",
          mentions: result.mentions,
        }
      );
    } catch (error) {
      logger.error({
        msg: `[MENTION][${sender}] Controller Error`,
        sender,
        error: error.message,
        stack: error.stack,
      });
      return sendResponse(
        res,
        httpStatusCode.INTERNAL_SERVER_ERROR,
        "Failed to send mention message",
        null,
        error
      );
    }
  },
};
