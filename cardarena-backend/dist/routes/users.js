"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const express_1 = require("express");
const db_1 = require("../db");
const errorHandler_1 = require("../middleware/errorHandler");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
router.get("/online/count", async (_req, res, next) => {
    try {
        const onlinePlayers = await db_1.prisma.user.count({
            where: { isOnline: true, isFrozen: false },
        });
        res.json({ onlinePlayers });
    }
    catch (err) {
        next(err);
    }
});
router.post("/me/presence", async (req, res, next) => {
    try {
        await db_1.prisma.user.update({
            where: { id: req.userId },
            data: {
                isOnline: true,
                lastSeenAt: new Date(),
            },
        });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
router.post("/me/offline", async (req, res, next) => {
    try {
        await db_1.prisma.user.update({
            where: { id: req.userId },
            data: {
                isOnline: false,
                lastSeenAt: new Date(),
            },
        });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
router.get("/me", async (req, res, next) => {
    try {
        const user = await db_1.prisma.user.findUnique({
            where: { id: req.userId },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                avatarPreset: true,
                avatarUrl: true,
                bio: true,
                isOnline: true,
                wallet: {
                    select: {
                        id: true,
                        balance: true,
                        isFrozen: true,
                    },
                },
            },
        });
        if (!user)
            throw new errorHandler_1.AppError("User not found", 404);
        res.json(user);
    }
    catch (err) {
        next(err);
    }
});
router.put("/me/profile", async (req, res, next) => {
    try {
        const { avatarPreset, avatarUrl, bio } = req.body;
        if (avatarUrl && avatarUrl.length > 300000) {
            throw new errorHandler_1.AppError("Avatar image data is too large", 400);
        }
        const user = await db_1.prisma.user.update({
            where: { id: req.userId },
            data: {
                avatarPreset: avatarPreset ?? undefined,
                avatarUrl: avatarUrl ?? undefined,
                bio: bio ?? undefined,
            },
            select: {
                id: true,
                avatarPreset: true,
                avatarUrl: true,
                bio: true,
            },
        });
        res.json({ success: true, user });
    }
    catch (err) {
        next(err);
    }
});
router.get("/me/ledger", async (req, res, next) => {
    try {
        const take = Math.min(Number(req.query.take) || 200, 500);
        const wallet = await db_1.prisma.wallet.findUnique({
            where: { userId: req.userId },
        });
        if (!wallet)
            throw new errorHandler_1.AppError("Wallet not found", 404);
        const entries = await db_1.prisma.ledger.findMany({
            where: { walletId: wallet.id },
            orderBy: { createdAt: "desc" },
            take,
        });
        res.json({ wallet, entries });
    }
    catch (err) {
        next(err);
    }
});
router.get("/friends", async (req, res, next) => {
    try {
        const [friends, incomingRequests] = await Promise.all([
            db_1.prisma.friend.findMany({
                where: {
                    userId: req.userId,
                    status: client_1.FriendStatus.ACCEPTED,
                },
                include: {
                    friend: {
                        select: {
                            id: true,
                            username: true,
                            avatarPreset: true,
                            avatarUrl: true,
                            isOnline: true,
                            lastSeenAt: true,
                        },
                    },
                },
                orderBy: [{ isTop: "desc" }, { updatedAt: "desc" }],
            }),
            db_1.prisma.friend.findMany({
                where: {
                    friendId: req.userId,
                    status: client_1.FriendStatus.PENDING,
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            avatarPreset: true,
                            avatarUrl: true,
                            isOnline: true,
                            lastSeenAt: true,
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
            }),
        ]);
        res.json({
            friends: friends.map((f) => ({
                id: f.friend.id,
                username: f.friend.username,
                avatarPreset: f.friend.avatarPreset,
                avatarUrl: f.friend.avatarUrl,
                isOnline: f.friend.isOnline,
                lastSeenAt: f.friend.lastSeenAt,
                isTop: f.isTop,
            })),
            incomingRequests: incomingRequests.map((r) => ({
                requestId: r.id,
                from: r.user,
            })),
        });
    }
    catch (err) {
        next(err);
    }
});
router.get("/friends/search", async (req, res, next) => {
    try {
        const q = String(req.query.q || "").trim();
        if (!q || q.length < 2) {
            return res.json({ data: [] });
        }
        const existing = await db_1.prisma.friend.findMany({
            where: { userId: req.userId },
            select: { friendId: true },
        });
        const excludeIds = new Set([req.userId, ...existing.map((e) => e.friendId)]);
        const users = await db_1.prisma.user.findMany({
            where: {
                username: { contains: q, mode: "insensitive" },
                id: { notIn: [...excludeIds] },
            },
            select: {
                id: true,
                username: true,
                avatarPreset: true,
                avatarUrl: true,
                isOnline: true,
            },
            orderBy: { username: "asc" },
            take: 20,
        });
        res.json({ data: users });
    }
    catch (err) {
        next(err);
    }
});
router.post("/friends/request", async (req, res, next) => {
    try {
        const friendId = String(req.body.friendId || "");
        if (!friendId)
            throw new errorHandler_1.AppError("friendId is required", 400);
        if (friendId === req.userId)
            throw new errorHandler_1.AppError("Cannot add yourself", 400);
        const friend = await db_1.prisma.user.findUnique({ where: { id: friendId } });
        if (!friend)
            throw new errorHandler_1.AppError("Player not found", 404);
        const existing = await db_1.prisma.friend.findUnique({
            where: {
                userId_friendId: { userId: req.userId, friendId },
            },
        });
        if (existing) {
            throw new errorHandler_1.AppError("Friend request already exists", 400);
        }
        const reverse = await db_1.prisma.friend.findUnique({
            where: {
                userId_friendId: { userId: friendId, friendId: req.userId },
            },
        });
        if (reverse?.status === client_1.FriendStatus.PENDING) {
            await db_1.prisma.$transaction(async (tx) => {
                await tx.friend.update({
                    where: { id: reverse.id },
                    data: { status: client_1.FriendStatus.ACCEPTED, acceptedAt: new Date() },
                });
                await tx.friend.create({
                    data: {
                        userId: req.userId,
                        friendId,
                        status: client_1.FriendStatus.ACCEPTED,
                        acceptedAt: new Date(),
                    },
                });
            });
            return res.json({ success: true, message: "Friend request auto-accepted" });
        }
        await db_1.prisma.friend.create({
            data: {
                userId: req.userId,
                friendId,
                status: client_1.FriendStatus.PENDING,
            },
        });
        res.json({ success: true, message: "Friend request sent" });
    }
    catch (err) {
        next(err);
    }
});
router.post("/friends/:requestId/accept", async (req, res, next) => {
    try {
        const request = await db_1.prisma.friend.findUnique({
            where: { id: req.params.requestId },
        });
        if (!request || request.friendId !== req.userId) {
            throw new errorHandler_1.AppError("Friend request not found", 404);
        }
        if (request.status !== client_1.FriendStatus.PENDING) {
            throw new errorHandler_1.AppError("Request is not pending", 400);
        }
        await db_1.prisma.$transaction(async (tx) => {
            await tx.friend.update({
                where: { id: request.id },
                data: { status: client_1.FriendStatus.ACCEPTED, acceptedAt: new Date() },
            });
            const reverse = await tx.friend.findUnique({
                where: {
                    userId_friendId: {
                        userId: req.userId,
                        friendId: request.userId,
                    },
                },
            });
            if (reverse) {
                await tx.friend.update({
                    where: { id: reverse.id },
                    data: { status: client_1.FriendStatus.ACCEPTED, acceptedAt: new Date() },
                });
            }
            else {
                await tx.friend.create({
                    data: {
                        userId: req.userId,
                        friendId: request.userId,
                        status: client_1.FriendStatus.ACCEPTED,
                        acceptedAt: new Date(),
                    },
                });
            }
        });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
router.post("/friends/:requestId/reject", async (req, res, next) => {
    try {
        const request = await db_1.prisma.friend.findUnique({
            where: { id: req.params.requestId },
        });
        if (!request || request.friendId !== req.userId) {
            throw new errorHandler_1.AppError("Friend request not found", 404);
        }
        await db_1.prisma.friend.update({
            where: { id: request.id },
            data: { status: client_1.FriendStatus.REJECTED },
        });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
router.post("/friends/:friendId/top", async (req, res, next) => {
    try {
        const friendId = req.params.friendId;
        const isTop = Boolean(req.body.isTop);
        const relationship = await db_1.prisma.friend.findUnique({
            where: { userId_friendId: { userId: req.userId, friendId } },
        });
        if (!relationship || relationship.status !== client_1.FriendStatus.ACCEPTED) {
            throw new errorHandler_1.AppError("Friend not found", 404);
        }
        if (isTop) {
            const topCount = await db_1.prisma.friend.count({
                where: {
                    userId: req.userId,
                    status: client_1.FriendStatus.ACCEPTED,
                    isTop: true,
                },
            });
            if (topCount >= 8) {
                throw new errorHandler_1.AppError("Top friends limit is 8", 400);
            }
        }
        const updated = await db_1.prisma.friend.update({
            where: { id: relationship.id },
            data: { isTop },
            select: { id: true, isTop: true },
        });
        res.json({ success: true, relationship: updated });
    }
    catch (err) {
        next(err);
    }
});
router.delete("/friends/:friendId", async (req, res, next) => {
    try {
        const friendId = req.params.friendId;
        await db_1.prisma.$transaction(async (tx) => {
            await tx.friend.deleteMany({
                where: {
                    OR: [
                        { userId: req.userId, friendId },
                        { userId: friendId, friendId: req.userId },
                    ],
                },
            });
        });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
