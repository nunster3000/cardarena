import { z } from "zod";

export const createCardSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be under 100 characters"),

  rarity: z.enum(["Common", "Rare", "Epic", "Legendary"]),
});

export const updateCardSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .optional(),

  rarity: z
    .enum(["Common", "Rare", "Epic", "Legendary"])
    .optional(),
});

