"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const card_schema_1 = require("../validation/card.schema");
const errorHandler_1 = require("../middleware/errorHandler");
const router = (0, express_1.Router)();
/**
 * GET /cards
 */
router.get("/", auth_1.authMiddleware, async (req, res, next) => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        if (page < 1 || limit < 1) {
            throw new errorHandler_1.AppError("Invalid pagination parameters", 400);
        }
        const skip = (page - 1) * limit;
        const [cards, total] = await Promise.all([
            db_1.prisma.card.findMany({
                where: { ownerId: req.userId },
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
            }),
            db_1.prisma.card.count({
                where: { ownerId: req.userId },
            }),
        ]);
        res.json({
            data: cards,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /cards
 */
router.post("/", auth_1.authMiddleware, async (req, res, next) => {
    try {
        const parsed = card_schema_1.createCardSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new errorHandler_1.AppError("Invalid request data", 400);
        }
        const card = await db_1.prisma.card.create({
            data: {
                ...parsed.data,
                ownerId: req.userId,
            },
        });
        res.status(201).json(card);
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /cards/:id
 */
router.get("/:id", auth_1.authMiddleware, async (req, res, next) => {
    try {
        const { id } = req.params;
        const card = await db_1.prisma.card.findUnique({
            where: { id },
        });
        if (!card) {
            throw new errorHandler_1.AppError("Card not found", 404);
        }
        if (card.ownerId !== req.userId) {
            throw new errorHandler_1.AppError("Not authorized to view this card", 403);
        }
        res.json(card);
    }
    catch (err) {
        next(err);
    }
});
/**
 * DELETE /cards/:id
 */
router.delete("/:id", auth_1.authMiddleware, async (req, res, next) => {
    try {
        const { id } = req.params;
        const card = await db_1.prisma.card.findUnique({
            where: { id },
        });
        if (!card) {
            throw new errorHandler_1.AppError("Card not found", 404);
        }
        if (card.ownerId !== req.userId) {
            throw new errorHandler_1.AppError("Not authorized to delete this card", 403);
        }
        await db_1.prisma.card.delete({
            where: { id },
        });
        res.json({ message: "Card deleted successfully" });
    }
    catch (err) {
        next(err);
    }
});
/**
 * PUT /cards/:id
 */
router.put("/:id", auth_1.authMiddleware, async (req, res, next) => {
    try {
        const { id } = req.params;
        const parsed = card_schema_1.updateCardSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new errorHandler_1.AppError("Invalid request data", 400);
        }
        const existingCard = await db_1.prisma.card.findUnique({
            where: { id },
        });
        if (!existingCard) {
            throw new errorHandler_1.AppError("Card not found", 404);
        }
        if (existingCard.ownerId !== req.userId) {
            throw new errorHandler_1.AppError("Not authorized to update this card", 403);
        }
        const updatedCard = await db_1.prisma.card.update({
            where: { id },
            data: parsed.data,
        });
        res.json(updatedCard);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
