import { NextFunction, Response } from "express";
import { AuthRequest } from "./auth";
import { AppError } from "./errorHandler";

export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.userRole !== "ADMIN") {
    return next(new AppError("Admin access required", 403));
  }

  next();
};
