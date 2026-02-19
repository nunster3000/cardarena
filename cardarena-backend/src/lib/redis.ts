import { logger } from "../utils/logger";

type RedisClient = any;

let client: RedisClient | null = null;
let connecting: Promise<RedisClient | null> | null = null;

export function hasRedisUrl() {
  return Boolean(process.env.REDIS_URL);
}

export async function getRedisClient() {
  if (!hasRedisUrl()) return null;
  if (client?.isOpen) return client;
  if (connecting) return connecting;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createClient } = require("redis");
  const redis = createClient({ url: process.env.REDIS_URL! });
  redis.on("error", (err: unknown) => {
    logger.error({ err }, "Redis client error");
  });

  connecting = redis
    .connect()
    .then(() => {
      client = redis;
      logger.info("Redis client connected");
      return redis;
    })
    .finally(() => {
      connecting = null;
    });

  return connecting;
}
