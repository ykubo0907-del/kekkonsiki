import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { requireAdmin, signAdminToken, SESSION_COOKIE } from "../middleware/auth.js";

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const isProd = process.env.NODE_ENV === "production";

authRouter.post("/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "ユーザー名とパスワードを入力してください" });
  }
  const { username, password } = parsed.data;

  const admin = db
    .prepare("SELECT id, username, password_hash FROM admins WHERE username = ?")
    .get(username) as { id: number; username: string; password_hash: string } | undefined;

  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: "ユーザー名またはパスワードが違います" });
  }

  const token = signAdminToken({ adminId: admin.id, username: admin.username });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    maxAge: 12 * 60 * 60 * 1000,
  });
  res.json({ username: admin.username });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.status(204).end();
});

authRouter.get("/me", requireAdmin, (req, res) => {
  res.json({ username: req.admin!.username });
});
