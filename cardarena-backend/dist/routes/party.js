"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPartyHealth = getPartyHealth;
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const express_1 = require("express");
const db_1 = require("../db");
const matchmaking_1 = require("../game/matchmaking");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const userComms_1 = require("../lib/userComms");
const MAX_PARTY_SIZE = 4;
const parties = new Map();
const partyByUser = new Map();
const invites = new Map();
const invitesByUser = new Map();
function getPartyHealth() {
    return {
        mode: "MEMORY_SINGLE_INSTANCE",
        partyCount: parties.size,
        inviteCount: invites.size,
        usersInParty: partyByUser.size,
    };
}
function getPartyForUser(userId) {
    const partyId = partyByUser.get(userId);
    if (!partyId)
        return null;
    return parties.get(partyId) || null;
}
function addInviteForUser(userId, inviteId) {
    const existing = invitesByUser.get(userId) || new Set();
    existing.add(inviteId);
    invitesByUser.set(userId, existing);
}
function removeInvite(invite) {
    invites.delete(invite.id);
    const set = invitesByUser.get(invite.toUserId);
    if (set) {
        set.delete(invite.id);
        if (!set.size)
            invitesByUser.delete(invite.toUserId);
    }
}
function disbandParty(party) {
    for (const member of party.members) {
        partyByUser.delete(member.userId);
    }
    parties.delete(party.id);
}
async function buildPartyResponse(party, userId) {
    if (!party)
        return null;
    const users = await db_1.prisma.user.findMany({
        where: { id: { in: party.members.map((m) => m.userId) } },
        select: { id: true, username: true, avatarPreset: true, avatarUrl: true, isOnline: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return {
        id: party.id,
        leaderId: party.leaderId,
        isLeader: party.leaderId === userId,
        queue: party.queue,
        members: party.members.map((m) => ({
            userId: m.userId,
            isReady: m.isReady,
            isLeader: m.userId === party.leaderId,
            user: byId.get(m.userId) || null,
        })),
    };
}
async function assertFriendship(userId, friendId) {
    const relation = await db_1.prisma.friend.findUnique({
        where: { userId_friendId: { userId, friendId } },
    });
    if (!relation || relation.status !== client_1.FriendStatus.ACCEPTED) {
        throw new errorHandler_1.AppError("Can only invite accepted friends", 400);
    }
}
function resetQueueState(party) {
    if (party.queue.status === "SEARCHING") {
        for (const member of party.members) {
            (0, matchmaking_1.leaveQueue)(member.userId, party.queue.entryFee ?? undefined);
        }
    }
    party.queue = {
        status: "IDLE",
        entryFee: null,
        startedAt: null,
        matchGameId: null,
    };
}
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
router.get("/me", async (req, res, next) => {
    try {
        const userId = req.userId;
        const party = getPartyForUser(userId);
        const pendingInviteIds = [...(invitesByUser.get(userId) || new Set())];
        const pendingInvitesRaw = pendingInviteIds
            .map((id) => invites.get(id))
            .filter((v) => Boolean(v));
        const fromUsers = await db_1.prisma.user.findMany({
            where: { id: { in: pendingInvitesRaw.map((i) => i.fromUserId) } },
            select: { id: true, username: true, avatarPreset: true, avatarUrl: true, isOnline: true },
        });
        const fromById = new Map(fromUsers.map((u) => [u.id, u]));
        res.json({
            party: await buildPartyResponse(party, userId),
            pendingInvites: pendingInvitesRaw.map((inv) => ({
                id: inv.id,
                partyId: inv.partyId,
                createdAt: inv.createdAt,
                from: fromById.get(inv.fromUserId) || null,
            })),
        });
    }
    catch (err) {
        next(err);
    }
});
router.post("/create", async (req, res, next) => {
    try {
        const userId = req.userId;
        const existing = getPartyForUser(userId);
        if (existing) {
            return res.json({ party: await buildPartyResponse(existing, userId) });
        }
        const party = {
            id: crypto_1.default.randomUUID(),
            leaderId: userId,
            members: [{ userId, isReady: true }],
            queue: {
                status: "IDLE",
                entryFee: null,
                startedAt: null,
                matchGameId: null,
            },
            createdAt: new Date(),
        };
        parties.set(party.id, party);
        partyByUser.set(userId, party.id);
        res.json({ success: true, party: await buildPartyResponse(party, userId) });
    }
    catch (err) {
        next(err);
    }
});
router.post("/invite", async (req, res, next) => {
    try {
        const userId = req.userId;
        const friendId = String(req.body.friendId || "");
        if (!friendId)
            throw new errorHandler_1.AppError("friendId is required", 400);
        if (friendId === userId)
            throw new errorHandler_1.AppError("Cannot invite yourself", 400);
        const party = getPartyForUser(userId);
        if (!party)
            throw new errorHandler_1.AppError("Create a party first", 400);
        if (party.leaderId !== userId)
            throw new errorHandler_1.AppError("Only leader can invite", 403);
        if (party.members.length >= MAX_PARTY_SIZE)
            throw new errorHandler_1.AppError("Party is full", 400);
        if (partyByUser.get(friendId))
            throw new errorHandler_1.AppError("Player is already in a party", 400);
        if (party.members.some((m) => m.userId === friendId)) {
            throw new errorHandler_1.AppError("Player is already in your party", 400);
        }
        await assertFriendship(userId, friendId);
        const existingInvite = [...invites.values()].find((inv) => inv.partyId === party.id && inv.toUserId === friendId);
        if (existingInvite)
            throw new errorHandler_1.AppError("Invite already sent", 400);
        const invite = {
            id: crypto_1.default.randomUUID(),
            partyId: party.id,
            fromUserId: userId,
            toUserId: friendId,
            createdAt: new Date(),
        };
        invites.set(invite.id, invite);
        addInviteForUser(friendId, invite.id);
        await (0, userComms_1.createUserNotification)(db_1.prisma, {
            userId: friendId,
            type: "PARTY_INVITE",
            title: "Party Invite",
            message: "You received a party invite from a friend.",
            payload: { inviteId: invite.id, partyId: party.id, fromUserId: userId },
        });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
router.post("/invites/:inviteId/respond", async (req, res, next) => {
    try {
        const userId = req.userId;
        const action = String(req.body.action || "").toUpperCase();
        if (action !== "ACCEPT" && action !== "REJECT") {
            throw new errorHandler_1.AppError("action must be ACCEPT or REJECT", 400);
        }
        const invite = invites.get(req.params.inviteId);
        if (!invite || invite.toUserId !== userId) {
            throw new errorHandler_1.AppError("Invite not found", 404);
        }
        const party = parties.get(invite.partyId);
        removeInvite(invite);
        if (action === "REJECT") {
            return res.json({ success: true });
        }
        if (!party)
            throw new errorHandler_1.AppError("Party no longer exists", 400);
        if (party.members.length >= MAX_PARTY_SIZE)
            throw new errorHandler_1.AppError("Party is full", 400);
        if (partyByUser.get(userId))
            throw new errorHandler_1.AppError("You are already in a party", 400);
        party.members.push({ userId, isReady: true });
        partyByUser.set(userId, party.id);
        await (0, userComms_1.createUserNotification)(db_1.prisma, {
            userId: party.leaderId,
            type: "PARTY_MEMBER_JOINED",
            title: "Party Member Joined",
            message: "A player accepted your party invite.",
            payload: { partyId: party.id, memberUserId: userId },
        });
        res.json({ success: true, party: await buildPartyResponse(party, userId) });
    }
    catch (err) {
        next(err);
    }
});
router.post("/ready", async (req, res, next) => {
    try {
        const userId = req.userId;
        const isReady = Boolean(req.body.isReady);
        const party = getPartyForUser(userId);
        if (!party)
            throw new errorHandler_1.AppError("Party not found", 404);
        const member = party.members.find((m) => m.userId === userId);
        if (!member)
            throw new errorHandler_1.AppError("Party member not found", 404);
        member.isReady = isReady;
        res.json({ success: true, party: await buildPartyResponse(party, userId) });
    }
    catch (err) {
        next(err);
    }
});
router.post("/kick", async (req, res, next) => {
    try {
        const userId = req.userId;
        const memberUserId = String(req.body.userId || "");
        if (!memberUserId)
            throw new errorHandler_1.AppError("userId is required", 400);
        const party = getPartyForUser(userId);
        if (!party)
            throw new errorHandler_1.AppError("Party not found", 404);
        if (party.leaderId !== userId)
            throw new errorHandler_1.AppError("Only leader can kick", 403);
        if (memberUserId === userId)
            throw new errorHandler_1.AppError("Leader cannot kick self", 400);
        const before = party.members.length;
        party.members = party.members.filter((m) => m.userId !== memberUserId);
        if (party.members.length === before)
            throw new errorHandler_1.AppError("Member not found", 404);
        partyByUser.delete(memberUserId);
        resetQueueState(party);
        res.json({ success: true, party: await buildPartyResponse(party, userId) });
    }
    catch (err) {
        next(err);
    }
});
router.post("/leave", async (req, res, next) => {
    try {
        const userId = req.userId;
        const party = getPartyForUser(userId);
        if (!party)
            throw new errorHandler_1.AppError("Party not found", 404);
        if (party.leaderId === userId) {
            if (party.members.length <= 1) {
                disbandParty(party);
                return res.json({ success: true, disbanded: true });
            }
            const remaining = party.members.filter((m) => m.userId !== userId);
            const newLeader = remaining[0];
            party.members = remaining;
            party.leaderId = newLeader.userId;
            partyByUser.delete(userId);
            resetQueueState(party);
            return res.json({ success: true, party: await buildPartyResponse(party, newLeader.userId) });
        }
        party.members = party.members.filter((m) => m.userId !== userId);
        partyByUser.delete(userId);
        resetQueueState(party);
        if (party.members.length === 0) {
            disbandParty(party);
            return res.json({ success: true, disbanded: true });
        }
        res.json({ success: true, party: await buildPartyResponse(party, party.leaderId) });
    }
    catch (err) {
        next(err);
    }
});
router.post("/queue", async (req, res, next) => {
    try {
        const userId = req.userId;
        const entryFee = Number(req.body.entryFee);
        if (!Number.isFinite(entryFee) || entryFee < 0) {
            throw new errorHandler_1.AppError("entryFee is required", 400);
        }
        if (entryFee !== 0) {
            throw new errorHandler_1.AppError("Party queue currently supports Free Table only", 400);
        }
        const party = getPartyForUser(userId);
        if (!party)
            throw new errorHandler_1.AppError("Party not found", 404);
        if (party.leaderId !== userId)
            throw new errorHandler_1.AppError("Only leader can queue the party", 403);
        if (party.members.some((m) => !m.isReady)) {
            throw new errorHandler_1.AppError("All party members must be ready", 400);
        }
        party.queue = {
            status: "SEARCHING",
            entryFee,
            startedAt: new Date(),
            matchGameId: null,
        };
        const joined = [];
        try {
            for (const member of party.members) {
                await (0, matchmaking_1.joinQueue)(member.userId, entryFee, async ({ gameId, playerIds }) => {
                    const currentParty = parties.get(party.id);
                    if (!currentParty)
                        return;
                    const memberIds = new Set(currentParty.members.map((m) => m.userId));
                    const includesPartyMember = playerIds.some((pid) => memberIds.has(pid));
                    if (!includesPartyMember)
                        return;
                    currentParty.queue = {
                        status: "MATCHED",
                        entryFee,
                        startedAt: currentParty.queue.startedAt || new Date(),
                        matchGameId: gameId,
                    };
                });
                joined.push(member.userId);
            }
        }
        catch (error) {
            for (const uid of joined) {
                (0, matchmaking_1.leaveQueue)(uid, entryFee);
            }
            resetQueueState(party);
            throw error;
        }
        res.json({ success: true, party: await buildPartyResponse(party, userId) });
    }
    catch (err) {
        next(err);
    }
});
router.post("/queue/cancel", async (req, res, next) => {
    try {
        const userId = req.userId;
        const party = getPartyForUser(userId);
        if (!party)
            throw new errorHandler_1.AppError("Party not found", 404);
        if (party.leaderId !== userId)
            throw new errorHandler_1.AppError("Only leader can cancel queue", 403);
        resetQueueState(party);
        res.json({ success: true, party: await buildPartyResponse(party, userId) });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
