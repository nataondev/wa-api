require("dotenv").config();
const express = require("express");
const nodeCleanup = require("node-cleanup");
const routes = require("./src/routes/index.js");
const whatsappService = require("./src/services/whatsappService.js");
const cors = require("cors");
const { cleanupAllSessions } = require("./src/services/whatsappService");
const logger = require("./src/utils/logger");

const app = express();

const PORT = process.env.APP_PORT || 3000;
const HOST = process.env.NODE_ENV === "production" ? "0.0.0.0" : "localhost";

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use("/", routes);

const listenerCallback = function () {
  whatsappService.init();
  logger.info({
    msg: "Server started",
    host: HOST,
    port: PORT,
    env: process.env.NODE_ENV,
  });
};

app.listen(PORT, HOST, listenerCallback);

// Menambahkan handler untuk graceful shutdown
nodeCleanup((exitCode, signal) => {
  logger.info({
    msg: "Cleaning up before shutdown",
    exitCode,
    signal,
  });

  cleanupAllSessions()
    .then(() => {
      logger.info({
        msg: "All sessions cleaned up successfully",
      });
      process.exit(exitCode);
    })
    .catch((error) => {
      logger.error({
        msg: "Error during cleanup",
        error: error.message,
        stack: error.stack,
      });
      process.exit(1);
    });

  // Mencegah exit langsung, menunggu cleanup selesai
  nodeCleanup.uninstall();
  return false;
});

module.exports = app;
