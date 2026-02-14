"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const requireAdmin_1 = require("../middleware/requireAdmin");
const router = (0, express_1.Router)();
/**
 * GET /users
 * Fetch all users (no passwords)
 */
router.get("/", auth_1.authMiddleware, requireAdmin_1.requireAdmin, async (req, res) => {
    try {
        const users = await db_1.prisma.user.findMany({
            select: {
                id: true,
                username: true,
                createdAt: true,
            },
        });
        res.json(users);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch users" });
    }
});
exports.default = router;
