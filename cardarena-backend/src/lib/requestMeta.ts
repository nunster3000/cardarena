import { Request } from "express";

export type RequestMeta = {
  ip: string | null;
  userAgent: string | null;
  device: string | null;
};

export function getRequestMeta(req: Request): RequestMeta {
  const ip = req.ip || null;
  const userAgent = req.get("user-agent") || null;
  const chUaPlatform = req.get("sec-ch-ua-platform");
  const chUaMobile = req.get("sec-ch-ua-mobile");

  const device = [chUaPlatform, chUaMobile, userAgent]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 500);

  return {
    ip,
    userAgent,
    device: device || null,
  };
}

