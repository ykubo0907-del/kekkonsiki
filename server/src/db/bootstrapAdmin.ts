import bcrypt from "bcryptjs";
import { db } from "./index.js";

// Railway等でCLIを使わずに初回の管理者アカウントを作れるようにするための起動時ブートストラップ。
// 管理者が1人もいない場合に限り、ADMIN_USERNAME/ADMIN_PASSWORD環境変数からアカウントを作成する。
// 既に管理者が存在する場合は何もしない(誤って上書きしないため)。
export function bootstrapAdminFromEnv() {
  const { ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) return;

  const existing = db.prepare("SELECT COUNT(*) AS count FROM admins").get() as { count: number };
  if (existing.count > 0) return;

  if (ADMIN_PASSWORD.length < 8) {
    console.warn("ADMIN_PASSWORD is too short (min 8 chars) - skipping admin bootstrap");
    return;
  }

  const passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  db.prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)").run(ADMIN_USERNAME, passwordHash);
  console.log(`Bootstrapped initial admin account "${ADMIN_USERNAME}" from environment variables`);
}
