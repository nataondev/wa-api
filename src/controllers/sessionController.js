const Joi = require("joi");
const {
  createSession,
  getSessionStatus,
  deleteSession,
  checkAndCleanSessionFolder,
} = require("../services/whatsappService");
const whatsappService = require("../services/whatsappService");
const { sendResponse } = require("../utils/response");
const httpStatusCode = require("../constants/httpStatusCode");
const logger = require("../utils/logger");

module.exports = {
  async status(req, res) {
    const schema = Joi.object({
      sessionId: Joi.string().required(),
    });

    const { error } = schema.validate(req.params);

    if (error) {
      return sendResponse(
        res,
        httpStatusCode.BAD_REQUEST,
        error.details[0].message
      );
    }

    const { sessionId } = req.params;
    try {
      const session = await getSessionStatus(sessionId);
      logger.info({
        msg: "Session status retrieved",
        sessionId,
        status: session.status,
      });

      return sendResponse(
        res,
        httpStatusCode.OK,
        "Session status retrieved successfully",
        { session }
      );
    } catch (error) {
      logger.error({
        msg: "Error getting session status",
        sessionId,
        error: error.message,
        stack: error.stack,
      });
      return sendResponse(
        res,
        httpStatusCode.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }
  },

  async create(req, res) {
    const schema = Joi.object({
      sessionId: Joi.required(),
    });
    const { error } = schema.validate(req.params);

    if (error) {
      return sendResponse(
        res,
        httpStatusCode.BAD_REQUEST,
        error.details[0].message
      );
    }
    const { sessionId } = req.params;

    try {
      logger.info({
        msg: "Creating new session",
        sessionId,
      });
      await createSession(sessionId, false, res);
    } catch (error) {
      logger.error({
        msg: "Error creating session",
        sessionId,
        error: error.message,
        stack: error.stack,
      });
      return sendResponse(
        res,
        httpStatusCode.INTERNAL_SERVER_ERROR,
        "Failed to create session",
        null,
        error
      );
    }
  },

  async logout(req, res) {
    const schema = Joi.object({
      sessionId: Joi.required(),
    });
    const { error } = schema.validate(req.params);

    if (error) {
      return sendResponse(
        res,
        httpStatusCode.BAD_REQUEST,
        error.details[0].message
      );
    }

    const { sessionId } = req.params;
    try {
      logger.info({
        msg: "Logging out session",
        sessionId,
      });

      const checkDir = await checkAndCleanSessionFolder(sessionId);
      if (!checkDir) {
        return sendResponse(res, httpStatusCode.NOT_FOUND, "Session not found");
      }

      await deleteSession(sessionId, false);
      return sendResponse(
        res,
        httpStatusCode.OK,
        "Session deleted successfully"
      );
    } catch (error) {
      logger.error({
        msg: "Error logging out session",
        sessionId,
        error: error.message,
        stack: error.stack,
      });
      return sendResponse(
        res,
        httpStatusCode.INTERNAL_SERVER_ERROR,
        "Failed to logout session",
        null,
        error
      );
    }
  },

  async getGroups(req, res) {
    const { sessionId } = req.params;

    try {
      const client = whatsappService.getSession(sessionId);
      if (!client) {
        return sendResponse(res, httpStatusCode.NOT_FOUND, "Session not found");
      }

      // Ambil daftar grup
      const groups = await whatsappService.getChatList(sessionId, true);

      // Format response
      const formattedGroups = groups.map((group) => ({
        id: group.id,
        name: group.name,
        participant_count: group.participant_count || 0,
        creation_time: group.creation_time,
      }));

      return sendResponse(
        res,
        httpStatusCode.OK,
        "Groups retrieved successfully",
        {
          groups: formattedGroups,
        }
      );
    } catch (error) {
      logger.error({
        msg: "Error getting groups",
        sessionId,
        error: error.message,
        stack: error.stack,
      });
      return sendResponse(
        res,
        httpStatusCode.INTERNAL_SERVER_ERROR,
        "Failed to get groups",
        null,
        error
      );
    }
  },
};
