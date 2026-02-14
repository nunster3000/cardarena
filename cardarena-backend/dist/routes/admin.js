"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const router = (0, express_1.Router)();
/**
 * GET /api/v1/admin/users
 * Get all users (ADMIN only)
 */
router.get("/users", auth_1.authMiddleware, (0, auth_1.requireRole)("ADMIN"), async (req, res, next) => {
    try {
        const users = await db_1.prisma.user.findMany({
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
    }
    catch (err) {
        next(err);
    }
});
/**
 * PATCH /api/v1/admin/users/:id/role
 * Change a user's role (ADMIN only)
 */
router.patch("/users/:id/role", auth_1.authMiddleware, (0, auth_1.requireRole)("ADMIN"), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        if (!role) {
            throw new errorHandler_1.AppError("Role is required", 400);
        }
        const updatedUser = await db_1.prisma.user.update({
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
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
