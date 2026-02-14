import { Router } from "express";
import { prisma } from "../db";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { createCardSchema, updateCardSchema } from "../validation/card.schema";
import { AppError } from "../middleware/errorHandler";

const router = Router();

/**
 * GET /cards
 */
router.get("/", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    if (page < 1 || limit < 1) {
      throw new AppError("Invalid pagination parameters", 400);
    }

    const skip = (page - 1) * limit;

    const [cards, total] = await Promise.all([
      prisma.card.findMany({
        where: { ownerId: req.userId! },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.card.count({
        where: { ownerId: req.userId! },
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
  } catch (err) {
    next(err);
  }
});

/**
 * POST /cards
 */
router.post("/", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const parsed = createCardSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError("Invalid request data", 400);
    }

    const card = await prisma.card.create({
      data: {
        ...parsed.data,
        ownerId: req.userId!,
      },
    });

    res.status(201).json(card);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /cards/:id
 */
router.get("/:id", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;

    const card = await prisma.card.findUnique({
      where: { id },
    });

    if (!card) {
      throw new AppError("Card not found", 404);
    }

    if (card.ownerId !== req.userId) {
      throw new AppError("Not authorized to view this card", 403);
    }

    res.json(card);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /cards/:id
 */
router.delete("/:id", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;

    const card = await prisma.card.findUnique({
      where: { id },
    });

    if (!card) {
      throw new AppError("Card not found", 404);
    }

    if (card.ownerId !== req.userId) {
      throw new AppError("Not authorized to delete this card", 403);
    }

    await prisma.card.delete({
      where: { id },
    });

    res.json({ message: "Card deleted successfully" });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /cards/:id
 */
router.put("/:id", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;

    const parsed = updateCardSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError("Invalid request data", 400);
    }

    const existingCard = await prisma.card.findUnique({
      where: { id },
    });

    if (!existingCard) {
      throw new AppError("Card not found", 404);
    }

    if (existingCard.ownerId !== req.userId) {
      throw new AppError("Not authorized to update this card", 403);
    }

    const updatedCard = await prisma.card.update({
      where: { id },
      data: parsed.data,
    });

    res.json(updatedCard);
  } catch (err) {
    next(err);
  }
});

export default router;

