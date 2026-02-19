import { logger } from "../utils/logger";

export function validateRuntimeConfig(options?: { logWarnings?: boolean }) {
  const env = process.env.NODE_ENV || "development";
  const warnings: string[] = [];

  if (env === "production") {
    if (!process.env.ALLOWED_ORIGINS) {
      warnings.push("ALLOWED_ORIGINS is not set; CORS may be too permissive.");
    }
    if (!process.env.FRONTEND_BASE_URL) {
      warnings.push("FRONTEND_BASE_URL is not set.");
    }

    const webConcurrency = Number(process.env.WEB_CONCURRENCY || "1");
    if (webConcurrency > 1 && !process.env.REDIS_URL) {
      warnings.push(
        "WEB_CONCURRENCY > 1 without REDIS_URL. Matchmaking/party memory queue is not multi-instance safe."
      );
    }
  }

  if (options?.logWarnings !== false) {
    for (const message of warnings) {
      logger.warn({ message }, "Runtime configuration warning");
    }
  }

  return {
    env,
    warnings,
    queueMode: process.env.REDIS_URL ? "REDIS" : "MEMORY_SINGLE_INSTANCE",
  };
}
