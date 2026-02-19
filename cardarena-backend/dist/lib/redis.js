"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasRedisUrl = hasRedisUrl;
exports.getRedisClient = getRedisClient;
const logger_1 = require("../utils/logger");
let client = null;
let connecting = null;
function hasRedisUrl() {
    return Boolean(process.env.REDIS_URL);
}
async function getRedisClient() {
    if (!hasRedisUrl())
        return null;
    if (client?.isOpen)
        return client;
    if (connecting)
        return connecting;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createClient } = require("redis");
    const redis = createClient({ url: process.env.REDIS_URL });
    redis.on("error", (err) => {
        logger_1.logger.error({ err }, "Redis client error");
    });
    connecting = redis
        .connect()
        .then(() => {
        client = redis;
        logger_1.logger.info("Redis client connected");
        return redis;
    })
        .finally(() => {
        connecting = null;
    });
    return connecting;
}
