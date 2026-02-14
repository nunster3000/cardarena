"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCardSchema = exports.createCardSchema = void 0;
const zod_1 = require("zod");
exports.createCardSchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .min(1, "Name is required")
        .max(100, "Name must be under 100 characters"),
    rarity: zod_1.z.enum(["Common", "Rare", "Epic", "Legendary"]),
});
exports.updateCardSchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .min(1)
        .max(100)
        .optional(),
    rarity: zod_1.z
        .enum(["Common", "Rare", "Epic", "Legendary"])
        .optional(),
});
