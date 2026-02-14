import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { AppError } from "./errorHandler";

export const requireRole = (...allowedRoles: string[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.userRole) {
      return next(new AppError("Unauthorized", 401));
    }

    if (!allowedRoles.includes(req.userRole)) {
      return next(new AppError("Forbidden: insufficient permissions", 403));
    }

    next();
  };
};
