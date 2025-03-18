const Joi = require("joi");
const whatsappService = require("../services/whatsappService");
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
      showTyping: Joi.boolean().default(true),
    });

    const { error } = schema.validate(req.body);
    if (error) {
      return sendResponse(
        res,
        httpStatusCode.BAD_REQUEST,
        error.details[0].message
      );
    }

    const { sender, receiver, message, file, viewOnce, showTyping } = req.body;

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
        // Periksa apakah nomor valid, kecuali untuk grup
        try {
          // Skip pengecekan jika tujuannya adalah grup (ditandai dengan @g.us di akhir)
          if (!formattedReceivers[0].endsWith("@g.us")) {
            const isValid = await whatsappService.isExists(
              client,
              formattedReceivers[0]
            );
            if (!isValid) {
              return sendResponse(
                res,
                httpStatusCode.BAD_REQUEST,
                "Invalid phone number"
              );
            }
          }
        } catch (error) {
          logger.warn({
            msg: `[${sender}] Error checking phone number`,
            error: error.message,
          });
        }

        logger.info({
          msg: `[${sender}] Sending message to ${formattedReceivers[0]}`,
        });

        // Kirim pesan (sudah menggunakan antrian di whatsappService)
        try {
          logger.info({
            msg: `[${sender}] About to call whatsappService.sendMessage`,
            receiver: formattedReceivers[0],
          });

          const sendResult = await whatsappService.sendMessage(
            client,
            formattedReceivers[0],
            formattedMessage,
            5,
            showTyping
          );

          logger.info({
            msg: `[${sender}] sendMessage result received`,
            receiver: formattedReceivers[0],
            resultType: typeof sendResult,
            resultKeys: sendResult ? Object.keys(sendResult) : [],
            messageId: sendResult?.key?.id || null,
          });

          result = {
            sender,
            receiver: formattedReceivers[0],
            message: formattedMessage.text || message,
            file: file || null,
            viewOnce: viewOnce || false,
            messageId: sendResult?.key?.id || null,
          };
        } catch (sendError) {
          logger.error({
            msg: `[${sender}] Error calling sendMessage`,
            receiver: formattedReceivers[0],
            error: sendError.message,
            stack: sendError.stack,
          });
          throw sendError;
        }
      }
      // Kirim ke banyak penerima
      else {
        logger.info({
          msg: `[${sender}] Sending message to ${formattedReceivers.length} receivers`,
        });

        const results = [];
        const invalidNumbers = [];

        // Gunakan Promise.all untuk pengecekan dan pengiriman asinkron
        const sendPromises = formattedReceivers.map(async (receiver) => {
          try {
            // Periksa nomor telepon kecuali untuk grup
            if (!receiver.endsWith("@g.us")) {
              const isValid = await whatsappService.isExists(client, receiver);
              if (!isValid) {
                invalidNumbers.push(receiver);
                return;
              }
            }

            // Kirim pesan
            const sendResult = await whatsappService.sendMessage(
              client,
              receiver,
              formattedMessage,
              5,
              showTyping
            );

            results.push({
              receiver,
              message: formattedMessage.text || message,
              file: file || null,
              viewOnce: viewOnce || false,
              messageId: sendResult?.key?.id || null,
              status: "sent",
            });
          } catch (error) {
            results.push({
              receiver,
              message: formattedMessage.text || message,
              file: file || null,
              viewOnce: viewOnce || false,
              error: error.message,
              status: "failed",
            });
          }
        });

        await Promise.all(sendPromises);

        result = {
          total: formattedReceivers.length,
          sent: results.filter((r) => r.status === "sent").length,
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
        "Message sent successfully",
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
      showTyping: Joi.boolean().default(true),
    });

    const { error } = schema.validate(req.body);
    if (error) {
      return sendResponse(
        res,
        httpStatusCode.BAD_REQUEST,
        error.details[0].message
      );
    }

    const { sender, receiver, message, showTyping } = req.body;

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
        message,
        showTyping
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
          sender,
          receiver: formattedReceiver,
          message: message || "Hello!",
          messageId: result?.key?.id,
          mentions: result.mentions,
          file: null,
          viewOnce: false,
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
