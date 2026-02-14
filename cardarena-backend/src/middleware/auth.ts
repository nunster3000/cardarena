import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  // 1️⃣ Header must exist
  if (!authHeader) {
    return res.status(401).json({
      error: "Missing Authorization header",
    });
  }

  // 2️⃣ Expect "Bearer <token>"
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      error: "Invalid Authorization format",
    });
  }

  try {
    // 3️⃣ Verify token
    const payload = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      role: Role;
      iat: number;
      exp: number;
    };

    // 4️⃣ Attach identity to request
    req.userId = payload.userId;
    req.userRole = payload.role;

    next();
  } catch (err) {
    return res.status(401).json({
      error: "Invalid or expired token",
    });
  }
}
export function requireRole(requiredRole: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userRole) {
      return res.status(403).json({
        error: "Access denied",
      });
    }

    if (req.userRole !== requiredRole) {
      return res.status(403).json({
        error: "Insufficient permissions",
      });
    }

    next();
  };
}

