import { Router } from "express";
import { prisma } from "../db";
import { authMiddleware, requireRole } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();

/**
 * GET /api/v1/admin/users
 * Get all users (ADMIN only)
 */
router.get(
  "/users",
  authMiddleware,
  requireRole("ADMIN"),
  async (req, res, next) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({ data: users });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/v1/admin/users/:id/role
 * Change a user's role (ADMIN only)
 */
router.patch(
  "/users/:id/role",
  authMiddleware,
  requireRole("ADMIN"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!role) {
        throw new AppError("Role is required", 400);
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        data: { role },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
        },
      });

      res.json(updatedUser);
    } catch (err) {
      next(err);
    }
  }
);

export default router;

