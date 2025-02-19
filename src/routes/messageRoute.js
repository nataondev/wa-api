const router = require("express").Router();
const messageController = require("../controllers/messageController");
const apikeyValidator = require("../middlewares/apikeyValidator");
const jsonResponse = require("../middlewares/jsonResponse");

// Endpoint untuk mengirim pesan (teks & media)
router.post("/send", [apikeyValidator], messageController.sendMessage);

// New mention route
router.post(
  "/mention",
  [apikeyValidator],
  messageController.sendMentionMessage
);

module.exports = router;
