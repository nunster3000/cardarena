import { Request, Response, NextFunction } from "express";

type CounterMap = Map<string, number>;

const counters: CounterMap = new Map();
const startTime = Date.now();

function inc(key: string, by = 1) {
  counters.set(key, (counters.get(key) ?? 0) + by);
}

export function incMetric(key: string, by = 1) {
  inc(key, by);
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  inc("http.requests.total");
  inc(`http.requests.method.${req.method}`);

  res.on("finish", () => {
    inc(`http.responses.status.${res.statusCode}`);
  });

  next();
}

export function metricsHandler(_req: Request, res: Response) {
  const snapshot = Object.fromEntries(counters.entries());
  res.json({
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    counters: snapshot,
  });
}
