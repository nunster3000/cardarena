import { Router } from "express";
import { processPendingWithdrawals } from "../config/withdrawalProcessor";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();

router.post("/run", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    if (req.userRole !== "ADMIN") {
      throw new AppError("Unauthorized", 403);
    }

    await processPendingWithdrawals();

    res.json({
      success: true,
      message: "Withdrawal processor executed manually.",
    });
  } catch (err) {
    next(err);
  }
});

export default router;

