"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
exports.requireRole = requireRole;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (secret)
        return secret;
    if (process.env.NODE_ENV === "test")
        return "test_secret";
    throw new Error("JWT_SECRET is not defined");
}
const JWT_SECRET = getJwtSecret();
function authMiddleware(req, res, next) {
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
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        // 4️⃣ Attach identity to request
        req.userId = payload.userId;
        req.userRole = payload.role;
        next();
    }
    catch (err) {
        return res.status(401).json({
            error: "Invalid or expired token",
        });
    }
}
function requireRole(requiredRole) {
    return (req, res, next) => {
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
