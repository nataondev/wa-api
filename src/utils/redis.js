const Redis = require("ioredis");
const logger = require("./logger");

// Configure Redis client
const redisConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || "0", 10),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 2000);
    return delay;
  },
};

// Config Upstash dengan konfigurasi yang kompatibel dengan Bull
const upstashConfig = {
  url:
    process.env.UPSTASH_REDIS_URL ||
    `rediss://:${process.env.UPSTASH_REDIS_PASSWORD}@${process.env.UPSTASH_REDIS_ENDPOINT}:${process.env.UPSTASH_REDIS_PORT}`,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

let redisClient;

// if upstash config is not empty, use upstash config
if (process.env.UPSTASH_REDIS_URL || process.env.UPSTASH_REDIS_PASSWORD) {
  redisClient = new Redis(upstashConfig.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  logger.info({
    msg: "Using Upstash Redis",
    url: upstashConfig.url.replace(/\/\/.*@/, "//***@"),
  });
} else {
  redisClient = new Redis(redisConfig);
  logger.info({
    msg: "Using Local Redis",
    host: redisConfig.host,
    port: redisConfig.port,
  });
}

// Redis Event Handlers
redisClient.on("connect", () => {
  logger.info({
    msg: "Redis client connected",
    type: process.env.UPSTASH_REDIS_URL ? "upstash" : "local",
  });
});

redisClient.on("error", (err) => {
  logger.error({
    msg: "Redis client error",
    error: err.message,
    stack: err.stack,
  });
});

redisClient.on("reconnecting", () => {
  logger.warn({
    msg: "Redis client reconnecting",
  });
});

redisClient.on("close", () => {
  logger.warn({
    msg: "Redis connection closed",
  });
});

// Fungsi helper untuk membuat koneksi baru dengan konfigurasi yang sama
redisClient.duplicate = function () {
  if (process.env.UPSTASH_REDIS_URL || process.env.UPSTASH_REDIS_PASSWORD) {
    return new Redis(upstashConfig.url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return new Redis(redisConfig);
};

module.exports = redisClient;
