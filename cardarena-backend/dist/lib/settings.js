"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBooleanSetting = getBooleanSetting;
exports.setBooleanSetting = setBooleanSetting;
async function getBooleanSetting(db, key, fallback) {
    const setting = await db.appSetting.findUnique({ where: { key } });
    if (!setting)
        return fallback;
    return setting.value.toLowerCase() === "true";
}
async function setBooleanSetting(db, key, value) {
    return db.appSetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
    });
}
