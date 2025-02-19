const pino = require("pino");

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "yyyy-mm-dd HH:MM:ss",
      ignore: "pid,hostname",
      messageFormat: "{msg}",
    },
  },
  formatters: {
    timestamp: () => `,"time":"${new Date(Date.now()).toLocaleString()}"`,
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
});

module.exports = logger;
