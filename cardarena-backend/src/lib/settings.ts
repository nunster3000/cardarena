import { PrismaClient } from "@prisma/client";

export async function getBooleanSetting(
  db: PrismaClient,
  key: string,
  fallback: boolean
) {
  const setting = await db.appSetting.findUnique({ where: { key } });
  if (!setting) return fallback;
  return setting.value.toLowerCase() === "true";
}

export async function setBooleanSetting(
  db: PrismaClient,
  key: string,
  value: boolean
) {
  return db.appSetting.upsert({
    where: { key },
    update: { value: String(value) },
    create: { key, value: String(value) },
  });
}
