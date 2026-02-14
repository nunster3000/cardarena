"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = void 0;
const errorHandler_1 = require("./errorHandler");
const requireRole = (...allowedRoles) => {
    return (req, _res, next) => {
        if (!req.userRole) {
            return next(new errorHandler_1.AppError("Unauthorized", 401));
        }
        if (!allowedRoles.includes(req.userRole)) {
            return next(new errorHandler_1.AppError("Forbidden: insufficient permissions", 403));
        }
        next();
    };
};
exports.requireRole = requireRole;
