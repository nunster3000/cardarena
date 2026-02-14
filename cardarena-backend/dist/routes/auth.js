"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const router = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
/**
 * POST /auth/register
 */
router.post("/register", async (req, res, next) => {
    try {
        const { email, username, password } = req.body;
        if (!email || !username || !password) {
            throw new errorHandler_1.AppError("email, username, and password required", 400);
        }
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        const result = await db_1.prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    email,
                    username,
                    password: hashedPassword,
                },
            });
            await tx.wallet.create({
                data: {
                    userId: user.id,
                },
            });
            return user;
        });
        res.status(201).json({
            id: result.id,
            email: result.email,
            username: result.username,
            role: result.role,
            createdAt: result.createdAt,
        });
    }
    catch (err) {
        if (err.code === "P2002") {
            return res.status(409).json({
                error: "Email or username already exists",
            });
        }
        next(err);
    }
});
/**
 * POST /auth/login
 */
router.post("/login", async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            throw new errorHandler_1.AppError("Email and password required", 400);
        }
        const user = await db_1.prisma.user.findUnique({
            where: { email },
        });
        if (!user) {
            throw new errorHandler_1.AppError("Invalid credentials", 401);
        }
        const isValid = await bcrypt_1.default.compare(password, user.password);
        if (!isValid) {
            throw new errorHandler_1.AppError("Invalid credentials", 401);
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: "15m" });
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                role: user.role,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /auth/me
 */
router.get("/me", auth_1.authMiddleware, async (req, res, next) => {
    try {
        if (!req.userId) {
            throw new errorHandler_1.AppError("Not authenticated", 401);
        }
        const user = await db_1.prisma.user.findUnique({
            where: { id: req.userId },
            select: {
                id: true,
                email: true,
                username: true,
                role: true,
                createdAt: true,
            },
        });
        if (!user) {
            throw new errorHandler_1.AppError("User not found", 404);
        }
        res.json(user);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
