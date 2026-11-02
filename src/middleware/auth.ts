import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface AuthPayload {
  sub: number;
  username: string;
  isAdmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function signToken(payload: AuthPayload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Thiếu token xác thực" });
    return;
  }
  try {
    req.user = jwt.verify(header.slice(7), env.JWT_SECRET) as unknown as AuthPayload;
    next();
  } catch {
    res.status(401).json({ error: "Token không hợp lệ hoặc đã hết hạn" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: "Cần quyền quản trị" });
    return;
  }
  next();
}
