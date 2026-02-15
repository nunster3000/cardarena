"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const pino_http_1 = __importDefault(require("pino-http"));
const logger_1 = require("./utils/logger");
const health_1 = __importDefault(require("./routes/health"));
const users_1 = __importDefault(require("./routes/users"));
const auth_1 = __importDefault(require("./routes/auth"));
const cards_1 = __importDefault(require("./routes/cards"));
const admin_1 = __importDefault(require("./routes/admin"));
const deposits_1 = __importDefault(require("./routes/deposits"));
const withdrawals_1 = __importDefault(require("./routes/withdrawals"));
const connect_1 = __importDefault(require("./routes/connect"));
const tournaments_1 = __importDefault(require("./routes/tournaments"));
const adminFinance_1 = __importDefault(require("./routes/adminFinance"));
const webhook_1 = __importDefault(require("./routes/webhook"));
const errorHandler_1 = require("./middleware/errorHandler");
exports.app = (0, express_1.default)();
exports.app.use((0, pino_http_1.default)({ logger: logger_1.logger }));
exports.app.use("/api/v1/webhook", express_1.default.raw({ type: "application/json" }), webhook_1.default);
exports.app.use(express_1.default.json());
exports.app.use((0, helmet_1.default)());
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100,
});
exports.app.use(limiter);
exports.app.use("/health", health_1.default);
exports.app.use("/api/v1/users", users_1.default);
exports.app.use("/api/v1/auth", auth_1.default);
exports.app.use("/api/v1/cards", cards_1.default);
exports.app.use("/api/v1/admin", admin_1.default);
exports.app.use("/api/deposits", deposits_1.default);
exports.app.use("/api/v1/withdrawals", withdrawals_1.default);
exports.app.use("/api/connect", connect_1.default);
exports.app.use("/api/v1/tournaments", tournaments_1.default);
exports.app.use("/api/admin/finance", adminFinance_1.default);
exports.app.use(errorHandler_1.errorHandler);
