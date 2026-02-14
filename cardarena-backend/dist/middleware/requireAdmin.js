"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = void 0;
const errorHandler_1 = require("./errorHandler");
const requireAdmin = (req, res, next) => {
    if (req.userRole !== "ADMIN") {
        return next(new errorHandler_1.AppError("Admin access required", 403));
    }
    next();
};
exports.requireAdmin = requireAdmin;
