const Redis = require('ioredis');
const logger = require('./logger');

// Configure Redis client
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 2000);
    return delay;
  },
};

// Create Redis Client
const redisClient = new Redis(redisConfig);

// Redis Event Handlers
redisClient.on('connect', () => {
  logger.info({
    msg: 'Redis client connected',
    host: redisConfig.host,
    port: redisConfig.port,
  });
});

redisClient.on('error', (err) => {
  logger.error({
    msg: 'Redis client error',
    error: err.message,
    stack: err.stack,
  });
});

redisClient.on('reconnecting', () => {
  logger.warn({
    msg: 'Redis client reconnecting',
  });
});

redisClient.on('close', () => {
  logger.warn({
    msg: 'Redis connection closed',
  });
});

module.exports = redisClient; 