"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.incMetric = incMetric;
exports.metricsMiddleware = metricsMiddleware;
exports.metricsHandler = metricsHandler;
const counters = new Map();
const startTime = Date.now();
function inc(key, by = 1) {
    counters.set(key, (counters.get(key) ?? 0) + by);
}
function incMetric(key, by = 1) {
    inc(key, by);
}
function metricsMiddleware(req, res, next) {
    inc("http.requests.total");
    inc(`http.requests.method.${req.method}`);
    res.on("finish", () => {
        inc(`http.responses.status.${res.statusCode}`);
    });
    next();
}
function metricsHandler(_req, res) {
    const snapshot = Object.fromEntries(counters.entries());
    res.json({
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
        counters: snapshot,
    });
}
