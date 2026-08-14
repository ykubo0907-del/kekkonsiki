import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export const SESSION_COOKIE = "admin_session";

export interface AdminTokenPayload {
  adminId: number;
  username: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminTokenPayload;
    }
  }
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

export function signAdminToken(payload: AdminTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "12h" });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    return res.status(401).json({ error: "ログインが必要です" });
  }
  try {
    const payload = jwt.verify(token, getJwtSecret()) as AdminTokenPayload;
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: "セッションが無効です。再ログインしてください" });
  }
}
