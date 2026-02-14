"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const withdrawalProcessor_1 = require("../config/withdrawalProcessor");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const router = (0, express_1.Router)();
router.post("/run", auth_1.authMiddleware, async (req, res, next) => {
    try {
        if (req.userRole !== "ADMIN") {
            throw new errorHandler_1.AppError("Unauthorized", 403);
        }
        await (0, withdrawalProcessor_1.processPendingWithdrawals)();
        res.json({
            success: true,
            message: "Withdrawal processor executed manually.",
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
