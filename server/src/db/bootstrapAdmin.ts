import bcrypt from "bcryptjs";
import { db } from "./index.js";

// Railway等でCLIを使わずに初回の管理者アカウントを作れるようにするための起動時ブートストラップ。
// 通常は管理者が1人もいない場合に限り、ADMIN_USERNAME/ADMIN_PASSWORD環境変数からアカウントを作成する。
// ADMIN_FORCE_RESET=true が設定されている場合は、既存の管理者を全て消してから作り直す
// (パスワードを忘れた/間違えて設定した場合の復旧用。確認後は変数を消すこと)。
export function bootstrapAdminFromEnv() {
  const { ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_FORCE_RESET } = process.env;
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) return;

  const existing = db.prepare("SELECT COUNT(*) AS count FROM admins").get() as { count: number };
  if (existing.count > 0 && ADMIN_FORCE_RESET !== "true") return;

  if (ADMIN_PASSWORD.length < 8) {
    console.warn("ADMIN_PASSWORD is too short (min 8 chars) - skipping admin bootstrap");
    return;
  }

  if (existing.count > 0) {
    db.prepare("DELETE FROM admins").run();
    console.log("ADMIN_FORCE_RESET=true: removed existing admin accounts");
  }

  const passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  db.prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)").run(ADMIN_USERNAME, passwordHash);
  console.log(`Bootstrapped initial admin account "${ADMIN_USERNAME}" from environment variables`);
}
