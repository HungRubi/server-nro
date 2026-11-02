import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";

const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(req: Request, res: Response, next: NextFunction) {
  if (isLimited(hits, req.ip ?? "unknown", env.RATE_LIMIT_WINDOW_MS, env.RATE_LIMIT_MAX)) {
    res.status(429).json({ error: "Quá nhiều yêu cầu, thử lại sau" });
    return;
  }
  next();
}

const loginHits = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX = 10;

export function loginRateLimit(req: Request, res: Response, next: NextFunction) {
  if (isLimited(loginHits, req.ip ?? "unknown", LOGIN_WINDOW_MS, LOGIN_MAX)) {
    res.status(429).json({ error: "Quá nhiều yêu cầu, thử lại sau" });
    return;
  }
  next();
}

function isLimited(
  store: Map<string, { count: number; resetAt: number }>,
  key: string,
  windowMs: number,
  max: number,
) {
  const now = Date.now();
  const slot = store.get(key);

  if (!slot || now > slot.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  slot.count += 1;
  return slot.count > max;
}
